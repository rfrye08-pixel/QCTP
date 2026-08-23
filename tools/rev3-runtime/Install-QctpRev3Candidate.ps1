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

$rejectedHashes = Get-QctpRejectedA03Hashes -RepositoryRoot $repoRoot
$candidateIdentity = Assert-QctpRev3CandidatePackage `
    -CandidateDirectory $candidate `
    -ExpectedHead $ExpectedHead `
    -RejectedHashes $rejectedHashes
$candidateCompatibility = Get-QctpRuntimeCompatibilityContract -SiteRoot (Join-Path $candidate 'site')

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
$previousCompatibility = Get-QctpRuntimeCompatibilityContract -SiteRoot $live

$candidateDiagnostic = $candidateCompatibility | ConvertTo-Json -Depth 8 -Compress
$previousDiagnostic = $previousCompatibility | ConvertTo-Json -Depth 8 -Compress
throw "IMMUTABLE_ACTIVATION_REQUIRED: mutable live-root installation is disabled under ZERO_RELEASE because a two-directory swap has a crash window and the IndexedDB downgrade contract is unproven. The verified candidate remains unchanged at $candidate (candidate $($candidateIdentity.candidateSha)); the live root, backup root, process, route, and scheduled tasks were not changed. Start the immutable candidate directly with Start-QctpRev3PrivatePreview.ps1. Candidate diagnostic: $candidateDiagnostic Previous diagnostic: $previousDiagnostic"
