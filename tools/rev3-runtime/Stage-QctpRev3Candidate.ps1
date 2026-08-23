[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedHead,

    [Parameter(Mandatory = $true)]
    [string]$CandidateRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'QctpRev3Runtime.Common.ps1')

function Invoke-QctpCheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code $($LASTEXITCODE): $Command $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Assert-QctpCommittedLocalAudioPack {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $audioRoot = Join-Path $RepositoryRoot 'public\audio\day1'
    $manifestPath = Join-Path $audioRoot 'manifest.json'
    $sourcePath = Join-Path $RepositoryRoot 'src\foundation\day1.ts'
    if (
        -not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $sourcePath -PathType Leaf)
    ) {
        throw 'The committed same-origin Foundation audio pack is incomplete.'
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $source = Get-Content -LiteralPath $sourcePath -Raw
    $files = @($manifest.files)
    if (
        [string]$manifest.schema -ne 'qctp-day1-local-audio-pack-v2' -or
        [int]$manifest.fileCount -ne 23 -or
        $files.Count -ne 23
    ) {
        throw 'The committed same-origin Foundation audio manifest is not the exact 23-file v2 package.'
    }
    foreach ($record in $files) {
        $relative = ([string]$record.relativePath).Replace('/', '\')
        if (
            [IO.Path]::IsPathRooted($relative) -or
            $relative -match '(^|\\)\.\.(\\|$)' -or
            -not ([string]$record.runtimeUrl).StartsWith('/audio/day1/', [StringComparison]::Ordinal) -or
            $source.IndexOf([string]$record.sourceUrl, [StringComparison]::Ordinal) -lt 0
        ) {
            throw "Invalid or ungrounded local Foundation audio record: $($record.id)"
        }
        $path = Join-Path $audioRoot $relative
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Committed local Foundation audio is missing: $relative"
        }
        if (
            (Get-Item -LiteralPath $path).Length -ne [int64]$record.bytes -or
            (Get-QctpSha256 -Path $path) -ne ([string]$record.sha256).ToLowerInvariant()
        ) {
            throw "Committed local Foundation audio failed its checksum: $relative"
        }
    }
}

$repoRoot = Resolve-QctpAbsolutePath -Path (Join-Path $PSScriptRoot '..\..') -MustExist
$candidateRootPath = Resolve-QctpAbsolutePath -Path $CandidateRoot
Assert-QctpDistinctRoots `
    -First $repoRoot `
    -Second $candidateRootPath `
    -Relationship 'The candidate root and the QCTP source repository'

Write-Host 'Fetching the controlled Rev3 branch before exact-head verification.' -ForegroundColor Cyan
Invoke-QctpCheckedCommand `
    -Command 'git' `
    -Arguments @('fetch', '--no-tags', 'origin', $script:QctpRev3Branch) `
    -WorkingDirectory $repoRoot
$sourceIdentity = Assert-QctpRev3SourceIdentity `
    -RepositoryRoot $repoRoot `
    -ExpectedHead $ExpectedHead

if (-not (Test-Path -LiteralPath $candidateRootPath)) {
    New-Item -ItemType Directory -Path $candidateRootPath | Out-Null
}
$candidateRootPath = Resolve-QctpAbsolutePath -Path $candidateRootPath -MustExist

$candidateDirectory = Join-Path $candidateRootPath "qctp-rev3-$($ExpectedHead.ToLowerInvariant())"
if (Test-Path -LiteralPath $candidateDirectory) {
    throw "Immutable candidate destination already exists: $candidateDirectory"
}

$stageRoot = Join-Path $candidateRootPath ".qctp-rev3-stage-$([Guid]::NewGuid().ToString('N'))"
$stageRepo = Join-Path $stageRoot 'source'
$packageWork = Join-Path $stageRoot 'package'
$stageCompleted = $false
$environmentBackup = @{}

