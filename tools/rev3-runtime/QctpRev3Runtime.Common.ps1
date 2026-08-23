Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:QctpRev3Branch = 'qctp-platform-rev3-codex'
$script:QctpRev3IdentityName = 'QCTP_REV3_RUNTIME_IDENTITY.json'
$script:QctpRev3ContentManifestName = 'QCTP_REV3_CONTENT_MANIFEST.json'
$script:QctpRev3PackageManifestName = 'QCTP_REV3_PACKAGE_MANIFEST.json'
$script:QctpRev3BackupManifestName = 'QCTP_REV3_BACKUP_MANIFEST.json'

function Resolve-QctpAbsolutePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$MustExist
    )

    if (-not [IO.Path]::IsPathRooted($Path)) {
        throw "An explicit absolute path is required: $Path"
    }

    $fullPath = [IO.Path]::GetFullPath($Path)
    if ($MustExist) {
        if (-not (Test-Path -LiteralPath $fullPath)) {
            throw "Path does not exist: $fullPath"
        }
        return (Resolve-Path -LiteralPath $fullPath).Path
    }

    $existing = $fullPath
    $suffix = New-Object 'System.Collections.Generic.List[string]'
    while (-not (Test-Path -LiteralPath $existing)) {
        $leaf = Split-Path -Leaf $existing
        if ([string]::IsNullOrWhiteSpace($leaf)) {
            throw "No existing ancestor could be resolved for path: $fullPath"
        }
        $suffix.Insert(0, $leaf)
        $parent = Split-Path -Parent $existing
        if ($parent -eq $existing) {
            throw "No existing ancestor could be resolved for path: $fullPath"
        }
        $existing = $parent
    }

    $resolved = (Resolve-Path -LiteralPath $existing).Path
    foreach ($part in $suffix) {
        $resolved = Join-Path $resolved $part
    }
    return [IO.Path]::GetFullPath($resolved)
}

function Test-QctpPathWithin {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root,
        [switch]$AllowEqual
    )

    $candidate = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $boundary = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if ($AllowEqual -and $candidate.Equals($boundary, [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    return $candidate.StartsWith(
        "$boundary$([IO.Path]::DirectorySeparatorChar)",
        [StringComparison]::OrdinalIgnoreCase
    )
}

function Assert-QctpDistinctRoots {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$First,
        [Parameter(Mandatory = $true)][string]$Second,
        [Parameter(Mandatory = $true)][string]$Relationship
    )

    if (
        (Test-QctpPathWithin -Path $First -Root $Second -AllowEqual) -or
        (Test-QctpPathWithin -Path $Second -Root $First -AllowEqual)
    ) {
        throw "$Relationship must be separate paths. First: $First Second: $Second"
    }
}

function Write-QctpJsonFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        throw "JSON destination parent does not exist: $parent"
    }
    $encoding = New-Object System.Text.UTF8Encoding($false)
    $json = $Value | ConvertTo-Json -Depth 12
    [IO.File]::WriteAllText($Path, "$json`n", $encoding)
}

function Get-QctpSha256 {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-QctpStringSha256 {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Value)

    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

function Get-QctpTreeEntries {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [string[]]$ExcludeRelativePaths = @()
    )

    $resolvedRoot = Resolve-QctpAbsolutePath -Path $Root -MustExist
    if (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container)) {
        throw "Tree root is not a directory: $resolvedRoot"
    }
    $rootItem = Get-Item -LiteralPath $resolvedRoot -Force
    if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Runtime tree root may not be a link or other reparse point: $resolvedRoot"
    }

    $excluded = @{}
    foreach ($relativePath in $ExcludeRelativePaths) {
        $excluded[$relativePath.Replace('\', '/').TrimStart('/').ToLowerInvariant()] = $true
    }

    $reparsePoints = @(
        Get-ChildItem -LiteralPath $resolvedRoot -Force -Recurse -ErrorAction Stop |
            Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }
    )
    if ($reparsePoints.Count -gt 0) {
        throw "Runtime trees may not contain links or other reparse points: $($reparsePoints[0].FullName)"
    }

    $entries = New-Object 'System.Collections.Generic.List[object]'
    foreach ($file in @(Get-ChildItem -LiteralPath $resolvedRoot -File -Force -Recurse | Sort-Object FullName)) {
        $relative = [IO.Path]::GetRelativePath($resolvedRoot, $file.FullName).Replace('\', '/')
        if ($excluded.ContainsKey($relative.ToLowerInvariant())) {
            continue
        }
        $entries.Add([ordered]@{
            path = $relative
            bytes = [int64]$file.Length
            sha256 = Get-QctpSha256 -Path $file.FullName
        })
    }
    return @($entries | Sort-Object { $_.path })
}

function New-QctpTreeManifestObject {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Schema,
        [Parameter(Mandatory = $true)][string]$CandidateSha,
        [string[]]$ExcludeRelativePaths = @()
    )

    $files = @(Get-QctpTreeEntries -Root $Root -ExcludeRelativePaths $ExcludeRelativePaths)
    $totalBytes = [int64]0
    foreach ($file in $files) {
        $totalBytes += [int64]$file.bytes
    }
    return [ordered]@{
        schema = $Schema
        hashAlgorithm = 'SHA-256'
        candidateSha = $CandidateSha.ToLowerInvariant()
        fileCount = $files.Count
        totalBytes = $totalBytes
        files = $files
    }
}

