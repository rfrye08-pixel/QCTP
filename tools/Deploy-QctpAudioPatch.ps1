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
$RequiredLocalAudioSchema = 'qctp-day1-local-audio-pack-v2'
$RequiredLocalAudioFileCount = 23
$RequiredLocalAudioBytes = 13340411
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StageRoot = $null
$StageRepo = $null
$LiveStaticRoot = $null
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
        [int]$Attempts = 10,
        [int]$DelayMilliseconds = 500
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
        catch { }
        Start-Sleep -Milliseconds $DelayMilliseconds
    }
    return $false
}

function Test-RequiredAudioFix {
    param([Parameter(Mandatory = $true)][string]$Repository)

    & git -C $Repository merge-base --is-ancestor $RequiredAudioFixCommit HEAD 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Test-Mp3File {
    param([Parameter(Mandatory = $true)][string]$Path)

    $buffer = New-Object byte[] 3
    $stream = [IO.File]::Open(
        $Path,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::Read
    )
    try {
        $read = $stream.Read($buffer, 0, $buffer.Length)
    }
    finally {
        $stream.Dispose()
    }

    if ($read -lt 2) { return $false }
    $hasId3 = $read -ge 3 -and $buffer[0] -eq 0x49 -and $buffer[1] -eq 0x44 -and $buffer[2] -eq 0x33
    $hasFrameSync = $buffer[0] -eq 0xff -and (($buffer[1] -band 0xe0) -eq 0xe0)
    return ($hasId3 -or $hasFrameSync)
}

function Assert-LocalAudioPack {
    param([Parameter(Mandatory = $true)][string]$AudioDirectory)

    $manifestPath = Join-Path $AudioDirectory 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "The Day 1 local audio manifest is missing: $manifestPath"
    }

    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    $records = @($manifest.files)
    if ([string]$manifest.schema -ne $RequiredLocalAudioSchema) {
        throw "Unexpected Day 1 audio schema: $($manifest.schema)"
    }
    if ([int]$manifest.fileCount -ne $RequiredLocalAudioFileCount -or $records.Count -ne $RequiredLocalAudioFileCount) {
        throw "Expected $RequiredLocalAudioFileCount Day 1 audio records; manifest reports $($manifest.fileCount) and contains $($records.Count)."
    }
    if ([int64]$manifest.totalBytes -ne $RequiredLocalAudioBytes) {
        throw "Expected $RequiredLocalAudioBytes Day 1 audio bytes; manifest reports $($manifest.totalBytes)."
    }
    if ([string]$manifest.mediaType -ne 'audio/mpeg') {
        throw "Expected Day 1 media type audio/mpeg; manifest reports $($manifest.mediaType)."
    }

    foreach ($record in $records) {
        $relativePath = [string]$record.relativePath
        if (-not $relativePath.EndsWith('.mp3', [StringComparison]::OrdinalIgnoreCase)) {
            throw "Day 1 audio record $($record.id) is not stored as MP3: $relativePath"
        }
        if ([string]$record.mediaType -ne 'audio/mpeg') {
            throw "Day 1 audio record $($record.id) has media type $($record.mediaType)."
        }

        $audioPath = Join-Path $AudioDirectory $relativePath
        if (-not (Test-Path -LiteralPath $audioPath)) {
            throw "Day 1 audio file is missing: $audioPath"
        }
        $actualBytes = (Get-Item -LiteralPath $audioPath).Length
        if ($actualBytes -ne [int64]$record.bytes) {
            throw "Day 1 audio size mismatch for $relativePath. Expected $($record.bytes), found $actualBytes."
        }
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $audioPath).Hash.ToLowerInvariant()
        $expectedHash = ([string]$record.sha256).ToLowerInvariant()
        if ($actualHash -ne $expectedHash) {
            throw "Day 1 audio SHA-256 mismatch for $relativePath."
        }
        if (-not (Test-Mp3File -Path $audioPath)) {
            throw "Day 1 audio file is not valid MP3-framed data: $relativePath"
        }
    }

    $manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
    Write-Host "Verified local Day 1 audio pack: $($records.Count) MP3 files, $($manifest.totalBytes) bytes, manifest SHA-256 $manifestHash" -ForegroundColor Green
    return [PSCustomObject]@{
        Manifest = $manifest
        ManifestPath = $manifestPath
        ManifestSha256 = $manifestHash
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

function Write-RuntimeIdentity {
    param(
        [Parameter(Mandatory = $true)][string]$Head,
        [Parameter(Mandatory = $true)][string]$DistDirectory,
        [Parameter(Mandatory = $true)][string]$LocalAudioManifestSha256
    )

    $identity = [ordered]@{
        schema = 'qctp-private-runtime-build-v6'
        candidate_sha = $Head
        source_branch = $RequiredBranch
        audio_fix_present = $true
        local_day1_audio_pack = $true
        local_day1_audio_schema = $RequiredLocalAudioSchema
        local_day1_audio_file_count = $RequiredLocalAudioFileCount
        local_day1_audio_total_bytes = $RequiredLocalAudioBytes
        local_day1_audio_manifest_sha256 = $LocalAudioManifestSha256
        live_third_party_audio_required = $false
        isolated_staging_build = $true
        live_static_root_probed = $true
        in_place_static_mirror = $true
        built_at = (Get-Date).ToUniversalTime().ToString('o')
        release_authority = 'ZERO_RELEASE_DEVICE_TEST_CANDIDATE'
    }
    $path = Join-Path $DistDirectory 'QCTP_PRIVATE_RUNTIME_BUILD.json'
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($path, ($identity | ConvertTo-Json -Depth 4), $utf8NoBom)
    return $path
}

function Get-ListenerProcessInfo {
    $connections = @(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)
    $details = @()
    foreach ($connection in $connections) {
        $process = Get-CimInstance `
            -ClassName Win32_Process `
            -Filter "ProcessId = $($connection.OwningProcess)" `
            -ErrorAction SilentlyContinue
        $details += [PSCustomObject]@{
            ProcessId = $connection.OwningProcess
            CommandLine = if ($null -eq $process) { '' } else { [string]$process.CommandLine }
        }
    }
    return $details
}

function Add-CommandLineRoots {
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

    foreach ($detail in @(Get-ListenerProcessInfo)) {
        Write-Host "Gateway listener PID $($detail.ProcessId): $($detail.CommandLine)" -ForegroundColor DarkGray
        Add-CommandLineRoots -CommandLine $detail.CommandLine -Candidates $candidates
    }

    $searchRoots = @(
        (Join-Path $env:USERPROFILE 'Documents\Codex'),
        (Join-Path $env:LOCALAPPDATA 'QCTP'),
        (Join-Path $env:USERPROFILE 'Documents\QCTP')
    ) | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_) -and
        (Test-Path -LiteralPath $_)
    }

    foreach ($searchRoot in $searchRoots) {
        Write-Host "Scanning for QCTP dist roots under $searchRoot" -ForegroundColor DarkGray
        foreach ($indexFile in @(
            Get-ChildItem `
                -LiteralPath $searchRoot `
                -Filter index.html `
                -File `
                -Recurse `
                -ErrorAction SilentlyContinue | Where-Object {
                    $_.Directory.Name -eq 'dist' -and
                    $_.Directory.FullName -match '(?i)QCTP'
                }
        )) {
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

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    foreach ($candidate in $candidates) {
        $token = [Guid]::NewGuid().ToString('N')
        $fileName = "QCTP_RUNTIME_ROOT_PROBE_$token.json"
        $probePath = Join-Path $candidate $fileName
        try {
            [IO.File]::WriteAllText(
                $probePath,
                (ConvertTo-Json ([ordered]@{
                    qctp_runtime_root_probe = $token
                    candidate_path = $candidate
                }) -Depth 3),
                $utf8NoBom
            )

            $uri = "http://127.0.0.1:8787/$($fileName)?nonce=$token"
            for ($attempt = 1; $attempt -le 5; $attempt += 1) {
                try {
                    $decoded = Invoke-RestMethod `
                        -Uri $uri `
                        -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
                        -TimeoutSec 8
                    if ([string]$decoded.qctp_runtime_root_probe -eq $token) {
                        Write-Host "Confirmed live QCTP static root: $candidate" -ForegroundColor Green
                        return $candidate
                    }
                }
                catch { }
                Start-Sleep -Milliseconds 250
            }
            Write-Host "Static-root probe did not match at $candidate" -ForegroundColor DarkGray
        }
        finally {
            Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
        }
    }

    throw 'The private gateway is healthy, but none of the discovered QCTP dist directories is the static root it is serving.'
}

function Test-ServedIdentity {
    param(
        [Parameter(Mandatory = $true)][string]$ExpectedHead,
        [Parameter(Mandatory = $true)][string]$ExpectedManifestSha256,
        [int]$Attempts = 12
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
        try {
            $uri = "http://127.0.0.1:8787/QCTP_PRIVATE_RUNTIME_BUILD.json?candidate=$ExpectedHead&nonce=$([Guid]::NewGuid().ToString('N'))"
            $identity = Invoke-RestMethod `
                -Uri $uri `
                -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
                -TimeoutSec 8
            if (
                [string]$identity.candidate_sha -eq $ExpectedHead -and
                [bool]$identity.audio_fix_present -and
                [bool]$identity.local_day1_audio_pack -and
                [string]$identity.local_day1_audio_schema -eq $RequiredLocalAudioSchema -and
                [int]$identity.local_day1_audio_file_count -eq $RequiredLocalAudioFileCount -and
                [int64]$identity.local_day1_audio_total_bytes -eq $RequiredLocalAudioBytes -and
                [string]$identity.local_day1_audio_manifest_sha256 -eq $ExpectedManifestSha256 -and
                -not [bool]$identity.live_third_party_audio_required
            ) {
                return $true
            }
        }
        catch { }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Test-ServedLocalAudioPack {
    param([Parameter(Mandatory = $true)][string]$ExpectedManifestSha256)

    try {
        $manifestTemp = Join-Path ([IO.Path]::GetTempPath()) ("qctp-day1-manifest-{0}.json" -f [Guid]::NewGuid().ToString('N'))
        try {
            $manifestUri = "http://127.0.0.1:8787/audio/day1/manifest.json?nonce=$([Guid]::NewGuid().ToString('N'))"
            Invoke-WebRequest `
                -UseBasicParsing `
                -Uri $manifestUri `
                -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
                -OutFile $manifestTemp `
                -TimeoutSec 15
            $manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestTemp).Hash.ToLowerInvariant()
            if ($manifestHash -ne $ExpectedManifestSha256) { return $false }
            $manifest = Get-Content -Raw -LiteralPath $manifestTemp | ConvertFrom-Json
        }
        finally {
            Remove-Item -LiteralPath $manifestTemp -Force -ErrorAction SilentlyContinue
        }

        if (
            [string]$manifest.schema -ne $RequiredLocalAudioSchema -or
            [int]$manifest.fileCount -ne $RequiredLocalAudioFileCount -or
            [int64]$manifest.totalBytes -ne $RequiredLocalAudioBytes -or
            [string]$manifest.mediaType -ne 'audio/mpeg'
        ) {
            return $false
        }

        foreach ($probeId in @('cue-0000', 'cue-0045')) {
            $record = @($manifest.files | Where-Object { [string]$_.id -eq $probeId } | Select-Object -First 1)
            if ($record.Count -ne 1) { return $false }
            $audioTemp = Join-Path ([IO.Path]::GetTempPath()) ("qctp-$probeId-{0}.mp3" -f [Guid]::NewGuid().ToString('N'))
            try {
                $audioUri = "http://127.0.0.1:8787/audio/day1/$([string]$record[0].relativePath)?nonce=$([Guid]::NewGuid().ToString('N'))"
                Invoke-WebRequest `
                    -UseBasicParsing `
                    -Uri $audioUri `
                    -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
                    -OutFile $audioTemp `
                    -TimeoutSec 30
                if ((Get-Item -LiteralPath $audioTemp).Length -ne [int64]$record[0].bytes) { return $false }
                $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $audioTemp).Hash.ToLowerInvariant()
                if ($actualHash -ne ([string]$record[0].sha256).ToLowerInvariant()) { return $false }
                if (-not (Test-Mp3File -Path $audioTemp)) { return $false }
            }
            finally {
                Remove-Item -LiteralPath $audioTemp -Force -ErrorAction SilentlyContinue
            }
        }

        return $true
    }
    catch {
        Write-Host "Served local-audio verification error: $($_.Exception.Message)" -ForegroundColor DarkGray
        return $false
    }
}

try {
    Write-Stage 'QCTP same-origin audio deployment preflight REV10'
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
    $head = (& git rev-parse HEAD).Trim()
    $remoteHead = (& git rev-parse "origin/$RequiredBranch").Trim()
    if ($currentBranch -ne $RequiredBranch -or $head -ne $remoteHead) {
        throw "The checkout is not aligned to origin/$RequiredBranch. Rerun the locator/updater."
    }
    if (-not (Test-RequiredAudioFix -Repository $RepoRoot)) {
        throw 'The candidate does not contain the controlled iPhone audio fix.'
    }
    Write-Host "Candidate head: $head" -ForegroundColor Green

    Write-Stage 'Creating isolated staging clone'
    $stage = New-IsolatedClone -Head $head
    $StageRoot = $stage.Root
    $StageRepo = $stage.Repository
    Write-Host "Staging repository: $StageRepo" -ForegroundColor Green

    Write-Stage 'Verifying protected source references and committed same-origin audio'
    $day1Source = Get-Content -Raw -LiteralPath (Join-Path $StageRepo 'src\foundation\day1.ts')
    $audioUrls = @(
        [regex]::Matches($day1Source, 'https://resource2\.heygen\.ai/[^"\s]+\.wav') |
            ForEach-Object { $_.Value } |
            Sort-Object -Unique
    )
    if ($audioUrls.Count -ne 23) {
        throw "Expected 23 protected source audio references, found $($audioUrls.Count)."
    }
    $sourceAudioPack = Assert-LocalAudioPack -AudioDirectory (Join-Path $StageRepo 'public\audio\day1')

    Push-Location $StageRepo
    try {
        Write-Stage 'Installing exact dependencies in isolated staging'
        Invoke-Checked -Command npm -Arguments @('ci')

        Write-Stage 'Running lint, type, coverage, and production build'
        Invoke-Checked -Command npm -Arguments @('run', 'lint')
        Invoke-Checked -Command npm -Arguments @('run', 'typecheck')
        Invoke-Checked -Command npm -Arguments @('run', 'test:coverage')
        Invoke-Checked -Command npm -Arguments @('run', 'build')

        Write-Stage 'Running dedicated same-origin iPhone audio regression tests'
        Invoke-Checked -Command npx -Arguments @('vitest', 'run', 'src/audio-player/day1-local-audio.test.ts', 'src/app/screens/PracticeScreen.test.tsx', 'server/index.test.ts')

        if ($RunBrowserTests -and -not $SkipBrowserTests) {
            Invoke-Checked -Command npx -Arguments @('playwright', 'install', 'chromium')
            Invoke-Checked -Command npm -Arguments @('run', 'test:e2e')
        }
    }
    finally {
        Pop-Location
    }

    $stageDist = Join-Path $StageRepo 'dist'
    if (-not (Test-Path -LiteralPath (Join-Path $stageDist 'index.html'))) {
        throw 'The isolated build did not create dist\index.html.'
    }
    $distAudioPack = Assert-LocalAudioPack -AudioDirectory (Join-Path $stageDist 'audio\day1')
    if ($distAudioPack.ManifestSha256 -ne $sourceAudioPack.ManifestSha256) {
        throw 'The built Day 1 audio manifest does not match the committed source pack.'
    }
    $identityPath = Write-RuntimeIdentity `
        -Head $head `
        -DistDirectory $stageDist `
        -LocalAudioManifestSha256 $distAudioPack.ManifestSha256
    Write-Host "Wrote staged runtime identity: $identityPath" -ForegroundColor Green

    if ($VerifyBuildOnly) {
        Write-Host "`nQCTP SAME-ORIGIN AUDIO BUILD VERIFICATION: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
        Write-Host "Local audio manifest SHA-256: $($distAudioPack.ManifestSha256)"
    }
    else {
        Write-Stage 'Confirming the existing private gateway is healthy'
        if (-not (Test-HttpEndpoint -Uri 'http://127.0.0.1:8787/health' -Attempts 3)) {
            throw 'The existing QCTP gateway is not healthy. No files were installed.'
        }

        Write-Stage 'Discovering the exact static root served by port 8787'
        $LiveStaticRoot = Resolve-LiveStaticRoot
        $BackupDist = Join-Path $StageRoot 'live-dist-backup'
        Invoke-RobocopyMirror -Source $LiveStaticRoot -Destination $BackupDist

        Write-Stage 'Mirroring the verified PWA and local audio into the confirmed live static root'
        Write-Host "Live static root: $LiveStaticRoot" -ForegroundColor Green
        Invoke-RobocopyMirror -Source $stageDist -Destination $LiveStaticRoot

        Write-Stage 'Verifying exact served build identity and local audio bytes'
        $identityPassed = Test-ServedIdentity `
            -ExpectedHead $head `
            -ExpectedManifestSha256 $distAudioPack.ManifestSha256
        $audioPassed = Test-ServedLocalAudioPack `
            -ExpectedManifestSha256 $distAudioPack.ManifestSha256
        if (-not $identityPassed -or -not $audioPassed) {
            Write-Host 'Served build or local audio did not verify; restoring the previous static package.' -ForegroundColor Yellow
            Invoke-RobocopyMirror -Source $BackupDist -Destination $LiveStaticRoot
            throw "The gateway did not prove it was serving candidate $head with the exact local Day 1 audio pack. The previous static package was restored."
        }

        Write-Host "`nQCTP SAME-ORIGIN AUDIO DEPLOYMENT: PASS" -ForegroundColor Green
        Write-Host "Candidate: $head"
        Write-Host "Verified live static root: $LiveStaticRoot"
        Write-Host "Verified local audio manifest SHA-256: $($distAudioPack.ManifestSha256)"
        Write-Host 'The private gateway is serving the same-origin, checksum-verified Day 1 audio pack.'
        Write-Host 'Close the iPhone Home Screen app, reopen it, and verify the opening cue plus the automatic cue at 24:15.'
    }
}
catch {
    $ExitCode = 1
    Write-Host "`nQCTP SAME-ORIGIN AUDIO DEPLOYMENT: FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
    if ($StageRoot -and (Test-Path -LiteralPath $StageRoot)) {
        try { Remove-PathWithRetry -Path $StageRoot } catch {
            Write-Host "Staging cleanup warning: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

exit $ExitCode
