[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'QctpRev3Runtime.Common.ps1')

$candidateMap = @{}

function Get-QctpObjectProperty {
    param(
        $Value,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $Value) { return $null }
    $property = $Value.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Add-QctpCandidateRoot {
    param(
        [string]$Path,
        [Parameter(Mandatory = $true)][string]$Source
    )

    if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path)) {
        return
    }
    try {
        $resolved = Resolve-QctpAbsolutePath -Path $Path
    }
    catch {
        return
    }
    $key = $resolved.ToLowerInvariant()
    if (-not $candidateMap.ContainsKey($key)) {
        $candidateMap[$key] = [ordered]@{
            path = $resolved
            sources = New-Object 'System.Collections.Generic.List[string]'
        }
    }
    if (-not $candidateMap[$key].sources.Contains($Source)) {
        $candidateMap[$key].sources.Add($Source)
    }
}

function Add-QctpRootsFromText {
    param(
        [string]$Text,
        [Parameter(Mandatory = $true)][string]$Source
    )

    if ([string]::IsNullOrWhiteSpace($Text)) { return }
    $patterns = @(
        '(?im)\$(?:qctpRoot|repoRoot)\s*=\s*["''](?<root>[A-Z]:\\[^"'']+)["'']',
        '(?i)["''](?<root>[A-Z]:\\[^"'']*?)\\server\\index\.(?:ts|js)["'']',
        '(?i)["''](?<root>[A-Z]:\\[^"'']*?\\dist)["'']',
        '(?i)(?<root>[A-Z]:\\[^\r\n]*?\\QCTP[^\r\n]*?\\dist)(?:\s|$)'
    )
    foreach ($pattern in $patterns) {
        foreach ($match in [regex]::Matches($Text, $pattern)) {
            $root = $match.Groups['root'].Value.Trim('"', "'", ' ')
            if ($root -match '(?i)\\server$') {
                $root = Split-Path -Parent $root
            }
            if (-not $root.EndsWith('\dist', [StringComparison]::OrdinalIgnoreCase)) {
                $root = Join-Path $root 'dist'
            }
            Add-QctpCandidateRoot -Path $root -Source $Source
        }
    }
}