function Assert-QctpTreeManifest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)]$Manifest,
        [Parameter(Mandatory = $true)][string]$ExpectedSchema,
        [string[]]$ExcludeRelativePaths = @()
    )

    if ([string]$Manifest.schema -ne $ExpectedSchema) {
        throw "Unexpected manifest schema. Expected $ExpectedSchema; found $($Manifest.schema)."
    }
    if ([string]$Manifest.hashAlgorithm -ne 'SHA-256') {
        throw "Runtime manifest must use SHA-256."
    }

    $actual = @(Get-QctpTreeEntries -Root $Root -ExcludeRelativePaths $ExcludeRelativePaths)
    $expected = @($Manifest.files)
    if ($actual.Count -ne [int]$Manifest.fileCount -or $expected.Count -ne [int]$Manifest.fileCount) {
        throw "Runtime file-count mismatch. Manifest: $($Manifest.fileCount); expected records: $($expected.Count); actual: $($actual.Count)."
    }

    $actualByPath = @{}
    $actualTotal = [int64]0
    foreach ($record in $actual) {
        $key = ([string]$record.path).ToLowerInvariant()
        if ($actualByPath.ContainsKey($key)) {
            throw "Duplicate runtime path after case normalization: $($record.path)"
        }
        $actualByPath[$key] = $record
        $actualTotal += [int64]$record.bytes
    }

    $expectedByPath = @{}
    foreach ($record in $expected) {
        $path = ([string]$record.path).Replace('\', '/').TrimStart('/')
        if ($path -match '(^|/)\.\.($|/)') {
            throw "Manifest path escapes its runtime tree: $path"
        }
        $key = $path.ToLowerInvariant()
        if ($expectedByPath.ContainsKey($key)) {
            throw "Manifest contains a duplicate path after case normalization: $path"
        }
        $expectedByPath[$key] = $true
        if (-not $actualByPath.ContainsKey($key)) {
            throw "Manifested runtime file is missing: $path"
        }
        $found = $actualByPath[$key]
        if ([int64]$found.bytes -ne [int64]$record.bytes) {
            throw "Runtime byte-count mismatch: $path"
        }
        if ([string]$found.sha256 -ne ([string]$record.sha256).ToLowerInvariant()) {
            throw "Runtime SHA-256 mismatch: $path"
        }
    }

    if ($expectedByPath.Count -ne $actualByPath.Count) {
        throw 'Runtime manifest does not enumerate the exact file set.'
    }

    if ($actualTotal -ne [int64]$Manifest.totalBytes) {
        throw "Runtime total byte-count mismatch. Manifest: $($Manifest.totalBytes); actual: $actualTotal."
    }
    return $true
}

function Get-QctpRejectedA03Hashes {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $quarantine = Join-Path $RepositoryRoot 'controlled-artifacts\a03r-rejected'
    if (-not (Test-Path -LiteralPath $quarantine -PathType Container)) {
        throw "The controlled A03R quarantine is missing: $quarantine"
    }
    $hashes = @{}
    foreach ($file in @(Get-ChildItem -LiteralPath $quarantine -File -Recurse -Force)) {
        $hashes[(Get-QctpSha256 -Path $file.FullName)] = $file.FullName
    }
    if ($hashes.Count -eq 0) {
        throw "The controlled A03R quarantine contains no hashable artifacts."
    }
    return $hashes
}

