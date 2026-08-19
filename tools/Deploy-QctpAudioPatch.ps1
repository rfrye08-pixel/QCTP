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
            $actionText -match $repoPattern
        }
    )
}

function Test-RequiredAudioFix {
    & git merge-base --is-ancestor $RequiredAudioFixCommit HEAD 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Write-RuntimeIdentity {
    param(
        [Parameter(Mandatory = $true)][string]$Head,
        [Parameter(Mandatory = $true)][string]$DistDirectory
    )

    $identity = [ordered]@{
        schema = 'qctp-private-runtime-build-v1'
        candidate_sha = $Head
        source_branch = $RequiredBranch
        audio_fix_present = $true
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
        return ([string]$identity.candidate_sha -eq $ExpectedHead)
    }
    catch {
        return $false
    }
}

try {
    Write-Stage 'QCTP audio-patch deployment preflight REV5'
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

    if (-not (Test-RequiredAudioFix)) {
        throw "The checked-out candidate does not contain the controlled iPhone audio fix."
    }
    Write-Host "Candidate head: $head" -ForegroundColor Green

    Write-Stage 'Verifying the controlled Day 1 audio inventory'
    $day1Path = Join-Path $RepoRoot 'src\foundation\day1.ts'
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
    Write-Host 'External HeyGen byte-signature probing is intentionally not a deployment blocker. The opening and delayed-cue mechanism already passed on the target iPhone, and runtime playback fails closed.' -ForegroundColor DarkGray

    Write-Stage 'Installing exact Node dependencies'
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
        Write-Host 'Full browser-suite reinstall is skipped in this private-runtime recovery. The repository CI and npm run check remain the governing automated gates.' -ForegroundColor DarkGray
    }

    $distDirectory = Join-Path $RepoRoot 'dist'
    $distIndex = Join-Path $distDirectory 'index.html'
    if (-not (Test-Path -LiteralPath $distIndex)) {
        throw 'The verified production build did not create dist\index.html.'
    }

    $identityPath = Write-RuntimeIdentity -Head $head -DistDirectory $distDirectory
    Write-Host "Wrote runtime identity: $identityPath" -ForegroundColor Green
    Write-Host "Verified dist build timestamp: $((Get-Item -LiteralPath $distIndex).LastWriteTime)" -ForegroundColor Green

    if ($VerifyBuildOnly) {
        Write-Host "`nQCTP AUDIO PATCH BUILD VERIFICATION: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
        exit 0
    }

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
    if (-not (Test-RuntimeIdentity -ExpectedHead $head)) {
        throw "The gateway is healthy but is not serving the newly built candidate identity $head."
    }

    Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: PASS" -ForegroundColor Green
    Write-Host "Candidate: $head"
    Write-Host 'The private gateway is serving the newly built candidate identity.'
    Write-Host 'Close the QCTP Home Screen app completely, reopen it, then verify the opening cue and automatic cue at 24:15.'
    exit 0
}
catch {
    Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
