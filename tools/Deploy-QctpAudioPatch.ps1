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
$LiveStaticRoot = $null
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

function Invoke-RobocopyMirror {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    & robocopy.exe $Source $Destination /MIR /R:3 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Host
    $code = $LASTEXITCODE
    if ($code -gt 7) {
        throw "Robocopy failed with exit code $code while mirroring $Source to $Destination."
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
            $response = Invoke-WebRequest `
                -UseBasicParsing `
                -Uri $Uri `
                -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
                -TimeoutSec 8
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
        schema = 'qctp-private-runtime-build-v4'
        candidate_sha = $Head
        source_branch = $RequiredBranch
        audio_fix_present = $true
        isolated_staging_build = $true
        live_static_root_discovered = $true
        in_place_static_mirror = $true
        built_at = (Get-Date).ToUniversalTime().ToString('o')
        release_authority = 'ZERO_RELEASE_DEVICE_TEST_CANDIDATE'
    }
    $identityPath = Join-Path $DistDirectory 'QCTP_PRIVATE_RUNTIME_BUILD.json'
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText(
        $identityPath,
        ($identity | ConvertTo-Json -Depth 4),
        $utf8NoBom
    )
    return $identityPath
}

function Get-RuntimeIdentity {
    param([string]$ExpectedHead)

    $nonce = [Guid]::NewGuid().ToString('N')
    $uri = "http://127.0.0.1:8787/QCTP_PRIVATE_RUNTIME_BUILD.json?candidate=$ExpectedHead&nonce=$nonce"
    try {
        $response = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $uri `
            -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
            -TimeoutSec 8
        return [PSCustomObject]@{
            Success = $true
            StatusCode = $response.StatusCode
            Content = [string]$response.Content
            Identity = ([string]$response.Content | ConvertFrom-Json)
        }
    }
    catch {
        return [PSCustomObject]@{
            Success = $false
            StatusCode = $null
            Content = $_.Exception.Message
            Identity = $null
        }
    }
}

function Test-RuntimeIdentity {
    param(
        [Parameter(Mandatory = $true)][string]$ExpectedHead,
        [int]$Attempts = 10,
        [int]$DelayMilliseconds = 500
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
        $result = Get-RuntimeIdentity -ExpectedHead $ExpectedHead
        if (
            $result.Success -and
            $null -ne $result.Identity -and
            [string]$result.Identity.candidate_sha -eq $ExpectedHead -and
            [bool]$result.Identity.audio_fix_present
        ) {
            return $true
        }
        Start-Sleep -Milliseconds $DelayMilliseconds
    }
    return $false
}

function Get-QctpListenerProcessInfo {
    $connections = @(
        Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    )
    $details = @()
    foreach ($connection in $connections) {
        $process = Get-CimInstance `
            -ClassName Win32_Process `
            -Filter "ProcessId = $($connection.OwningProcess)" `
            -ErrorAction SilentlyContinue
        $details += [PSCustomObject]@{
            ProcessId = $connection.OwningProcess
            CommandLine = if ($null -eq $process) { '' } else { [string]$process.CommandLine }
            ExecutablePath = if ($null -eq $process) { '' } else { [string]$process.ExecutablePath }
        }
    }
    return $details
}

function Add-RootsFromCommandLine {
    param(
        [string]$CommandLine,
        [System.Collections.Generic.List[string]]$Candidates
    )

    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return }
    $patterns = @(
        '(?i)([A-Z]:\\[^"\r\n]*?)\\node_modules\\',
        '(?i)([A-Z]:\\[^"\r\n]*?)\\server\\index\.ts'
    )
    foreach ($pattern in $patterns) {
        foreach ($match in [regex]::Matches($CommandLine, $pattern)) {
            $root = $match.Groups[1].Value.Trim('"', "'", ' ')
            if (-not [string]::IsNullOrWhiteSpace($root)) {
                $Candidates.Add((Join-Path $root 'dist'))
            }
        }
    }
}

function Get-CandidateStaticRoots {
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    $candidates.Add((Join-Path $RepoRoot 'dist'))

    if (-not [string]::IsNullOrWhiteSpace($env:QCTP_LIVE_STATIC_ROOT_HINT)) {
        $candidates.Add($env:QCTP_LIVE_STATIC_ROOT_HINT)
    }

    $processDetails = @(Get-QctpListenerProcessInfo)
    foreach ($detail in $processDetails) {
        Write-Host "Gateway listener PID $($detail.ProcessId): $($detail.CommandLine)" -ForegroundColor DarkGray
        Add-RootsFromCommandLine -CommandLine $detail.CommandLine -Candidates $candidates
    }

    try {
        if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
            $tasks = @(
                Get-ScheduledTask -ErrorAction Stop | Where-Object {
                    $task = $_
                    $actionText = ($task.Actions | ForEach-Object {
                        "$($_.Execute) $($_.Arguments) $($_.WorkingDirectory)"
                    }) -join ' '
                    $task.TaskName -match 'QCTP' -or
                    $task.TaskPath -match 'QCTP' -or
                    $actionText -match 'QCTP' -or
                    $actionText -match [regex]::Escape($RepoRoot)
                }
            )
            foreach ($task in $tasks) {
                foreach ($action in $task.Actions) {
                    if (-not [string]::IsNullOrWhiteSpace([string]$action.WorkingDirectory)) {
                        $candidates.Add((Join-Path ([string]$action.WorkingDirectory) 'dist'))
                    }
                    Add-RootsFromCommandLine `
                        -CommandLine "$($action.Execute) $($action.Arguments)" `
                        -Candidates $candidates
                }
            }
        }
    }
    catch {
        Write-Host "Scheduled-task inspection was unavailable: $($_.Exception.Message)" -ForegroundColor DarkGray
    }

    $searchRoots = @(
        (Join-Path $env:USERPROFILE 'Documents\Codex'),
        (Join-Path $env:LOCALAPPDATA 'QCTP'),
        (Join-Path $env:USERPROFILE 'Documents\QCTP')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_) }

    foreach ($searchRoot in $searchRoots) {
        Write-Host "Scanning for QCTP dist roots under $searchRoot" -ForegroundColor DarkGray
        $indexFiles = @(
            Get-ChildItem `
                -LiteralPath $searchRoot `
                -Filter index.html `
                -File `
                -Recurse `
                -ErrorAction SilentlyContinue | Where-Object {
                    $_.Directory.Name -eq 'dist' -and
                    ($_.Directory.FullName -match '(?i)QCTP')
                }
        )
        foreach ($indexFile in $indexFiles) {
            $candidates.Add($indexFile.Directory.FullName)
        }
    }

    return @(
        $candidates |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace($_) -and
                (Test-Path -LiteralPath $_) -and
                (Test-Path -LiteralPath (Join-Path $_ 'index.html'))
            } |
            ForEach-Object { (Resolve-Path -LiteralPath $_).Path } |
            Sort-Object -Unique
    )
}