$listeners = New-Object 'System.Collections.Generic.List[object]'
foreach ($connection in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)) {
    if ($connection.LocalPort -notin @(8787, 8788, 11434, 4173, 4179)) {
        continue
    }
    $process = Get-CimInstance `
        -ClassName Win32_Process `
        -Filter "ProcessId = $($connection.OwningProcess)" `
        -ErrorAction SilentlyContinue
    $commandLine = if ($null -eq $process) { '' } else { [string]$process.CommandLine }
    Add-QctpRootsFromText -Text $commandLine -Source "listener:$($connection.LocalPort):$($connection.OwningProcess)"
    $listeners.Add([ordered]@{
        localAddress = [string]$connection.LocalAddress
        localPort = [int]$connection.LocalPort
        processId = [int]$connection.OwningProcess
        processName = if ($null -eq $process) { $null } else { [string]$process.Name }
        commandLineSha256 = if ([string]::IsNullOrWhiteSpace($commandLine)) {
            $null
        }
        else {
            Get-QctpStringSha256 -Value $commandLine
        }
    })
}

$scheduledTasks = New-Object 'System.Collections.Generic.List[object]'
foreach ($task in @(Get-ScheduledTask -ErrorAction SilentlyContinue)) {
    $actionText = ($task.Actions | ForEach-Object {
        "$(Get-QctpObjectProperty -Value $_ -Name 'Execute') $(Get-QctpObjectProperty -Value $_ -Name 'Arguments') $(Get-QctpObjectProperty -Value $_ -Name 'WorkingDirectory')"
    }) -join ' '
    if (
        $task.TaskName -notmatch '(?i)QCTP' -and
        $task.TaskPath -notmatch '(?i)QCTP' -and
        $actionText -notmatch '(?i)QCTP'
    ) {
        continue
    }
    $launcherHashes = New-Object 'System.Collections.Generic.List[string]'
    foreach ($action in @($task.Actions)) {
        $workingDirectory = [string](Get-QctpObjectProperty -Value $action -Name 'WorkingDirectory')
        $execute = [string](Get-QctpObjectProperty -Value $action -Name 'Execute')
        $arguments = [string](Get-QctpObjectProperty -Value $action -Name 'Arguments')
        if (-not [string]::IsNullOrWhiteSpace($workingDirectory)) {
            Add-QctpCandidateRoot `
                -Path (Join-Path $workingDirectory 'dist') `
                -Source "scheduled-task:$($task.TaskPath)$($task.TaskName)"
        }
        Add-QctpRootsFromText `
            -Text "$execute $arguments" `
            -Source "scheduled-task:$($task.TaskPath)$($task.TaskName)"
        foreach ($match in [regex]::Matches($arguments, '(?i)-File\s+["''](?<path>[A-Z]:\\[^"'']+\.ps1)["'']')) {
            $launcherPath = $match.Groups['path'].Value
            if (
                $launcherPath -notmatch '(?i)QCTP' -or
                -not (Test-Path -LiteralPath $launcherPath -PathType Leaf)
            ) {
                continue
            }
            $launcher = Get-Item -LiteralPath $launcherPath
            if (
                $launcher.Length -gt 1MB -or
                ($launcher.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
            ) {
                continue
            }
            $launcherHashes.Add((Get-QctpSha256 -Path $launcherPath))
            $launcherText = Get-Content -LiteralPath $launcherPath -Raw
            Add-QctpRootsFromText `
                -Text $launcherText `
                -Source "scheduled-task-launcher:$($task.TaskPath)$($task.TaskName)"
        }
    }
    $scheduledTasks.Add([ordered]@{
        taskName = [string]$task.TaskName
        taskPath = [string]$task.TaskPath
        state = [string]$task.State
        actionCount = @($task.Actions).Count
        actionSummarySha256 = Get-QctpStringSha256 -Value $actionText
        launcherSha256 = @($launcherHashes | ForEach-Object { $_ })
    })
}

foreach ($environmentName in @('QCTP_LIVE_STATIC_ROOT', 'QCTP_LIVE_STATIC_ROOT_HINT')) {
    $value = [Environment]::GetEnvironmentVariable($environmentName)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
        Add-QctpCandidateRoot -Path $value -Source "environment:$environmentName"
    }
}

$knownRoots = @(
    (Join-Path $env:LOCALAPPDATA 'QCTP\dist'),
    (Join-Path $env:LOCALAPPDATA 'QCTP\runtime\dist'),
    (Join-Path $env:USERPROFILE 'Documents\QCTP\dist')
)
foreach ($root in $knownRoots) {
    Add-QctpCandidateRoot -Path $root -Source 'known-private-runtime-location'
}

$roots = New-Object 'System.Collections.Generic.List[object]'
foreach ($record in @($candidateMap.Values | Sort-Object { $_.path })) {
    $exists = Test-Path -LiteralPath $record.path -PathType Container
    $hasIndex = $exists -and (Test-Path -LiteralPath (Join-Path $record.path 'index.html') -PathType Leaf)
    $identityPath = Join-Path $record.path $script:QctpRev3IdentityName
    $legacyIdentityPath = Join-Path $record.path 'QCTP_PRIVATE_RUNTIME_BUILD.json'
    $identity = $null
    $identitySha256 = $null
    $identityKind = $null
    foreach ($probe in @(
        [PSCustomObject]@{ Path = $identityPath; Kind = 'rev3' },
        [PSCustomObject]@{ Path = $legacyIdentityPath; Kind = 'legacy' }
    )) {
        if (Test-Path -LiteralPath $probe.Path -PathType Leaf) {
            try {
                $identity = Get-Content -LiteralPath $probe.Path -Raw | ConvertFrom-Json
                $identitySha256 = Get-QctpSha256 -Path $probe.Path
                $identityKind = $probe.Kind
                break
            }
            catch { }
        }
    }
    $roots.Add([ordered]@{
        path = [string]$record.path
        sources = @($record.sources | ForEach-Object { $_ })
        exists = $exists
        hasIndex = $hasIndex
        identityKind = $identityKind
        identitySha256 = $identitySha256
        candidateSha = if ($null -eq $identity) { $null } elseif ($null -ne (Get-QctpObjectProperty -Value $identity -Name 'candidateSha')) {
            [string](Get-QctpObjectProperty -Value $identity -Name 'candidateSha')
        } else { [string](Get-QctpObjectProperty -Value $identity -Name 'candidate_sha') }
        releaseAuthority = if ($null -eq $identity) { $null } elseif ($null -ne (Get-QctpObjectProperty -Value $identity -Name 'releaseAuthority')) {
            [string](Get-QctpObjectProperty -Value $identity -Name 'releaseAuthority')
        } else { [string](Get-QctpObjectProperty -Value $identity -Name 'release_authority') }
    })
}

$loopback = [ordered]@{
    gatewayHealth = $null
    rev3Identity = $null
    rev3IdentitySha256 = $null
}
try {
    $healthResponse = Invoke-WebRequest `
        -UseBasicParsing `
        -NoProxy `
        -Uri 'http://127.0.0.1:8787/health' `
        -TimeoutSec 3 `
        -Headers @{ 'Cache-Control' = 'no-store' }
    $loopback.gatewayHealth = [ordered]@{
        statusCode = [int]$healthResponse.StatusCode
        bodySha256 = Get-QctpStringSha256 -Value ([string]$healthResponse.Content)
    }
}
catch { }
try {
    $identityResponse = Invoke-WebRequest `
        -UseBasicParsing `
        -NoProxy `
        -Uri "http://127.0.0.1:8787/$script:QctpRev3IdentityName" `
        -TimeoutSec 3 `
        -Headers @{ 'Cache-Control' = 'no-store' }
    $loopback.rev3Identity = ([string]$identityResponse.Content | ConvertFrom-Json)
    $loopback.rev3IdentitySha256 = Get-QctpStringSha256 -Value ([string]$identityResponse.Content)
}
catch { }

$result = [ordered]@{
    schema = 'qctp-rev3-live-runtime-read-only-discovery-v1'
    performedAt = (Get-Date).ToUniversalTime().ToString('o')
    mutationPerformed = $false
    listeners = @($listeners | ForEach-Object { $_ })
    scheduledTasks = @($scheduledTasks | ForEach-Object { $_ })
    candidateStaticRoots = @($roots | ForEach-Object { $_ })
    loopback = $loopback
    note = 'Discovery is read-only. A candidate path is not treated as live unless exact served identity is independently verified.'
}

$result | ConvertTo-Json -Depth 10
