[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$LiveRoot,
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [Parameter(Mandatory = $true)][string]$RetentionRoot,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedInstalledHead,

    [switch]$RollbackPrivatePreview,
    [switch]$ConfirmZeroRelease,
    [switch]$AllowWorktreeDist
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'QctpRev3Runtime.Common.ps1')

if (-not $RollbackPrivatePreview -or -not $ConfirmZeroRelease) {
    throw 'Rollback is disabled unless both -RollbackPrivatePreview and -ConfirmZeroRelease are supplied explicitly.'
}

$repoRoot = Resolve-QctpAbsolutePath -Path (Join-Path $PSScriptRoot '..\..') -MustExist
$live = Resolve-QctpAbsolutePath -Path $LiveRoot -MustExist
$backup = Resolve-QctpAbsolutePath -Path $BackupDirectory -MustExist
$retentionRootPath = Resolve-QctpAbsolutePath -Path $RetentionRoot

Assert-QctpDistinctRoots -First $live -Second $backup -Relationship 'Live root and rollback backup'
Assert-QctpDistinctRoots -First $live -Second $retentionRootPath -Relationship 'Live root and rollback retention root'
Assert-QctpDistinctRoots -First $backup -Second $retentionRootPath -Relationship 'Rollback backup and retention root'

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
    [IO.Path]::GetPathRoot($retentionRootPath).ToLowerInvariant()
) {
    throw 'Atomic rollback requires the live root and retention root to be on the same filesystem volume.'
}

$rejectedHashes = Get-QctpRejectedA03Hashes -RepositoryRoot $repoRoot
Assert-QctpRev3CandidateSite `
    -SiteRoot $live `
    -ExpectedHead $ExpectedInstalledHead `
    -RejectedHashes $rejectedHashes | Out-Null

$backupManifestPath = Join-Path $backup $script:QctpRev3BackupManifestName
$backupSite = Join-Path $backup 'site'
if (-not (Test-Path -LiteralPath $backupManifestPath -PathType Leaf)) {
    throw "Rollback backup manifest is missing: $backupManifestPath"
}
if (-not (Test-Path -LiteralPath $backupSite -PathType Container)) {
    throw "Rollback backup site is missing: $backupSite"
}
$backupManifest = Get-Content -LiteralPath $backupManifestPath -Raw | ConvertFrom-Json
if ([string]$backupManifest.schema -ne 'qctp-rev3-runtime-backup-manifest-v1') {
    throw "Unexpected rollback backup schema: $($backupManifest.schema)"
}
if ([string]$backupManifest.installedCandidateSha -ne $ExpectedInstalledHead.ToLowerInvariant()) {
    throw 'Rollback backup was not created by the expected installed candidate.'
}
if (
    (Get-QctpSha256 -Path (Join-Path $live $script:QctpRev3IdentityName)) -ne
    ([string]$backupManifest.installedIdentitySha256).ToLowerInvariant()
) {
    throw 'The live candidate identity does not match the candidate recorded by this rollback backup.'
}
Assert-QctpTreeManifest `
    -Root $backupSite `
    -Manifest $backupManifest.previousTree `
    -ExpectedSchema 'qctp-rev3-runtime-backup-tree-v1' | Out-Null

if (-not (Test-Path -LiteralPath $retentionRootPath)) {
    New-Item -ItemType Directory -Path $retentionRootPath | Out-Null
}
$retentionRootPath = Resolve-QctpAbsolutePath -Path $retentionRootPath -MustExist

$liveParent = Split-Path -Parent $live
$liveLeaf = Split-Path -Leaf $live
$nonce = [Guid]::NewGuid().ToString('N')
$nextRoot = Join-Path $liveParent ".$liveLeaf.qctp-rev3-rollback-$nonce"
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$retainedDirectory = Join-Path $retentionRootPath "replaced-$timestamp-$($ExpectedInstalledHead.Substring(0, 12))-$($nonce.Substring(0, 8))"
$retainedSite = Join-Path $retainedDirectory 'site'