function Resolve-LiveStaticRoot {
    $candidates = @(Get-CandidateStaticRoots)
    if ($candidates.Count -eq 0) {
        throw 'No candidate QCTP static roots were found.'
    }

    Write-Host 'Candidate static roots:' -ForegroundColor DarkGray
    $candidates | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

    $token = [Guid]::NewGuid().ToString('N')
    $fileName = "QCTP_RUNTIME_ROOT_PROBE_$token.json"
    $writtenPaths = New-Object 'System.Collections.Generic.List[string]'
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    try {
        foreach ($candidate in $candidates) {
            $probePath = Join-Path $candidate $fileName
            try {
                $payload = [ordered]@{
                    qctp_runtime_root_probe = $token
                    candidate_path = $candidate
                } | ConvertTo-Json -Depth 3
                [IO.File]::WriteAllText($probePath, $payload, $utf8NoBom)
                $writtenPaths.Add($probePath)

                $uri = "http://127.0.0.1:8787/$fileName?nonce=$token"
                $response = Invoke-WebRequest `
                    -UseBasicParsing `
                    -Uri $uri `
                    -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
                    -TimeoutSec 8
                $decoded = [string]$response.Content | ConvertFrom-Json
                if ([string]$decoded.qctp_runtime_root_probe -eq $token) {
                    Write-Host "Confirmed live QCTP static root: $candidate" -ForegroundColor Green
                    return $candidate
                }
            }
            catch {
                Write-Host "Static-root probe did not match at $candidate" -ForegroundColor DarkGray
            }
        }
    }
    finally {
        foreach ($path in $writtenPaths) {
            Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        }
    }

    throw 'The private gateway is healthy, but none of the discovered QCTP dist directories is the static root it is serving.'
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
    param(
        [Parameter(Mandatory = $true)][string]$SourceDist,
        [Parameter(Mandatory = $true)][string]$DestinationParent
    )

    $candidate = Join-Path $DestinationParent ('.qctp-dist-candidate-' + [Guid]::NewGuid().ToString('N'))
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
    if ($BackupPath -and (Test-Path -LiteralPath $BackupPath)) {
        Invoke-RobocopyMirror -Source $BackupPath -Destination $CurrentDist
    }
}

try {
    Write-Stage 'QCTP audio-patch deployment preflight REV8'
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
    Write-Host 'The active QCTP node_modules directory is never modified.' -ForegroundColor DarkGray

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
        Write-Stage 'Confirming the existing private gateway is healthy'
        if (-not (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/health' -Attempts 3 -DelaySeconds 1)) {
            throw 'The existing private QCTP gateway is not healthy on port 8787. The verified build was not installed.'
        }

        Write-Stage 'Discovering the exact static root served by port 8787'
        $LiveStaticRoot = Resolve-LiveStaticRoot
        $liveParent = Split-Path -Parent $LiveStaticRoot

        Write-Stage 'Preparing verified dist package and rollback copy'
        $DeployCandidate = Copy-VerifiedDist -SourceDist $stageDist -DestinationParent $liveParent
        $BackupDist = Join-Path $liveParent ('.qctp-dist-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Invoke-RobocopyMirror -Source $LiveStaticRoot -Destination $BackupDist

        Write-Stage 'Mirroring the verified PWA into the live static root'
        Write-Host "Live static root: $LiveStaticRoot" -ForegroundColor Green
        Write-Host 'The gateway and active node_modules remain untouched.' -ForegroundColor DarkGray
        Invoke-RobocopyMirror -Source $DeployCandidate -Destination $LiveStaticRoot

        Write-Stage 'Verifying exact served build identity'
        $verified = (
            (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/health') -and
            (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/') -and
            (Test-RuntimeIdentity -ExpectedHead $head)
        )
        if (-not $verified) {
            $observed = Get-RuntimeIdentity -ExpectedHead $head
            Write-Host "Observed identity response: $($observed.Content)" -ForegroundColor Yellow
            Restore-PreviousDist -CurrentDist $LiveStaticRoot -BackupPath $BackupDist
            throw "The gateway did not prove it was serving candidate $head. The previous live static package was restored."
        }

        Remove-PathWithRetry -Path $BackupDist
        $BackupDist = $null

        Write-Host "`nQCTP AUDIO PATCH DEPLOYMENT: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
        Write-Host "Verified live static root: $LiveStaticRoot"
        Write-Host 'The private gateway is serving the newly built candidate identity.'
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
