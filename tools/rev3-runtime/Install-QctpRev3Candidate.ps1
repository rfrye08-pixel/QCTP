[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CandidateDirectory,
    [Parameter(Mandatory = $true)][string]$LiveRoot,
    [Parameter(Mandatory = $true)][string]$BackupRoot,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedHead,

    [switch]$InstallPrivatePreview,
    [switch]$ConfirmZeroRelease,
    [switch]$AllowWorktreeDist
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'QctpRev3Runtime.Common.ps1')

if (-not $InstallPrivatePreview -or -not $ConfirmZeroRelease) {
    throw 'Installation is disabled unless both -InstallPrivatePreview and -ConfirmZeroRelease are supplied explicitly.'
}

$repoRoot = Resolve-QctpAbsolutePath -Path (Join-Path $PSScriptRoot '..\..') -MustExist
$candidate = Resolve-QctpAbsolutePath -Path $CandidateDirectory -MustExist
$live = Resolve-QctpAbsolutePath -Path $LiveRoot -MustExist
$backupRootPath = Resolve-QctpAbsolutePath -Path $BackupRoot

if (-not (Test-Path -LiteralPath $live -PathType Container)) {
    throw "Live root is not a directory: $live"
}
if (-not (Test-Path -LiteralPath (Join-Path $live 'index.html') -PathType Leaf)) {
    throw "Live root does not contain index.html: $live"
}

Assert-QctpDistinctRoots -First $candidate -Second $live -Relationship 'Candidate package and live root'
Assert-QctpDistinctRoots -First $candidate -Second $backupRootPath -Relationship 'Candidate package and backup root'
Assert-QctpDistinctRoots -First $live -Second $backupRootPath -Relationship 'Live root and backup root'

if (Test-QctpPathWithin -Path $live -Root $repoRoot -AllowEqual) {
    $worktreeDist = Join-Path $repoRoot 'dist'
    if (
        -not $AllowWorktreeDist -or
        -not $live.Equals($worktreeDist, [StringComparison]::OrdinalIgnoreCase)
    ) {
        throw 'Refusing to modify a path inside the source worktree. The exact gitignored worktree dist requires the additional -AllowWorktreeDist switch.'
    }
}

if (
    [IO.Path]::GetPathRoot($live).ToLowerInvariant() -ne
    [IO.Path]::GetPathRoot($backupRootPath).ToLowerInvariant()
) {
    throw 'Atomic install requires the live root and backup root to be on the same filesystem volume.'
}

$rejectedHashes = Get-QctpRejectedA03Hashes -RepositoryRoot $repoRoot
$candidateIdentity = Assert-QctpRev3CandidatePackage `
    -CandidateDirectory $candidate `
    -ExpectedHead $ExpectedHead `
    -RejectedHashes $rejectedHashes

if (-not (Test-Path -LiteralPath $backupRootPath)) {
    New-Item -ItemType Directory -Path $backupRootPath | Out-Null
}
$backupRootPath = Resolve-QctpAbsolutePath -Path $backupRootPath -MustExist

$liveParent = Split-Path -Parent $live
$liveLeaf = Split-Path -Leaf $live
$nonce = [Guid]::NewGuid().ToString('N')
$nextRoot = Join-Path $liveParent ".$liveLeaf.qctp-rev3-next-$nonce"
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupDirectory = Join-Path $backupRootPath "backup-$timestamp-before-$($ExpectedHead.Substring(0, 12))-$($nonce.Substring(0, 8))"
$backupSite = Join-Path $backupDirectory 'site'

if (
    (Test-Path -LiteralPath $nextRoot) -or
    (Test-Path -LiteralPath $backupDirectory)
) {
    throw 'A generated install staging or backup destination unexpectedly already exists.'
}

$oldTree = New-QctpTreeManifestObject `
    -Root $live `
    -Schema 'qctp-rev3-runtime-backup-tree-v1' `
    -CandidateSha '0000000000000000000000000000000000000000'
