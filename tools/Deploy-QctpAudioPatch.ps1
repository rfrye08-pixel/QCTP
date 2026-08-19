[CmdletBinding()]
param(
    [switch]$SkipBrowserTests,
    [switch]$RunBrowserTests,
    [switch]$SkipRestart,
    [switch]$VerifyBuildOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RequiredBranch = 'qctp-platform-rev2-codex'
$RequiredAudioFixCommit = '80801cdf34a4856c95a4d9349aa8a019fdf6fa38'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StageRoot = $null
$StageRepo = $null
$DeployCandidate = $null
$BackupDist = $null
$ExitCode = 0

function Write-Stage {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        throw "Command failed with exit code $($code): $Command $($Arguments -join ' ')"
    }
}

function Remove-PathWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Attempts = 8
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            return
        }
        catch {
            if ($attempt -eq $Attempts) { throw }
            Start-Sleep -Milliseconds 500
        }
    }
}

function Test-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [int]$Attempts = 30,
        [int]$DelaySeconds = 2
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 8
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $true
            }
        }
        catch {
            if ($attempt -eq $Attempts) { break }
        }
        Start-Sleep -Seconds $DelaySeconds
    }
    return $false
}

function Test-RequiredAudioFix {
    param([Parameter(Mandatory = $true)][string]$Repository)

    & git -C $Repository merge-base --is-ancestor $RequiredAudioFixCommit HEAD 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Write-RuntimeIdentity {
    param(
        [Parameter(Mandatory = $true)][string]$Head,
        [Parameter(Mandatory = $true)][string]$DistDirectory
    )

    $identity = [ordered]@{
        schema = 'qctp-private-runtime-build-v3'
        candidate_sha = $Head
        source_branch = $RequiredBranch
        audio_fix_present = $true
        isolated_staging_build = $true
        live_static_swap = $true
        built_at = (Get-Date).ToUniversalTime().ToString('o')
        release_authority = 'ZERO_RELEASE_DEVICE_TEST_CANDIDATE'
    }
    $identityPath = Join-Path $DistDirectory 'QCTP_PRIVATE_RUNTIME_BUILD.json'
    $identity | ConvertTo-Json -Depth 4 |
        Set-Content -LiteralPath $identityPath -Encoding UTF8
    return $identityPath
}

function Test-RuntimeIdentity {
    param([Parameter(Mandatory = $true)][string]$ExpectedHead)

    try {
        $identity = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/QCTP_PRIVATE_RUNTIME_BUILD.json' -TimeoutSec 8
        return (
            [string]$identity.candidate_sha -eq $ExpectedHead -and
            [bool]$identity.audio_fix_present
        )
    }
    catch {
        return $false
    }
}

function New-IsolatedClone {
    param([Parameter(Mandatory = $true)][string]$Head)

    $root = Join-Path ([IO.Path]::GetTempPath()) ("qctp-private-runtime-stage-{0}-{1}" -f $PID, [Guid]::NewGuid().ToString('N'))
    $repo = Join-Path $root 'QCTP'
    New-Item -ItemType Directory -Path $root -Force | Out-Null

    & git clone --no-hardlinks --no-checkout $RepoRoot $repo | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not create the isolated QCTP staging clone.'
    }
    & git -C $repo checkout --detach $Head | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Could not check out candidate $Head in isolated staging."
    }

    return [PSCustomObject]@{
        Root = $root
        Repository = $repo
    }
}

