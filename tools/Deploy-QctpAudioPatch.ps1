[CmdletBinding()]
param(
    [switch]$SkipBrowserTests,
    [switch]$SkipRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RequiredBranch = 'qctp-platform-rev2-codex'
$RequiredAudioFixCommit = '80801cdf34a4856c95a4d9349aa8a019fdf6fa38'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Write-Stage {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE: $Command $($Arguments -join ' ')"
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
    return @(
        Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
            $task = $_
            $actionText = ($task.Actions | ForEach-Object {
                "$($_.Execute) $($_.Arguments) $($_.WorkingDirectory)"
            }) -join ' '
            $task.TaskName -match 'QCTP' -or
            $task.TaskPath -match 'QCTP' -or
            $actionText -match 'QCTP' -or
            $actionText -match $repoPattern
        }
    )
}

try {
    Write-Stage 'QCTP audio-patch deployment preflight'
    Set-Location $RepoRoot

    if (-not (Test-Path (Join-Path $RepoRoot '.git'))) {
        throw "This script must run from the cloned QCTP repository. Repository root: $RepoRoot"
    }

    $dirty = (& git status --porcelain) -join "`n"
    if ($dirty.Trim().Length -gt 0) {
        throw "The QCTP checkout contains uncommitted changes. Preserve or commit them before deploying.`n$dirty"
    }

    Write-Stage 'Synchronizing the controlled candidate branch'
    Invoke-Checked git fetch origin $RequiredBranch

    $currentBranch = (& git branch --show-current).Trim()
    if ($currentBranch -ne $RequiredBranch) {
        Invoke-Checked git checkout $RequiredBranch
    }
    Invoke-Checked git pull --ff-only origin $RequiredBranch

    & git merge-base --is-ancestor $RequiredAudioFixCommit HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "The checked-out candidate does not contain the required iPhone audio fix commit $RequiredAudioFixCommit."
    }

    $head = (& git rev-parse HEAD).Trim()
    Write-Host "Candidate head: $head" -ForegroundColor Green

    Write-Stage 'Verifying all controlled Day 1 neural audio assets are reachable'
    $day1Source = Get-Content -Raw (Join-Path $RepoRoot 'src\foundation\day1.ts')
    $audioUrls = @(
        [regex]::Matches($day1Source, 'https://resource2\.heygen\.ai/[^"\s]+\.wav') |
            ForEach-Object { $_.Value } |
            Sort-Object -Unique
    )
    if ($audioUrls.Count -lt 22) {
        throw "Expected at least 22 Day 1 neural-audio assets, found $($audioUrls.Count)."
    }

    foreach ($audioUrl in $audioUrls) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $audioUrl -Headers @{ Range = 'bytes=0-1023' } -TimeoutSec 30
            if ($response.StatusCode -notin @(200, 206)) {
                throw "Unexpected HTTP status $($response.StatusCode)."
            }
        }
        catch {
            throw "Day 1 neural-audio asset is unavailable: $audioUrl`n$($_.Exception.Message)"
        }
    }
    Write-Host "Verified $($audioUrls.Count) neural-audio assets." -ForegroundColor Green

    Write-Stage 'Installing exact Node dependencies'
    Invoke-Checked npm ci

    Write-Stage 'Running formatting, lint, type, coverage, and production-build gates'
    Invoke-Checked npm run check

    Write-Stage 'Running the dedicated iPhone audio regression tests'
    Invoke-Checked npx vitest run src/app/screens/PracticeScreen.test.tsx

    if (-not $SkipBrowserTests) {
        Write-Stage 'Running browser acceptance tests'
        Invoke-Checked npx playwright install chromium
        Invoke-Checked npm run test:e2e
    }

    $distIndex = Join-Path $RepoRoot 'dist\index.html'
    if (-not (Test-Path $distIndex)) {
        throw 'The verified production build did not create dist\index.html.'
    }

    $distTimestamp = (Get-Item $distIndex).LastWriteTime
    Write-Host "Verified dist build timestamp: $distTimestamp" -ForegroundColor Green

    if (-not $SkipRestart) {
        Write-Stage 'Refreshing the private QCTP gateway'
        $tasks = Get-QctpScheduledTasks
        $gatewayConnections = @(Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue)

        if ($tasks.Count -gt 0) {
            foreach ($connection in $gatewayConnections) {
                if ($connection.OwningProcess -gt 0) {
                    Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }

            foreach ($task in $tasks) {
                Write-Host "Starting scheduled task: $($task.TaskPath)$($task.TaskName)"
                Start-ScheduledTask -InputObject $task
            }
        }
        elseif ($gatewayConnections.Count -gt 0) {
            Write-Host 'No QCTP scheduled task was found. The existing gateway remains running and will serve the rebuilt dist files directly.' -ForegroundColor Yellow
        }
        else {
            throw 'No QCTP scheduled task or running gateway was found. The build passed, but the private runtime could not be started automatically.'
        }
    }

    Write-Stage 'Verifying the rebuilt private runtime'
    if (-not (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/health')) {
        throw 'The QCTP gateway did not return a healthy response on http://127.0.0.1:8787/health.'
    }
    if (-not (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/')) {
        throw 'The rebuilt QCTP PWA did not return HTTP success on http://127.0.0.1:8787/.'
    }

    Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: PASS" -ForegroundColor Green
    Write-Host "Candidate: $head"
    Write-Host 'Close the QCTP Home Screen app completely, reopen it, then run the 50-second physical-iPhone audio acceptance:'
    Write-Host '1. Tap Practice -> Begin practice.'
    Write-Host '2. Confirm the opening Chill Brian cue plays immediately.'
    Write-Host '3. Leave the screen open and confirm the second cue plays automatically at 24:15.'
    Write-Host '4. End without completion after the second cue.'
}
catch {
    Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
