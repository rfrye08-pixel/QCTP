[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'QctpRev3Runtime.Common.ps1')

$head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$tempOwner = Resolve-QctpAbsolutePath -Path ([IO.Path]::GetTempPath()) -MustExist
$tempRoot = Join-Path $tempOwner "qctp-rev3-runtime-selftest-$([Guid]::NewGuid().ToString('N'))"
$encoding = New-Object System.Text.UTF8Encoding($false)

function Write-SelfTestFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
    }
    [IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Assert-SelfTest {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) { throw $Message }
}

try {
    $candidate = Join-Path $tempRoot "qctp-rev3-$head"
    $site = Join-Path $candidate 'site'
    $live = Join-Path $tempRoot 'live'
    $backupRoot = Join-Path $tempRoot 'backups'
    $retentionRoot = Join-Path $tempRoot 'retained'
    foreach ($path in @($site, $live, $backupRoot, $retentionRoot)) {
        New-Item -ItemType Directory -Path $path | Out-Null
    }

    Write-SelfTestFile -Path (Join-Path $site 'index.html') -Content "<!doctype html><meta name=`"qctp-candidate-sha`" content=`"$head`"><script type=`"module`" src=`"/assets/app.js`"></script>"
    Write-SelfTestFile `
        -Path (Join-Path $site 'assets\app.js') `
        -Content 'function openDB() { return null; } openDB("qctp-rev2",5,{}); document.body.dataset.qctp = "rev3";'
    Write-SelfTestFile `
        -Path (Join-Path $site 'sw.js') `
        -Content 'self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") { self.skipWaiting(); } }); self.addEventListener("fetch", () => {});'
    $rejected = @{ ('f' * 64 -join '') = 'self-test-quarantine-artifact' }
    New-QctpRev3CandidateMetadata `
        -CandidateDirectory $candidate `
        -CandidateSha $head `
        -RejectedHashes $rejected | Out-Null
    Assert-QctpRev3CandidatePackage `
        -CandidateDirectory $candidate `
        -ExpectedHead $head `
        -RejectedHashes $rejected | Out-Null

    $appPath = Join-Path $site 'assets\app.js'
    $originalApp = Get-Content -LiteralPath $appPath -Raw
    [IO.File]::AppendAllText($appPath, 'tamper', $encoding)
    $tamperRejected = $false
    try {
        Assert-QctpRev3CandidatePackage -CandidateDirectory $candidate -ExpectedHead $head | Out-Null
    }
    catch {
        $tamperRejected = $true
    }
    Assert-SelfTest -Condition $tamperRejected -Message 'Candidate tamper was not rejected.'
    [IO.File]::WriteAllText($appPath, $originalApp, $encoding)

    $a03Fixture = Join-Path $tempRoot 'a03-fixture'
    New-Item -ItemType Directory -Path (Join-Path $a03Fixture 'a03-acceptance') | Out-Null
    Write-SelfTestFile -Path (Join-Path $a03Fixture 'index.html') -Content '<!doctype html>'
    Write-SelfTestFile -Path (Join-Path $a03Fixture 'a03-acceptance\voice.mp3') -Content 'rejected'
    $a03Rejected = $false
    try {
        Assert-QctpNoRejectedA03Assets -SiteRoot $a03Fixture -RejectedHashes @{} | Out-Null
    }
    catch {
        $a03Rejected = $true
    }
    Assert-SelfTest -Condition $a03Rejected -Message 'Rejected A03R path was not blocked.'

    $hashFixture = Join-Path $tempRoot 'hash-fixture'
    New-Item -ItemType Directory -Path $hashFixture | Out-Null
    Write-SelfTestFile -Path (Join-Path $hashFixture 'index.html') -Content '<!doctype html>'
    $renamedRejectedPath = Join-Path $hashFixture 'innocent-name.bin'
    Write-SelfTestFile -Path $renamedRejectedPath -Content 'quarantined binary bytes'
    $renamedRejectedHash = Get-QctpSha256 -Path $renamedRejectedPath
    $renamedRejected = $false
    try {
        Assert-QctpNoRejectedA03Assets `
            -SiteRoot $hashFixture `
            -RejectedHashes @{ $renamedRejectedHash = 'controlled quarantine fixture' } | Out-Null
    }
    catch {
        $renamedRejected = $true
    }
    Assert-SelfTest -Condition $renamedRejected -Message 'Renamed rejected A03R hash was not blocked.'

    $externalFixture = Join-Path $tempRoot 'external-fixture'
    New-Item -ItemType Directory -Path $externalFixture | Out-Null
    Write-SelfTestFile `
        -Path (Join-Path $externalFixture 'index.html') `
        -Content '<!doctype html><script src="https://paid.invalid/app.js"></script>'
    $externalRejected = $false
    try {
        Assert-QctpSameOriginEntryDocument -SiteRoot $externalFixture | Out-Null
    }
    catch {
        $externalRejected = $true
    }
    Assert-SelfTest -Condition $externalRejected -Message 'External entry-document dependency was not blocked.'

    $powershell = (Get-Process -Id $PID).Path
    & $powershell `
        -NoProfile `
        -NonInteractive `
        -File (Join-Path $PSScriptRoot 'Test-QctpRev3Candidate.ps1') `
        -CandidateDirectory $candidate `
        -ExpectedHead $head | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'The isolated exact-served-identity preview self-test failed.'
    }

    Write-SelfTestFile `
        -Path (Join-Path $live 'index.html') `
        -Content '<!doctype html><script type="module" src="/assets/app.js"></script><title>previous runtime</title>'
    Write-SelfTestFile `
        -Path (Join-Path $live 'assets\app.js') `
        -Content 'function openDB() { return null; } openDB("qctp-rev2",5,{});'
    Write-SelfTestFile `
        -Path (Join-Path $live 'sw.js') `
        -Content 'self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") { self.skipWaiting(); } }); self.addEventListener("fetch", () => {});'
    Write-SelfTestFile -Path (Join-Path $live 'previous.txt') -Content 'recoverable previous tree'

    $candidateCompatibility = Get-QctpRuntimeCompatibilityContract -SiteRoot $site
    Assert-SelfTest `
        -Condition (
            [string]$candidateCompatibility.schema -eq 'qctp-rev3-runtime-compatibility-contract-v2' -and
            [string]$candidateCompatibility.dataContract.status -eq 'INFERRED_ONLY' -and
            [string]$candidateCompatibility.dataContract.rollbackCompatibility -eq 'UNPROVEN' -and
            -not [bool]$candidateCompatibility.normalRollbackEligible
        ) `
        -Message 'The runtime contract treated a bundled database signature as proven downgrade compatibility.'

    $liveBeforeInstall = New-QctpTreeManifestObject `
        -Root $live `
        -Schema 'qctp-rev3-runtime-self-test-tree-v1' `
        -CandidateSha $head
    $installRefusalOutput = & $powershell `
        -NoProfile `
        -NonInteractive `
        -File (Join-Path $PSScriptRoot 'Install-QctpRev3Candidate.ps1') `
        -CandidateDirectory $candidate `
        -LiveRoot $live `
        -BackupRoot $backupRoot `
        -ExpectedHead $head `
        -InstallPrivatePreview `
        -ConfirmZeroRelease 2>&1 | Out-String
    $installRefusalExitCode = $LASTEXITCODE
    Assert-SelfTest `
        -Condition ($installRefusalExitCode -ne 0 -and $installRefusalOutput -match 'IMMUTABLE_ACTIVATION_REQUIRED') `
        -Message 'Mutable private installation was not stopped by the immutable-activation hold.'
    Assert-SelfTest `
        -Condition (@(Get-ChildItem -LiteralPath $backupRoot -Force).Count -eq 0) `
        -Message 'The refused install created backup or staging material.'
    Assert-SelfTest `
        -Condition ((New-QctpTreeManifestObject `
            -Root $live `
            -Schema 'qctp-rev3-runtime-self-test-tree-v1' `
            -CandidateSha $head | ConvertTo-Json -Depth 12 -Compress) -eq
            ($liveBeforeInstall | ConvertTo-Json -Depth 12 -Compress)) `
        -Message 'The refused install changed the live tree.'

    $rollbackLive = Join-Path $tempRoot 'rollback-live'
    $rollbackBackup = Join-Path $tempRoot 'rollback-backup'
    $rollbackBackupSite = Join-Path $rollbackBackup 'site'
    New-Item -ItemType Directory -Path $rollbackLive | Out-Null
    New-Item -ItemType Directory -Path $rollbackBackupSite | Out-Null
    Copy-Item -Path (Join-Path $candidate 'site\*') -Destination $rollbackLive -Recurse
    Write-SelfTestFile -Path (Join-Path $rollbackBackupSite 'index.html') -Content '<!doctype html><title>held rollback target</title>'
    Write-SelfTestFile -Path (Join-Path $rollbackBackupSite 'previous.txt') -Content 'recoverable previous tree'

    $previousTree = New-QctpTreeManifestObject `
        -Root $rollbackBackupSite `
        -Schema 'qctp-rev3-runtime-backup-tree-v1' `
        -CandidateSha ('0' * 40 -join '')
    $installedCompatibility = Get-QctpRuntimeCompatibilityContract -SiteRoot $rollbackLive
    $previousCompatibility = Get-QctpRuntimeCompatibilityContract -SiteRoot $rollbackBackupSite
    $backupManifest = [ordered]@{
        schema = 'qctp-rev3-runtime-backup-manifest-v2'
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        liveRoot = $rollbackLive
        installedCandidateSha = $head
        installedIdentitySha256 = Get-QctpSha256 -Path (Join-Path $rollbackLive $script:QctpRev3IdentityName)
        releaseAuthority = 'ZERO_RELEASE'
        compatibility = [ordered]@{
            schema = 'qctp-rev3-runtime-install-compatibility-v1'
            normalRollbackPolicy = 'UNPROVEN_IMMUTABLE_ACTIVATION_REQUIRED'
            candidate = $installedCompatibility
            previous = $previousCompatibility
            previousNormalRollbackEligible = $false
        }
        previousTree = $previousTree
    }
    Write-QctpJsonFile `
        -Value $backupManifest `
        -Path (Join-Path $rollbackBackup $script:QctpRev3BackupManifestName)

    $rollbackLiveBefore = New-QctpTreeManifestObject `
        -Root $rollbackLive `
        -Schema 'qctp-rev3-runtime-self-test-tree-v1' `
        -CandidateSha $head
    $rollbackBackupBefore = New-QctpTreeManifestObject `
        -Root $rollbackBackup `
        -Schema 'qctp-rev3-runtime-self-test-tree-v1' `
        -CandidateSha $head
    $rollbackRefusalOutput = & $powershell `
        -NoProfile `
        -NonInteractive `
        -File (Join-Path $PSScriptRoot 'Rollback-QctpRev3Runtime.ps1') `
        -LiveRoot $rollbackLive `
        -BackupDirectory $rollbackBackup `
        -RetentionRoot $retentionRoot `
        -ExpectedInstalledHead $head `
        -RollbackPrivatePreview `
        -ConfirmZeroRelease 2>&1 | Out-String
    $rollbackRefusalExitCode = $LASTEXITCODE
    Assert-SelfTest `
        -Condition ($rollbackRefusalExitCode -ne 0 -and $rollbackRefusalOutput -match 'IMMUTABLE_ACTIVATION_REQUIRED') `
        -Message 'Normal rollback did not stop at the immutable-activation hold.'

    $emergencyRefusalOutput = & $powershell `
        -NoProfile `
        -NonInteractive `
        -File (Join-Path $PSScriptRoot 'Rollback-QctpRev3Runtime.ps1') `
        -LiveRoot $rollbackLive `
        -BackupDirectory $rollbackBackup `
        -RetentionRoot $retentionRoot `
        -ExpectedInstalledHead $head `
        -RollbackPrivatePreview `
        -ConfirmZeroRelease `
        -AllowLegacyEmergencyRollback `
        -ConfirmAllQctpClientsClosed `
        -ConfirmLegacyDataCompatibilityRisk 2>&1 | Out-String
    $emergencyRefusalExitCode = $LASTEXITCODE
    Assert-SelfTest `
        -Condition ($emergencyRefusalExitCode -ne 0 -and $emergencyRefusalOutput -match 'IMMUTABLE_ACTIVATION_REQUIRED') `
        -Message 'Emergency switches bypassed the immutable-activation hold.'
    Assert-SelfTest `
        -Condition (@(Get-ChildItem -LiteralPath $retentionRoot -Force).Count -eq 0) `
        -Message 'A refused rollback created retention or staging material.'
    Assert-SelfTest `
        -Condition ((New-QctpTreeManifestObject `
            -Root $rollbackLive `
            -Schema 'qctp-rev3-runtime-self-test-tree-v1' `
            -CandidateSha $head | ConvertTo-Json -Depth 12 -Compress) -eq
            ($rollbackLiveBefore | ConvertTo-Json -Depth 12 -Compress)) `
        -Message 'A refused rollback changed the live candidate.'
    Assert-SelfTest `
        -Condition ((New-QctpTreeManifestObject `
            -Root $rollbackBackup `
            -Schema 'qctp-rev3-runtime-self-test-tree-v1' `
            -CandidateSha $head | ConvertTo-Json -Depth 12 -Compress) -eq
            ($rollbackBackupBefore | ConvertTo-Json -Depth 12 -Compress)) `
        -Message 'A refused rollback changed the recoverable backup.'

    [ordered]@{
        schema = 'qctp-rev3-runtime-tool-self-test-v1'
        result = 'PASS'
        manifestTamperRejected = $true
        rejectedA03PathBlocked = $true
        renamedA03HashBlocked = $true
        externalEntryDependencyBlocked = $true
        exactLoopbackPreviewPassed = $true
        inferredDataContractHeld = $true
        liveMutationHeld = $true
        normalRollbackHeld = $true
        emergencyMutationHeld = $true
        noMutationOnRefusal = $true
        releaseAuthority = 'ZERO_RELEASE'
    } | ConvertTo-Json -Depth 4
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-QctpOwnedTemporaryTree `
            -Path $tempRoot `
            -OwnerRoot $tempOwner `
            -RequiredLeafPrefix 'qctp-rev3-runtime-selftest-'
    }
}
