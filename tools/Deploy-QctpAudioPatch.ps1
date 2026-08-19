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
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

function Get-RecoveryRoot {
    $documents = [Environment]::GetFolderPath('MyDocuments')
    if ([string]::IsNullOrWhiteSpace($documents)) {
        $documents = Join-Path $env:USERPROFILE 'Documents'
    }
    $root = Join-Path $documents 'QCTP Recovery Backups'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    return $root
}

function Preserve-LocalBranchAndAlign {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][string]$Branch
    )

    Invoke-Checked -Command git -Arguments @('-C', $Repository, 'fetch', 'origin', $Branch)

    $currentBranch = (& git -C $Repository branch --show-current).Trim()
    if ($currentBranch -ne $Branch) {
        & git -C $Repository show-ref --verify --quiet "refs/heads/$Branch"
        if ($LASTEXITCODE -eq 0) {
            Invoke-Checked -Command git -Arguments @('-C', $Repository, 'checkout', $Branch)
        }
        else {
            Invoke-Checked -Command git -Arguments @('-C', $Repository, 'checkout', '-B', $Branch, "origin/$Branch")
        }
    }

    $localHead = (& git -C $Repository rev-parse HEAD).Trim()
    $remoteHead = (& git -C $Repository rev-parse "origin/$Branch").Trim()
    if ($localHead -eq $remoteHead) {
        Write-Host "Controlled branch already matches origin at $localHead" -ForegroundColor Green
        return
    }

    $countText = ((& git -C $Repository rev-list --left-right --count "$localHead...$remoteHead") -join ' ').Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not compare local and remote QCTP branch heads.'
    }
    $counts = @($countText -split '\s+' | Where-Object { $_ -ne '' })
    if ($counts.Count -lt 2) {
        throw "Unexpected branch-comparison output: $countText"
    }
    $localOnly = [int]$counts[0]
    $remoteOnly = [int]$counts[1]

    if ($localOnly -gt 0) {
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupBranch = "qctp-local-preserved-$timestamp"
        $suffix = 1
        while ($true) {
            & git -C $Repository show-ref --verify --quiet "refs/heads/$backupBranch"
            if ($LASTEXITCODE -ne 0) { break }
            $backupBranch = "qctp-local-preserved-$timestamp-$suffix"
            $suffix += 1
        }

        Invoke-Checked -Command git -Arguments @('-C', $Repository, 'branch', $backupBranch, $localHead)

        $recoveryRoot = Get-RecoveryRoot
        $recoveryDir = Join-Path $recoveryRoot $backupBranch
        New-Item -ItemType Directory -Path $recoveryDir -Force | Out-Null

        @(
            'QCTP local branch preservation',
            "Created: $(Get-Date -Format o)",
            "Repository: $Repository",
            "Original local head: $localHead",
            "Controlled remote head: $remoteHead",
            "Preserved local branch: $backupBranch",
            "Local-only commits: $localOnly",
            "Remote-only commits: $remoteOnly",
            '',
            'The active controlled branch was aligned to origin only after this backup branch was created.',
            'Do not delete the preserved branch or recovery bundle until the QCTP candidate is formally released.'
        ) | Set-Content -LiteralPath (Join-Path $recoveryDir 'RECOVERY_README.txt') -Encoding UTF8

        (& git -C $Repository log --oneline --decorate --graph --max-count=120 $backupBranch) |
            Set-Content -LiteralPath (Join-Path $recoveryDir 'LOCAL_BRANCH_HISTORY.txt') -Encoding UTF8
        (& git -C $Repository log --oneline "origin/$Branch..$backupBranch") |
            Set-Content -LiteralPath (Join-Path $recoveryDir 'LOCAL_ONLY_COMMITS.txt') -Encoding UTF8
        (& git -C $Repository log --oneline "$backupBranch..origin/$Branch") |
            Set-Content -LiteralPath (Join-Path $recoveryDir 'REMOTE_ONLY_COMMITS.txt') -Encoding UTF8
        (& git -C $Repository diff --stat $remoteHead $localHead) |
            Set-Content -LiteralPath (Join-Path $recoveryDir 'LOCAL_VS_REMOTE_DIFFSTAT.txt') -Encoding UTF8

        $bundlePath = Join-Path $recoveryDir "$backupBranch.bundle"
        & git -C $Repository bundle create $bundlePath "refs/heads/$backupBranch" "refs/remotes/origin/$Branch"
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'The local backup branch was created, but the optional portable Git bundle could not be created.' -ForegroundColor Yellow
        }
        else {
            Write-Host "Preserved divergent local commits in branch $backupBranch and bundle $bundlePath" -ForegroundColor Yellow
        }
    }

    Invoke-Checked -Command git -Arguments @('-C', $Repository, 'reset', '--hard', "origin/$Branch")
    $alignedHead = (& git -C $Repository rev-parse HEAD).Trim()
    if ($alignedHead -ne $remoteHead) {
        throw "Controlled branch alignment failed. Expected $remoteHead, found $alignedHead."
    }
    Write-Host "Controlled branch aligned to origin at $alignedHead" -ForegroundColor Green
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
    Preserve-LocalBranchAndAlign -Repository $RepoRoot -Branch $RequiredBranch

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
    Invoke-Checked -Command npm -Arguments @('ci')

    Write-Stage 'Running formatting, lint, type, coverage, and production-build gates'
    Invoke-Checked -Command npm -Arguments @('run', 'check')

    Write-Stage 'Running the dedicated iPhone audio regression tests'
    Invoke-Checked -Command npx -Arguments @('vitest', 'run', 'src/app/screens/PracticeScreen.test.tsx')

    if (-not $SkipBrowserTests) {
        Write-Stage 'Running browser acceptance tests'
        Invoke-Checked -Command npx -Arguments @('playwright', 'install', 'chromium')
        Invoke-Checked -Command npm -Arguments @('run', 'test:e2e')
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