function Copy-VerifiedDist {
    param([Parameter(Mandatory = $true)][string]$SourceDist)

    $candidate = Join-Path $RepoRoot ('.qctp-dist-candidate-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $candidate -Force | Out-Null
    Copy-Item -Path (Join-Path $SourceDist '*') -Destination $candidate -Recurse -Force
    if (-not (Test-Path -LiteralPath (Join-Path $candidate 'index.html'))) {
        throw 'The staged deployment copy is missing index.html.'
    }
    return $candidate
}

function Restore-PreviousDist {
    param(
        [Parameter(Mandatory = $true)][string]$CurrentDist,
        [string]$BackupPath
    )

    Write-Host 'Restoring the previous private runtime dist package.' -ForegroundColor Yellow
    if (Test-Path -LiteralPath $CurrentDist) {
        $failedPath = "$CurrentDist.failed-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Move-Item -LiteralPath $CurrentDist -Destination $failedPath -Force -ErrorAction SilentlyContinue
    }
    if ($BackupPath -and (Test-Path -LiteralPath $BackupPath)) {
        Move-Item -LiteralPath $BackupPath -Destination $CurrentDist -Force
    }
}

try {
    Write-Stage 'QCTP audio-patch deployment preflight REV7'
    Set-Location $RepoRoot

    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) {
        throw "This script must run from the cloned QCTP repository. Repository root: $RepoRoot"
    }

    $dirty = (& git status --porcelain) -join "`n"
    if ($dirty.Trim().Length -gt 0) {
        throw "The QCTP checkout contains uncommitted changes. Preserve them before deploying.`n$dirty"
    }

    Write-Stage 'Confirming controlled candidate alignment'
    Invoke-Checked -Command git -Arguments @('fetch', 'origin', $RequiredBranch)

    $currentBranch = (& git branch --show-current).Trim()
    if ($currentBranch -ne $RequiredBranch) {
        throw "Expected branch $RequiredBranch, but the checkout is on $currentBranch. Run the locator/updater so it can preserve and align the checkout first."
    }

    $head = (& git rev-parse HEAD).Trim()
    $remoteHead = (& git rev-parse "origin/$RequiredBranch").Trim()
    if ($head -ne $remoteHead) {
        throw "The local checkout is not aligned to the controlled remote. Local: $head Remote: $remoteHead. Rerun the locator/updater."
    }
    if (-not (Test-RequiredAudioFix -Repository $RepoRoot)) {
        throw 'The checked-out candidate does not contain the controlled iPhone audio fix.'
    }
    Write-Host "Candidate head: $head" -ForegroundColor Green

    Write-Stage 'Creating isolated staging clone'
    $stage = New-IsolatedClone -Head $head
    $StageRoot = $stage.Root
    $StageRepo = $stage.Repository
    Write-Host "Staging repository: $StageRepo" -ForegroundColor Green
    Write-Host 'The active QCTP node_modules directory is never modified. A running gateway or esbuild process cannot block npm ci in staging.' -ForegroundColor DarkGray

    if (-not (Test-RequiredAudioFix -Repository $StageRepo)) {
        throw 'The isolated staging clone does not contain the controlled iPhone audio fix.'
    }

    Write-Stage 'Verifying controlled Day 1 audio inventory'
    $day1Path = Join-Path $StageRepo 'src\foundation\day1.ts'
    $day1Source = Get-Content -Raw -LiteralPath $day1Path
    $audioUrls = @(
        [regex]::Matches($day1Source, 'https://resource2\.heygen\.ai/[^"\s]+\.wav') |
            ForEach-Object { $_.Value } |
            Sort-Object -Unique
    )
    if ($audioUrls.Count -lt 22) {
        throw "Expected at least 22 controlled Day 1 neural-audio references, found $($audioUrls.Count)."
    }
    Write-Host "Verified $($audioUrls.Count) controlled audio references." -ForegroundColor Green

    Push-Location $StageRepo
    try {
        Write-Stage 'Installing exact dependencies in isolated staging'
        Invoke-Checked -Command npm -Arguments @('ci')

        Write-Stage 'Running Windows-safe lint, type, coverage, and production build'
        Invoke-Checked -Command npm -Arguments @('run', 'lint')
        Invoke-Checked -Command npm -Arguments @('run', 'typecheck')
        Invoke-Checked -Command npm -Arguments @('run', 'test:coverage')
        Invoke-Checked -Command npm -Arguments @('run', 'build')

        Write-Stage 'Running dedicated iPhone audio regression tests'
        Invoke-Checked -Command npx -Arguments @('vitest', 'run', 'src/app/screens/PracticeScreen.test.tsx')

        if ($RunBrowserTests -and -not $SkipBrowserTests) {
            Write-Stage 'Running browser acceptance tests'
            Invoke-Checked -Command npx -Arguments @('playwright', 'install', 'chromium')
            Invoke-Checked -Command npm -Arguments @('run', 'test:e2e')
        }
        else {
            Write-Host 'Browser reinstall is skipped for private recovery. Repository browser CI remains authoritative.' -ForegroundColor DarkGray
        }
    }
    finally {
        Pop-Location
    }

    $stageDist = Join-Path $StageRepo 'dist'
    if (-not (Test-Path -LiteralPath (Join-Path $stageDist 'index.html'))) {
        throw 'The isolated production build did not create dist\index.html.'
    }

    $identityPath = Write-RuntimeIdentity -Head $head -DistDirectory $stageDist
    Write-Host "Wrote staged runtime identity: $identityPath" -ForegroundColor Green

    if ($VerifyBuildOnly) {
        Write-Host "`nQCTP AUDIO PATCH BUILD VERIFICATION: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
    }
    else {
        Write-Stage 'Confirming the existing private gateway is healthy before static deployment'
        if (-not (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/health' -Attempts 3 -DelaySeconds 1)) {
            throw 'The existing private QCTP gateway is not healthy on port 8787. The verified build was not installed.'
        }

        Write-Stage 'Preparing verified dist package'
        $DeployCandidate = Copy-VerifiedDist -SourceDist $stageDist
        $currentDist = Join-Path $RepoRoot 'dist'
        $BackupDist = Join-Path $RepoRoot ('.qctp-dist-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

        Write-Stage 'Atomically replacing only the static PWA dist package'
        Write-Host 'The running gateway and active node_modules remain untouched.' -ForegroundColor DarkGray
        if (Test-Path -LiteralPath $currentDist) {
            Move-Item -LiteralPath $currentDist -Destination $BackupDist -Force
        }
        Move-Item -LiteralPath $DeployCandidate -Destination $currentDist -Force
        $DeployCandidate = $null

        Write-Stage 'Verifying exact served build identity'
        $verified = (
            (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/health') -and
            (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/') -and
            (Test-RuntimeIdentity -ExpectedHead $head)
        )
        if (-not $verified) {
            Restore-PreviousDist -CurrentDist $currentDist -BackupPath $BackupDist
            throw "The gateway did not prove it was serving candidate $head. The previous dist package was restored."
        }

        if (Test-Path -LiteralPath $BackupDist) {
            Remove-PathWithRetry -Path $BackupDist
        }
        $BackupDist = $null

        Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
        Write-Host 'The existing private gateway is serving the newly built static candidate identity.'
        Write-Host 'Close the QCTP Home Screen app completely, reopen it, then verify the opening cue and automatic cue at 24:15.'
    }
}
catch {
    $ExitCode = 1
    Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
    if ($DeployCandidate -and (Test-Path -LiteralPath $DeployCandidate)) {
        try { Remove-PathWithRetry -Path $DeployCandidate } catch { }
    }
    if ($StageRoot -and (Test-Path -LiteralPath $StageRoot)) {
        try { Remove-PathWithRetry -Path $StageRoot } catch {
            Write-Host "Staging cleanup warning: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

exit $ExitCode