function Assert-QctpNoRejectedA03Assets {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SiteRoot,
        [Parameter(Mandatory = $true)][hashtable]$RejectedHashes
    )

    $pathPatterns = @(
        '(^|/)a03-acceptance(/|$)',
        '(^|/)a03r-rejected(/|$)',
        '(^|/)audio/day1-source-rev0/voice-1500\.mp3$',
        '(^|/)audio/day1-source-rev0/composite-ambient-low-1500\.mp3$',
        '(^|/)audio/day1-source-rev0/(critical-asr|gate-summary|machine-verification|manifest)\.json$'
    )

    foreach ($record in @(Get-QctpTreeEntries -Root $SiteRoot)) {
        $path = ([string]$record.path).Replace('\', '/')
        foreach ($pattern in $pathPatterns) {
            if ($path -match $pattern) {
                throw "Rejected A03R path is present in the runtime site: $path"
            }
        }
        $hash = ([string]$record.sha256).ToLowerInvariant()
        if ($RejectedHashes.ContainsKey($hash)) {
            throw "A quarantined A03R artifact was copied into the runtime as $path. Quarantine source: $($RejectedHashes[$hash])"
        }
    }
    return $true
}

function Assert-QctpSameOriginEntryDocument {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$SiteRoot)

    $indexPath = Join-Path $SiteRoot 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        throw "Runtime site is missing index.html."
    }
    $index = Get-Content -LiteralPath $indexPath -Raw
    if ($index -match '(?is)<(?:script|link|audio|video|source)[^>]+(?:src|href)\s*=\s*["''](?:https?:)?//') {
        throw "The runtime entry document contains an external executable or media dependency."
    }
    if ($index -match '(?i)api\.openai\.com|OPENAI_API_KEY|sk-(?:proj-)?[A-Za-z0-9_-]{12,}') {
        throw "The runtime entry document contains a paid-cloud or secret-shaped critical path."
    }
    return $true
}

function New-QctpRev3CandidateMetadata {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$CandidateDirectory,
        [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$CandidateSha,
        [Parameter(Mandatory = $true)][hashtable]$RejectedHashes
    )

    $candidate = Resolve-QctpAbsolutePath -Path $CandidateDirectory -MustExist
    $site = Join-Path $candidate 'site'
    if (-not (Test-Path -LiteralPath $site -PathType Container)) {
        throw "Candidate package is missing its site directory: $site"
    }
    foreach ($reserved in @($script:QctpRev3IdentityName, $script:QctpRev3ContentManifestName)) {
        if (Test-Path -LiteralPath (Join-Path $site $reserved)) {
            throw "The source distribution already contains reserved runtime metadata: $reserved"
        }
    }
    if (Test-Path -LiteralPath (Join-Path $candidate $script:QctpRev3PackageManifestName)) {
        throw "The candidate package already contains reserved package metadata."
    }

    Assert-QctpNoRejectedA03Assets -SiteRoot $site -RejectedHashes $RejectedHashes | Out-Null
    Assert-QctpSameOriginEntryDocument -SiteRoot $site | Out-Null

    $contentManifest = New-QctpTreeManifestObject `
        -Root $site `
        -Schema 'qctp-rev3-runtime-content-manifest-v1' `
        -CandidateSha $CandidateSha
    $contentManifestPath = Join-Path $site $script:QctpRev3ContentManifestName
    Write-QctpJsonFile -Value $contentManifest -Path $contentManifestPath
    $contentManifestHash = Get-QctpSha256 -Path $contentManifestPath

    $identity = [ordered]@{
        schema = 'qctp-rev3-runtime-identity-v1'
        candidateSha = $CandidateSha.ToLowerInvariant()
        sourceBranch = $script:QctpRev3Branch
        packageKind = 'PRIVATE_PREVIEW_CANDIDATE'
        releaseAuthority = 'ZERO_RELEASE'
        contentManifestPath = "/$script:QctpRev3ContentManifestName"
        contentManifestSha256 = $contentManifestHash
        contentFileCount = [int]$contentManifest.fileCount
        contentTotalBytes = [int64]$contentManifest.totalBytes
        a03rRejectedAssetsPresent = $false
        rejectedA03HashCount = $RejectedHashes.Count
        externalMediaCriticalPath = $false
        paidApiKeyRequired = $false
        paidCloudCriticalPath = $false
        installRequiresExplicitOptIn = $true
        publicDeploymentAuthorized = $false
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $identityPath = Join-Path $site $script:QctpRev3IdentityName
    Write-QctpJsonFile -Value $identity -Path $identityPath

    $packageManifest = New-QctpTreeManifestObject `
        -Root $candidate `
        -Schema 'qctp-rev3-runtime-package-manifest-v1' `
        -CandidateSha $CandidateSha
    $packageManifestPath = Join-Path $candidate $script:QctpRev3PackageManifestName
    Write-QctpJsonFile -Value $packageManifest -Path $packageManifestPath

    return [PSCustomObject]@{
        CandidateDirectory = $candidate
        SiteRoot = $site
        IdentityPath = $identityPath
        IdentitySha256 = Get-QctpSha256 -Path $identityPath
        ContentManifestPath = $contentManifestPath
        ContentManifestSha256 = $contentManifestHash
        PackageManifestPath = $packageManifestPath
        PackageManifestSha256 = Get-QctpSha256 -Path $packageManifestPath
        FileCount = [int]$contentManifest.fileCount
        TotalBytes = [int64]$contentManifest.totalBytes
    }
}