$oldTreeCheck = New-QctpTreeManifestObject `
    -Root $live `
    -Schema 'qctp-rev3-runtime-backup-tree-v1' `
    -CandidateSha '0000000000000000000000000000000000000000'
if (($oldTree | ConvertTo-Json -Depth 12) -ne ($oldTreeCheck | ConvertTo-Json -Depth 12)) {
    throw 'The live root changed during install preflight; no files were changed.'
}

Write-Host 'Copying and verifying the candidate beside the live root before the swap.' -ForegroundColor Cyan
Copy-Item -LiteralPath (Join-Path $candidate 'site') -Destination $nextRoot -Recurse
Assert-QctpRev3CandidateSite `
    -SiteRoot $nextRoot `
    -ExpectedHead $ExpectedHead `
    -RejectedHashes $rejectedHashes | Out-Null
Assert-QctpTreeManifest `
    -Root $live `
    -Manifest $oldTree `
    -ExpectedSchema 'qctp-rev3-runtime-backup-tree-v1' | Out-Null

$backupManifest = [ordered]@{
    schema = 'qctp-rev3-runtime-backup-manifest-v1'
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    liveRoot = $live
    installedCandidateSha = $ExpectedHead.ToLowerInvariant()
    installedIdentitySha256 = Get-QctpSha256 -Path (Join-Path $nextRoot $script:QctpRev3IdentityName)
    releaseAuthority = 'ZERO_RELEASE'
    serviceRestarted = $false
    routeModified = $false
    previousTree = $oldTree
}
$backupManifestPath = Join-Path $backupDirectory $script:QctpRev3BackupManifestName

New-Item -ItemType Directory -Path $backupDirectory | Out-Null
$oldMoved = $false
$newMoved = $false
try {
    Move-Item -LiteralPath $live -Destination $backupSite
    $oldMoved = $true
    Assert-QctpTreeManifest `
        -Root $backupSite `
        -Manifest $oldTree `
        -ExpectedSchema 'qctp-rev3-runtime-backup-tree-v1' | Out-Null
    Write-QctpJsonFile -Value $backupManifest -Path $backupManifestPath
    Move-Item -LiteralPath $nextRoot -Destination $live
    $newMoved = $true
}
catch {
    if ($oldMoved -and -not $newMoved -and -not (Test-Path -LiteralPath $live) -and (Test-Path -LiteralPath $backupSite)) {
        Move-Item -LiteralPath $backupSite -Destination $live
    }
    throw "Atomic install swap failed; the previous live root was restored when possible. $($_.Exception.Message)"
}

try {
    Assert-QctpRev3CandidateSite `
        -SiteRoot $live `
        -ExpectedHead $ExpectedHead `
        -RejectedHashes $rejectedHashes | Out-Null
}
catch {
    $failedSite = Join-Path $backupDirectory 'failed-candidate-site'
    if ((Test-Path -LiteralPath $live) -and -not (Test-Path -LiteralPath $failedSite)) {
        Move-Item -LiteralPath $live -Destination $failedSite
    }
    if (-not (Test-Path -LiteralPath $live) -and (Test-Path -LiteralPath $backupSite)) {
        Move-Item -LiteralPath $backupSite -Destination $live
    }
    throw "Post-swap verification failed; the previous live root was restored and the failed candidate was retained. $($_.Exception.Message)"
}

Write-Host ''
Write-Host 'QCTP REV3 PRIVATE RUNTIME INSTALL: PASS' -ForegroundColor Green
Write-Host "Installed candidate: $($candidateIdentity.candidateSha)"
Write-Host "Live root: $live"
Write-Host "Recoverable backup: $backupDirectory"
Write-Host "Backup manifest SHA-256: $(Get-QctpSha256 -Path $backupManifestPath)"
Write-Host 'No process, scheduled task, Tailscale route, Funnel, or public deployment was changed.'
Write-Host 'Release authority: ZERO_RELEASE'