try {
    New-Item -ItemType Directory -Path $stageRoot | Out-Null

    Write-Host 'Creating an isolated clone for the exact Rev3 head.' -ForegroundColor Cyan
    Invoke-QctpCheckedCommand `
        -Command 'git' `
        -Arguments @('clone', '--no-hardlinks', '--no-checkout', $repoRoot, $stageRepo) `
        -WorkingDirectory $stageRoot
    Invoke-QctpCheckedCommand `
        -Command 'git' `
        -Arguments @('-C', $stageRepo, 'checkout', '--detach', $ExpectedHead) `
        -WorkingDirectory $stageRoot
    $isolatedHead = (& git -C $stageRepo rev-parse HEAD).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $isolatedHead -ne $ExpectedHead.ToLowerInvariant()) {
        throw "The isolated build checkout is not the requested head."
    }

    foreach ($name in @(
        'OPENAI_API_KEY',
        'QCTP_BUILD_CANDIDATE_SHA',
        'QCTP_ENABLE_PAID_CLOUD',
        'QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD',
        'QCTP_TRANSCRIPTION_PROVIDER'
    )) {
        $environmentBackup[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    [Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $null, 'Process')
    [Environment]::SetEnvironmentVariable('QCTP_BUILD_CANDIDATE_SHA', $ExpectedHead.ToLowerInvariant(), 'Process')
    [Environment]::SetEnvironmentVariable('QCTP_ENABLE_PAID_CLOUD', 'false', 'Process')
    [Environment]::SetEnvironmentVariable('QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD', '0', 'Process')
    [Environment]::SetEnvironmentVariable('QCTP_TRANSCRIPTION_PROVIDER', 'local', 'Process')

    Write-Host 'Installing locked dependencies inside the isolated clone.' -ForegroundColor Cyan
    Invoke-QctpCheckedCommand `
        -Command 'npm' `
        -Arguments @('ci', '--no-audit', '--no-fund') `
        -WorkingDirectory $stageRepo

    Write-Host 'Failing closed unless the committed Foundation media already verifies locally.' -ForegroundColor Cyan
    Assert-QctpCommittedLocalAudioPack -RepositoryRoot $stageRepo

    Write-Host 'Running the repository verification and production-build gate.' -ForegroundColor Cyan
    Invoke-QctpCheckedCommand `
        -Command 'npm' `
        -Arguments @('run', 'check') `
        -WorkingDirectory $stageRepo

    $dist = Join-Path $stageRepo 'dist'
    $builtIndexPath = Join-Path $dist 'index.html'
    if (-not (Test-Path -LiteralPath $builtIndexPath -PathType Leaf)) {
        throw "The exact-head build did not create dist\index.html."
    }
    $builtIndex = Get-Content -LiteralPath $builtIndexPath -Raw
    $candidateMarkerPattern = '(?is)<meta\s+name=["'']qctp-candidate-sha["'']\s+content=["'']' +
        [regex]::Escape($ExpectedHead.ToLowerInvariant()) + '["'']\s*/?>'
    if ($builtIndex -notmatch $candidateMarkerPattern) {
        throw 'The exact-head build did not embed its candidate SHA in the PWA entry document.'
    }

    New-Item -ItemType Directory -Path $packageWork | Out-Null
    Copy-Item -LiteralPath $dist -Destination (Join-Path $packageWork 'site') -Recurse

    $rejectedHashes = Get-QctpRejectedA03Hashes -RepositoryRoot $stageRepo
    $metadata = New-QctpRev3CandidateMetadata `
        -CandidateDirectory $packageWork `
        -CandidateSha $ExpectedHead `
        -RejectedHashes $rejectedHashes
    Assert-QctpRev3CandidatePackage `
        -CandidateDirectory $packageWork `
        -ExpectedHead $ExpectedHead `
        -RejectedHashes $rejectedHashes | Out-Null

    Move-Item -LiteralPath $packageWork -Destination $candidateDirectory
    $stageCompleted = $true

    Write-Host ''
    Write-Host 'QCTP REV3 PRIVATE CANDIDATE STAGING: PASS' -ForegroundColor Green
    Write-Host "Branch: $($sourceIdentity.Branch)"
    Write-Host "Candidate SHA: $($sourceIdentity.Head)"
    Write-Host "Candidate package: $candidateDirectory"
    Write-Host "Content files: $($metadata.FileCount)"
    Write-Host "Content bytes: $($metadata.TotalBytes)"
    Write-Host "Content manifest SHA-256: $($metadata.ContentManifestSha256)"
    Write-Host "Package manifest SHA-256: $($metadata.PackageManifestSha256)"
    Write-Host 'Release authority: ZERO_RELEASE'
}
catch {
    Write-Host ''
    Write-Host 'QCTP REV3 PRIVATE CANDIDATE STAGING: FAILED' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if (Test-Path -LiteralPath $stageRoot) {
        Write-Host "Preserved failed isolated stage for diagnosis: $stageRoot" -ForegroundColor Yellow
    }
    throw
}
finally {
    foreach ($name in $environmentBackup.Keys) {
        [Environment]::SetEnvironmentVariable($name, $environmentBackup[$name], 'Process')
    }
    if ($stageCompleted -and (Test-Path -LiteralPath $stageRoot)) {
        Remove-QctpOwnedTemporaryTree `
            -Path $stageRoot `
            -OwnerRoot $candidateRootPath `
            -RequiredLeafPrefix '.qctp-rev3-stage-'
        Write-Host "Removed verified temporary build tree: $stageRoot" -ForegroundColor DarkGray
    }
}