function Assert-QctpRev3CandidateSite {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SiteRoot,
        [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedHead,
        [hashtable]$RejectedHashes
    )

    $site = Resolve-QctpAbsolutePath -Path $SiteRoot -MustExist
    $identityPath = Join-Path $site $script:QctpRev3IdentityName
    $contentManifestPath = Join-Path $site $script:QctpRev3ContentManifestName
    foreach ($required in @($identityPath, $contentManifestPath, (Join-Path $site 'index.html'))) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Candidate site is missing required file: $required"
        }
    }

    $identity = Get-Content -LiteralPath $identityPath -Raw | ConvertFrom-Json
    if ([string]$identity.schema -ne 'qctp-rev3-runtime-identity-v1') {
        throw "Unexpected Rev3 runtime identity schema: $($identity.schema)"
    }
    if ([string]$identity.candidateSha -ne $ExpectedHead.ToLowerInvariant()) {
        throw "Runtime identity SHA does not match the requested candidate head."
    }
    if ([string]$identity.sourceBranch -ne $script:QctpRev3Branch) {
        throw "Runtime identity is not sourced from $script:QctpRev3Branch."
    }
    if (
        [string]$identity.packageKind -ne 'PRIVATE_PREVIEW_CANDIDATE' -or
        [string]$identity.contentManifestPath -ne "/$script:QctpRev3ContentManifestName"
    ) {
        throw 'Runtime identity does not describe the controlled private candidate package.'
    }
    foreach ($propertyName in @(
        'publicDeploymentAuthorized',
        'a03rRejectedAssetsPresent',
        'externalMediaCriticalPath',
        'paidApiKeyRequired',
        'paidCloudCriticalPath'
    )) {
        $property = $identity.PSObject.Properties[$propertyName]
        if ($null -eq $property -or $property.Value -isnot [bool] -or [bool]$property.Value) {
            throw "Runtime identity policy field must be the boolean false: $propertyName"
        }
    }
    $optInProperty = $identity.PSObject.Properties['installRequiresExplicitOptIn']
    if ($null -eq $optInProperty -or $optInProperty.Value -isnot [bool] -or -not [bool]$optInProperty.Value) {
        throw 'Runtime identity must require explicit install opt-in.'
    }
    if (
        [string]$identity.releaseAuthority -ne 'ZERO_RELEASE' -or
        [bool]$identity.publicDeploymentAuthorized -or
        [bool]$identity.a03rRejectedAssetsPresent -or
        [bool]$identity.externalMediaCriticalPath -or
        [bool]$identity.paidApiKeyRequired -or
        [bool]$identity.paidCloudCriticalPath -or
        -not [bool]$identity.installRequiresExplicitOptIn
    ) {
        throw "Runtime identity violates the Rev3 ZERO_RELEASE/private/local-only policy."
    }

    $manifestHash = Get-QctpSha256 -Path $contentManifestPath
    if ($manifestHash -ne ([string]$identity.contentManifestSha256).ToLowerInvariant()) {
        throw "Runtime content-manifest SHA-256 does not match its served identity."
    }
    $manifest = Get-Content -LiteralPath $contentManifestPath -Raw | ConvertFrom-Json
    if ([string]$manifest.candidateSha -ne $ExpectedHead.ToLowerInvariant()) {
        throw 'Runtime content manifest is not bound to the expected candidate SHA.'
    }
    Assert-QctpTreeManifest `
        -Root $site `
        -Manifest $manifest `
        -ExpectedSchema 'qctp-rev3-runtime-content-manifest-v1' `
        -ExcludeRelativePaths @($script:QctpRev3IdentityName, $script:QctpRev3ContentManifestName) | Out-Null
    if (
        [int]$identity.contentFileCount -ne [int]$manifest.fileCount -or
        [int64]$identity.contentTotalBytes -ne [int64]$manifest.totalBytes
    ) {
        throw "Runtime identity content totals do not match the content manifest."
    }
    Assert-QctpSameOriginEntryDocument -SiteRoot $site | Out-Null
    if ($null -ne $RejectedHashes) {
        Assert-QctpNoRejectedA03Assets -SiteRoot $site -RejectedHashes $RejectedHashes | Out-Null
    }
    return $identity
}