if ((Test-Path -LiteralPath $nextRoot) -or (Test-Path -LiteralPath $retainedDirectory)) {
    throw 'A generated rollback staging or retention destination unexpectedly already exists.'
}

Write-Host 'Copying and verifying the rollback tree beside the live root before the swap.' -ForegroundColor Cyan
Copy-Item -LiteralPath $backupSite -Destination $nextRoot -Recurse
Assert-QctpTreeManifest `
    -Root $nextRoot `
    -Manifest $backupManifest.previousTree `
    -ExpectedSchema 'qctp-rev3-runtime-backup-tree-v1' | Out-Null
Assert-QctpRev3CandidateSite `
    -SiteRoot $live `
    -ExpectedHead $ExpectedInstalledHead `
    -RejectedHashes $rejectedHashes | Out-Null
Assert-QctpTreeManifest `
    -Root $backupSite `
    -Manifest $backupManifest.previousTree `
    -ExpectedSchema 'qctp-rev3-runtime-backup-tree-v1' | Out-Null

New-Item -ItemType Directory -Path $retainedDirectory | Out-Null
$currentMoved = $false
$rollbackMoved = $false
try {
    Move-Item -LiteralPath $live -Destination $retainedSite
    $currentMoved = $true
    Assert-QctpRev3CandidateSite `
        -SiteRoot $retainedSite `
        -ExpectedHead $ExpectedInstalledHead `
        -RejectedHashes $rejectedHashes | Out-Null
    Move-Item -LiteralPath $nextRoot -Destination $live
    $rollbackMoved = $true
}
catch {
    if ($currentMoved -and -not $rollbackMoved -and -not (Test-Path -LiteralPath $live) -and (Test-Path -LiteralPath $retainedSite)) {
        Move-Item -LiteralPath $retainedSite -Destination $live
    }
    throw "Atomic rollback swap failed; the Rev3 live root was restored when possible. $($_.Exception.Message)"
}

try {
    Assert-QctpTreeManifest `
        -Root $live `
        -Manifest $backupManifest.previousTree `
        -ExpectedSchema 'qctp-rev3-runtime-backup-tree-v1' | Out-Null
}
catch {
    $failedRollbackSite = Join-Path $retainedDirectory 'failed-rollback-site'
    if ((Test-Path -LiteralPath $live) -and -not (Test-Path -LiteralPath $failedRollbackSite)) {
        Move-Item -LiteralPath $live -Destination $failedRollbackSite
    }
    if (-not (Test-Path -LiteralPath $live) -and (Test-Path -LiteralPath $retainedSite)) {
        Move-Item -LiteralPath $retainedSite -Destination $live
    }
    throw "Rollback verification failed; the Rev3 live root was restored and the failed rollback tree was retained. $($_.Exception.Message)"
}

$record = [ordered]@{
    schema = 'qctp-rev3-runtime-rollback-record-v1'
    rolledBackAt = (Get-Date).ToUniversalTime().ToString('o')
    removedCandidateSha = $ExpectedInstalledHead.ToLowerInvariant()
    restoredBackup = $backup
    restoredLiveRoot = $live
    retainedReplacedSite = $retainedSite
    releaseAuthority = 'ZERO_RELEASE'
    serviceRestarted = $false
    routeModified = $false
}
$recordPath = Join-Path $retainedDirectory 'QCTP_REV3_ROLLBACK_RECORD.json'
Write-QctpJsonFile -Value $record -Path $recordPath

Write-Host ''
Write-Host 'QCTP REV3 PRIVATE RUNTIME ROLLBACK: PASS' -ForegroundColor Green
Write-Host "Restored live root: $live"
Write-Host "Original backup remains recoverable: $backup"
Write-Host "Displaced Rev3 site retained at: $retainedSite"
Write-Host "Rollback record SHA-256: $(Get-QctpSha256 -Path $recordPath)"
Write-Host 'No process, scheduled task, Tailscale route, Funnel, or public deployment was changed.'
Write-Host 'Release authority: ZERO_RELEASE'
