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
    $candidate = Join-Path $tempRoot 'candidate'
    $site = Join-Path $candidate 'site'
    $live = Join-Path $tempRoot 'live'
    $backupRoot = Join-Path $tempRoot 'backups'
    $retentionRoot = Join-Path $tempRoot 'retained'
    foreach ($path in @($site, $live, $backupRoot, $retentionRoot)) {
        New-Item -ItemType Directory -Path $path | Out-Null
    }

    Write-SelfTestFile -Path (Join-Path $site 'index.html') -Content '<!doctype html><script type="module" src="/assets/app.js"></script>'
    Write-SelfTestFile -Path (Join-Path $site 'assets\app.js') -Content 'document.body.dataset.qctp = "rev3";'
    Write-SelfTestFile -Path (Join-Path $site 'sw.js') -Content 'self.addEventListener("fetch", () => {});'
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

    Write-SelfTestFile -Path (Join-Path $live 'index.html') -Content '<!doctype html><title>previous runtime</title>'
    Write-SelfTestFile -Path (Join-Path $live 'previous.txt') -Content 'recoverable previous tree'
    & $powershell `
        -NoProfile `
        -NonInteractive `
        -File (Join-Path $PSScriptRoot 'Install-QctpRev3Candidate.ps1') `
        -CandidateDirectory $candidate `
        -LiveRoot $live `
        -BackupRoot $backupRoot `
        -ExpectedHead $head `
        -InstallPrivatePreview `
        -ConfirmZeroRelease | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'The atomic private-install self-test failed.'
    }
    Assert-SelfTest `
        -Condition (Test-Path -LiteralPath (Join-Path $live $script:QctpRev3IdentityName) -PathType Leaf) `
        -Message 'The self-test candidate was not installed.'

    $backup = @(Get-ChildItem -LiteralPath $backupRoot -Directory)
    Assert-SelfTest -Condition ($backup.Count -eq 1) -Message 'The install did not create exactly one recoverable backup.'
    & $powershell `
        -NoProfile `
        -NonInteractive `
        -File (Join-Path $PSScriptRoot 'Rollback-QctpRev3Runtime.ps1') `
        -LiveRoot $live `
        -BackupDirectory $backup[0].FullName `
        -RetentionRoot $retentionRoot `
        -ExpectedInstalledHead $head `
        -RollbackPrivatePreview `
        -ConfirmZeroRelease | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'The atomic rollback self-test failed.'
    }
    Assert-SelfTest `
        -Condition (Test-Path -LiteralPath (Join-Path $live 'previous.txt') -PathType Leaf) `
        -Message 'The rollback did not restore the previous runtime tree.'
    Assert-SelfTest `
        -Condition (-not (Test-Path -LiteralPath (Join-Path $live $script:QctpRev3IdentityName))) `
        -Message 'The rollback left the candidate identity in the restored tree.'

    [ordered]@{
        schema = 'qctp-rev3-runtime-tool-self-test-v1'
        result = 'PASS'
        manifestTamperRejected = $true
        rejectedA03PathBlocked = $true
        renamedA03HashBlocked = $true
        externalEntryDependencyBlocked = $true
        exactLoopbackPreviewPassed = $true
        atomicInstallPassed = $true
        recoverableBackupCreated = $true
        rollbackPassed = $true
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