function Assert-QctpRev3CandidatePackage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$CandidateDirectory,
        [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedHead,
        [hashtable]$RejectedHashes
    )

    $candidate = Resolve-QctpAbsolutePath -Path $CandidateDirectory -MustExist
    $manifestPath = Join-Path $candidate $script:QctpRev3PackageManifestName
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Candidate package manifest is missing: $manifestPath"
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ([string]$manifest.candidateSha -ne $ExpectedHead.ToLowerInvariant()) {
        throw "Package manifest SHA does not match the requested candidate head."
    }
    Assert-QctpTreeManifest `
        -Root $candidate `
        -Manifest $manifest `
        -ExpectedSchema 'qctp-rev3-runtime-package-manifest-v1' `
        -ExcludeRelativePaths @($script:QctpRev3PackageManifestName) | Out-Null
    return Assert-QctpRev3CandidateSite `
        -SiteRoot (Join-Path $candidate 'site') `
        -ExpectedHead $ExpectedHead `
        -RejectedHashes $RejectedHashes
}

function Assert-QctpRev3SourceIdentity {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedHead
    )

    $repo = Resolve-QctpAbsolutePath -Path $RepositoryRoot -MustExist
    if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) {
        throw "QCTP source is not a Git worktree: $repo"
    }

    $branch = (& git -C $repo branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne $script:QctpRev3Branch) {
        throw "Expected exact source branch $script:QctpRev3Branch; found $branch."
    }
    $head = (& git -C $repo rev-parse HEAD).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedHead.ToLowerInvariant()) {
        throw "Expected exact source head $ExpectedHead; found $head."
    }
    $originHead = (& git -C $repo rev-parse "origin/$script:QctpRev3Branch").Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $originHead -ne $head) {
        throw "Source head is not aligned to origin/$script:QctpRev3Branch. Local: $head Origin: $originHead"
    }
    $dirty = ((& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $dirty.Length -gt 0) {
        throw "Rev3 runtime staging requires a clean source worktree. Preserve and commit work first.`n$dirty"
    }
    return [PSCustomObject]@{
        Branch = $branch
        Head = $head
        OriginHead = $originHead
        Clean = $true
    }
}

function Remove-QctpOwnedTemporaryTree {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$OwnerRoot,
        [Parameter(Mandatory = $true)][string]$RequiredLeafPrefix
    )

    $target = Resolve-QctpAbsolutePath -Path $Path -MustExist
    $owner = Resolve-QctpAbsolutePath -Path $OwnerRoot -MustExist
    $leaf = Split-Path -Leaf $target
    if (
        -not (Test-QctpPathWithin -Path $target -Root $owner) -or
        -not $leaf.StartsWith($RequiredLeafPrefix, [StringComparison]::Ordinal)
    ) {
        throw "Refusing to remove a path that is not a verified QCTP-owned temporary tree: $target"
    }
    Remove-Item -LiteralPath $target -Recurse -Force
}
