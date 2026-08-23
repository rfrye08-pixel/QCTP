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
    [switch]$AllowWorktreeDist,
    [switch]$AllowLegacyEmergencyRollback,
    [switch]$ConfirmAllQctpClientsClosed,
    [switch]$ConfirmLegacyDataCompatibilityRisk
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'QctpRev3Runtime.Common.ps1')

function Test-QctpCompatibilityContractEquivalent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Recorded,
        [Parameter(Mandatory = $true)]$Actual
    )

    return (
        [string]$Recorded.schema -eq [string]$Actual.schema -and
        [string]$Recorded.dataContract.schema -eq [string]$Actual.dataContract.schema -and
        [string]$Recorded.dataContract.status -eq [string]$Actual.dataContract.status -and
        [string]$Recorded.dataContract.databaseName -eq [string]$Actual.dataContract.databaseName -and
        [string]$Recorded.dataContract.databaseVersion -eq [string]$Actual.dataContract.databaseVersion -and
        [string]$Recorded.dataContract.rollbackCompatibility -eq [string]$Actual.dataContract.rollbackCompatibility -and
        [string]$Recorded.dataContract.source -eq [string]$Actual.dataContract.source -and
        [string]$Recorded.serviceWorkerPolicy.schema -eq [string]$Actual.serviceWorkerPolicy.schema -and
        [string]$Recorded.serviceWorkerPolicy.status -eq [string]$Actual.serviceWorkerPolicy.status -and
        [string]$Recorded.serviceWorkerPolicy.updateMode -eq [string]$Actual.serviceWorkerPolicy.updateMode -and
        [int]$Recorded.serviceWorkerPolicy.skipWaitingCallCount -eq [int]$Actual.serviceWorkerPolicy.skipWaitingCallCount -and
        [bool]$Recorded.serviceWorkerPolicy.skipWaitingCallPresent -eq [bool]$Actual.serviceWorkerPolicy.skipWaitingCallPresent -and
        [bool]$Recorded.serviceWorkerPolicy.skipWaitingMessageGatePresent -eq [bool]$Actual.serviceWorkerPolicy.skipWaitingMessageGatePresent -and
        [bool]$Recorded.serviceWorkerPolicy.skipWaitingOnInstall -eq [bool]$Actual.serviceWorkerPolicy.skipWaitingOnInstall -and
        [bool]$Recorded.serviceWorkerPolicy.clientsClaimPresent -eq [bool]$Actual.serviceWorkerPolicy.clientsClaimPresent -and
        [string]$Recorded.serviceWorkerPolicy.source -eq [string]$Actual.serviceWorkerPolicy.source -and
        [bool]$Recorded.normalRollbackEligible -eq [bool]$Actual.normalRollbackEligible
    )
}

if (-not $RollbackPrivatePreview -or -not $ConfirmZeroRelease) {
    throw 'Rollback is disabled unless both -RollbackPrivatePreview and -ConfirmZeroRelease are supplied explicitly.'
}

