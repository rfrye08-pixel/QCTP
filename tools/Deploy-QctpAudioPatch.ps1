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
$StartedTasks = @()
$GatewayWasRunning = $false
$DeploymentSwapped = $false

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
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Command failed with exit code $($exitCode): $Command $($Arguments -join ' ')"
    }
}

function Remove-PathWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Attempts = 8,
        [int]$DelayMilliseconds = 500
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            return
        }
        catch {
            if ($attempt -eq $Attempts) { throw }
            Start-Sleep -Milliseconds $DelayMilliseconds
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

function Get-QctpScheduledTasks {
    $repoPattern = [regex]::Escape($RepoRoot)
    try {
        return @(
            Get-ScheduledTask -ErrorAction Stop | Where-Object {
                $task = $_
                $actionText = ($task.Actions | ForEach-Object {
                    "$($_.Execute) $($_.Arguments) $($_.WorkingDirectory)"
                }) -join ' '
                $task.TaskName -match 'QCTP' -or
                $task.TaskPath -match 'QCTP' -or
                $actionText -match $repoPattern
            }
        )
    }
    catch {
        Write-Host 'Scheduled-task inspection is unavailable. The updater will preserve a running gateway and deploy the static build without stopping it.' -ForegroundColor Yellow
        return @()
    }
}

function Get-GatewayConnections {
    return @(Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue)
}

function Stop-GatewayConnections {
    param([object[]]$Connections)

    foreach ($connection in @($Connections)) {
        if ($connection.OwningProcess -gt 0) {
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

function Start-QctpTasks {
    param([object[]]$Tasks)

    foreach ($task in @($Tasks)) {
        Write-Host "Starting scheduled task: $($task.TaskPath)$($task.TaskName)"
        Start-ScheduledTask -InputObject $task
    }
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
        schema = 'qctp-private-runtime-build-v2'
        candidate_sha = $Head
        source_branch = $RequiredBranch
        audio_fix_present = $true
        isolated_staging_build = $true
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

function New-IsolatedStagingWorktree {
    param([Parameter(Mandatory = $true)][string]$Head)

    $root = Join-Path ([IO.Path]::GetTempPath()) ("qctp-private-runtime-stage-{0}-{1}" -f $PID, [Guid]::NewGuid().ToString('N'))
    $repo = Join-Path $root 'QCTP'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Invoke-Checked -Command git -Arguments @('-C', $RepoRoot, 'worktree', 'add', '--detach', $repo, $Head)
    return @($root, $repo)
}

function Copy-VerifiedDistToDeployCandidate {
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
        [string]$CurrentDist,
        [string]$BackupPath,
        [object[]]$Tasks,
        [bool]$TasksWereUsed
    )

    Write-Host 'Attempting to restore the previous private runtime dist package.' -ForegroundColor Yellow
    if ($TasksWereUsed) {
        Stop-GatewayConnections -Connections (Get-GatewayConnections)
    }
    if (Test-Path -LiteralPath $CurrentDist) {
        $failedPath = "$CurrentDist.failed-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Move-Item -LiteralPath $CurrentDist -Destination $failedPath -Force -ErrorAction SilentlyContinue
    }
    if ($BackupPath -and (Test-Path -LiteralPath $BackupPath)) {
        Move-Item -LiteralPath $BackupPath -Destination $CurrentDist -Force
    }
    if ($TasksWereUsed) {
        Start-QctpTasks -Tasks $Tasks
    }
}

try {
    Write-Stage 'QCTP audio-patch deployment preflight REV6'
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

    Write-Stage 'Creating an isolated staging worktree'
    $stagePaths = New-IsolatedStagingWorktree -Head $head
    $StageRoot = $stagePaths[0]
    $StageRepo = $stagePaths[1]
    Write-Host "Staging repository: $StageRepo" -ForegroundColor Green
    Write-Host 'The active QCTP node_modules directory will not be modified, so the running gateway cannot lock npm ci.' -ForegroundColor DarkGray

    if (-not (Test-RequiredAudioFix -Repository $StageRepo)) {
        throw 'The isolated staging worktree does not contain the controlled iPhone audio fix.'
    }

    Write-Stage 'Verifying the controlled Day 1 audio inventory'
    $day1Path = Join-Path $StageRepo 'src\foundation\day1.ts'
    if (-not (Test-Path -LiteralPath $day1Path)) {
        throw "Day 1 source is missing: $day1Path"
    }
    $day1Source = Get-Content -Raw -LiteralPath $day1Path
    $audioUrls = @(
        [regex]::Matches($day1Source, 'https://resource2\.heygen\.ai/[^"\s]+\.wav') |
            ForEach-Object { $_.Value } |
            Sort-Object -Unique
    )
    if ($audioUrls.Count -lt 22) {
        throw "Expected at least 22 controlled Day 1 neural-audio references, found $($audioUrls.Count)."
    }
    Write-Host "Verified $($audioUrls.Count) controlled audio references in the source definition." -ForegroundColor Green
    Write-Host 'External provider byte probing is not a deployment blocker. Target-iPhone opening and delayed-cue playback already passed, and runtime playback fails closed.' -ForegroundColor DarkGray

    Push-Location $StageRepo
    try {
        Write-Stage 'Installing exact Node dependencies in isolated staging'
        Invoke-Checked -Command npm -Arguments @('ci')

        Write-Stage 'Running Windows-safe lint, type, coverage, and production-build gates'
        Write-Host 'The cross-platform formatting gate is enforced by Linux candidate CI; it is not repeated after Windows line-ending conversion.' -ForegroundColor DarkGray
        Invoke-Checked -Command npm -Arguments @('run', 'lint')
        Invoke-Checked -Command npm -Arguments @('run', 'typecheck')
        Invoke-Checked -Command npm -Arguments @('run', 'test:coverage')
        Invoke-Checked -Command npm -Arguments @('run', 'build')

        Write-Stage 'Running the dedicated iPhone audio regression tests'
        Invoke-Checked -Command npx -Arguments @('vitest', 'run', 'src/app/screens/PracticeScreen.test.tsx')

        $shouldRunBrowserTests = $RunBrowserTests -and -not $SkipBrowserTests
        if ($shouldRunBrowserTests) {
            Write-Stage 'Running browser acceptance tests'
            Invoke-Checked -Command npx -Arguments @('playwright', 'install', 'chromium')
            Invoke-Checked -Command npm -Arguments @('run', 'test:e2e')
        }
        else {
            Write-Host 'Full browser-suite reinstall is skipped in this private-runtime recovery. Repository CI remains the governing browser gate.' -ForegroundColor DarkGray
        }
    }
    finally {
        Pop-Location
    }

    $stageDist = Join-Path $StageRepo 'dist'
    $stageIndex = Join-Path $stageDist 'index.html'
    if (-not (Test-Path -LiteralPath $stageIndex)) {
        throw 'The isolated production build did not create dist\index.html.'
    }

    $identityPath = Write-RuntimeIdentity -Head $head -DistDirectory $stageDist
    Write-Host "Wrote staged runtime identity: $identityPath" -ForegroundColor Green
    Write-Host "Verified staged dist build timestamp: $((Get-Item -LiteralPath $stageIndex).LastWriteTime)" -ForegroundColor Green

    if ($VerifyBuildOnly) {
        Write-Host "`nQCTP AUDIO PATCH BUILD VERIFICATION: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
    }
    else {
        Write-Stage 'Preparing verified dist package for atomic deployment'
        $DeployCandidate = Copy-VerifiedDistToDeployCandidate -SourceDist $stageDist
        $currentDist = Join-Path $RepoRoot 'dist'
        $BackupDist = Join-Path $RepoRoot ('.qctp-dist-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

        $tasks = Get-QctpScheduledTasks
        $gatewayConnections = Get-GatewayConnections
        $GatewayWasRunning = ($gatewayConnections.Count -gt 0)
        $tasksWereUsed = ($tasks.Count -gt 0 -and -not $SkipRestart)

        if ($tasksWereUsed) {
            Write-Stage 'Stopping the private QCTP gateway for the dist swap'
            Stop-GatewayConnections -Connections $gatewayConnections
        }
        elseif ($GatewayWasRunning) {
            Write-Host 'No controllable QCTP scheduled task was found. The running gateway will remain online and will read the atomically replaced static dist package.' -ForegroundColor Yellow
        }
        elseif (-not $SkipRestart) {
            throw 'No running QCTP gateway or controllable QCTP scheduled task was found. The verified build was not deployed.'
        }

        Write-Stage 'Installing the verified dist package'
        if (Test-Path -LiteralPath $currentDist) {
            Move-Item -LiteralPath $currentDist -Destination $BackupDist -Force
        }
        Move-Item -LiteralPath $DeployCandidate -Destination $currentDist -Force
        $DeployCandidate = $null
        $DeploymentSwapped = $true

        if ($tasksWereUsed) {
            Write-Stage 'Restarting the private QCTP services'
            Start-QctpTasks -Tasks $tasks
            $StartedTasks = @($tasks)
        }

        Write-Stage 'Verifying the rebuilt private runtime'
        $runtimeVerified = (
            (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/health') -and
            (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/') -and
            (Test-RuntimeIdentity -ExpectedHead $head)
        )
        if (-not $runtimeVerified) {
            Restore-PreviousDist -CurrentDist $currentDist -BackupPath $BackupDist -Tasks $tasks -TasksWereUsed $tasksWereUsed
            $DeploymentSwapped = $false
            throw "The private gateway did not prove that it was serving candidate $head. The previous dist package was restored."
        }

        if (Test-Path -LiteralPath $BackupDist) {
            Remove-PathWithRetry -Path $BackupDist
        }
        $BackupDist = $null

        Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
        Write-Host 'The private gateway is serving the newly built candidate identity.'
        Write-Host 'Close the QCTP Home Screen app completely, reopen it, then verify the opening cue and automatic cue at 24:15.'
    }
}
catch {
    Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    if ($DeployCandidate -and (Test-Path -LiteralPath $DeployCandidate)) {
        Remove-PathWithRetry -Path $DeployCandidate -ErrorAction SilentlyContinue
    }
    if ($StageRepo -and (Test-Path -LiteralPath $StageRepo)) {
        & git -C $RepoRoot worktree remove --force $StageRepo 2>$null
    }
    & git -C $RepoRoot worktree prune 2>$null
    if ($StageRoot -and (Test-Path -LiteralPath $StageRoot)) {
        Remove-PathWithRetry -Path $StageRoot -ErrorAction SilentlyContinue
    }
}

exit 0