if (
    ($ConfirmAllQctpClientsClosed -or $ConfirmLegacyDataCompatibilityRisk) -and
    -not $AllowLegacyEmergencyRollback
) {
    throw 'Legacy-emergency acknowledgement switches are accepted only with -AllowLegacyEmergencyRollback.'
}
if (
    $AllowLegacyEmergencyRollback -and
    (-not $ConfirmAllQctpClientsClosed -or -not $ConfirmLegacyDataCompatibilityRisk)
) {
    throw 'Legacy emergency rollback requires -ConfirmAllQctpClientsClosed and -ConfirmLegacyDataCompatibilityRisk in addition to the existing private-preview and ZERO_RELEASE confirmations.'
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
$backupSchema = [string]$backupManifest.schema
if ($backupSchema -notin @(
    'qctp-rev3-runtime-backup-manifest-v1',
    'qctp-rev3-runtime-backup-manifest-v2'
)) {
    throw "Unexpected rollback backup schema: $($backupManifest.schema)"
}
if ([string]$backupManifest.installedCandidateSha -ne $ExpectedInstalledHead.ToLowerInvariant()) {
    throw 'Rollback backup was not created by the expected installed candidate.'
}
if ([string]$backupManifest.releaseAuthority -ne 'ZERO_RELEASE') {
    throw 'Rollback backup does not preserve ZERO_RELEASE authority.'
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

$installedCompatibility = Get-QctpRuntimeCompatibilityContract -SiteRoot $live
$rollbackCompatibility = Get-QctpRuntimeCompatibilityContract -SiteRoot $backupSite
$normalRollbackReasons = @()

if ($backupSchema -ne 'qctp-rev3-runtime-backup-manifest-v2') {
    $normalRollbackReasons += 'The backup uses the legacy v1 manifest and has no recorded candidate/previous compatibility contract.'
}
else {
    $compatibilityProperty = $backupManifest.PSObject.Properties['compatibility']
    if ($null -eq $compatibilityProperty) {
        $normalRollbackReasons += 'The v2 backup is missing its compatibility contract.'
    }
    elseif ([string]$backupManifest.compatibility.schema -ne 'qctp-rev3-runtime-install-compatibility-v1') {
        $normalRollbackReasons += 'The backup compatibility schema is not supported.'
    }
    else {
        if ([string]$backupManifest.compatibility.normalRollbackPolicy -ne 'EXACT_DATA_CONTRACT_AND_PROMPT_SERVICE_WORKER') {
            $normalRollbackReasons += 'The backup does not declare the controlled exact-data/prompt-worker rollback policy.'
        }
        if (-not (Test-QctpCompatibilityContractEquivalent `
            -Recorded $backupManifest.compatibility.candidate `
            -Actual $installedCompatibility)) {
            $normalRollbackReasons += 'The installed runtime no longer matches the candidate compatibility contract recorded at install.'
        }
        if (-not (Test-QctpCompatibilityContractEquivalent `
            -Recorded $backupManifest.compatibility.previous `
            -Actual $rollbackCompatibility)) {
            $normalRollbackReasons += 'The rollback target no longer matches the previous-runtime compatibility contract recorded at install.'
        }
        $previousEligibilityProperty =
            $backupManifest.compatibility.PSObject.Properties['previousNormalRollbackEligible']
        if (
            $null -eq $previousEligibilityProperty -or
            $previousEligibilityProperty.Value -isnot [bool] -or
            [bool]$previousEligibilityProperty.Value -ne [bool]$rollbackCompatibility.normalRollbackEligible
        ) {
            $normalRollbackReasons += 'The rollback target eligibility does not match the install-time compatibility decision.'
        }
    }
}

if (-not [bool]$installedCompatibility.normalRollbackEligible) {
    $normalRollbackReasons += 'The installed runtime does not expose a controlled data contract and prompt service-worker policy.'
}
if (-not [bool]$rollbackCompatibility.normalRollbackEligible) {
    $normalRollbackReasons += 'The rollback target is legacy or unsafe: its data contract is unknown or its service worker auto-activates.'
}
if (
    [string]$installedCompatibility.dataContract.databaseName -ne
        [string]$rollbackCompatibility.dataContract.databaseName -or
    [int]$installedCompatibility.dataContract.databaseVersion -ne
        [int]$rollbackCompatibility.dataContract.databaseVersion
) {
    $normalRollbackReasons += 'The installed and rollback-target IndexedDB name/version contracts are not exactly equal.'
}

$normalRollbackReasons += 'The bundled database signature is diagnostic only and does not prove downgrade-safe stores, indexes, values, or migrations.'
$details = $normalRollbackReasons -join ' '
$emergencyNotice = if ($AllowLegacyEmergencyRollback) {
    'The emergency acknowledgement switches were supplied, but they cannot bypass the immutable-activation hold.'
}
else {
    'Emergency mutation was not requested.'
}
throw "IMMUTABLE_ACTIVATION_REQUIRED: all mutable live-root rollback is disabled under ZERO_RELEASE because the two-directory swap has a crash window. $details $emergencyNotice The live root, backup, retention root, process, route, and scheduled tasks were not changed. Activate only an already-verified immutable candidate through a stopped listener and a future durable pointer/restart transaction."
