[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CandidateDirectory,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[0-9a-f]{40}$")]
  [string]$ExpectedCandidateSha,

  [ValidateRange(1, 65535)]
  [int]$Port = 4179,

  [string]$TaskName = "QCTP Rev3 Private Preview",

  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "QCTP\rev3-preview")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$sourceLauncher = Join-Path $PSScriptRoot "Start-QctpRev3PrivatePreview.ps1"
$sourceServer = Join-Path $PSScriptRoot "preview-server.mjs"
if (-not (Test-Path -LiteralPath $sourceLauncher -PathType Leaf)) {
  throw "The Rev3 preview launcher is missing."
}
if (-not (Test-Path -LiteralPath $sourceServer -PathType Leaf)) {
  throw "The Rev3 preview server is missing."
}
if (-not (Test-Path -LiteralPath $CandidateDirectory -PathType Container)) {
  throw "The controlled candidate directory is missing: $CandidateDirectory"
}

$resolvedCandidate = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$identityPath = Join-Path $resolvedCandidate "site\QCTP_REV3_RUNTIME_IDENTITY.json"
if (-not (Test-Path -LiteralPath $identityPath -PathType Leaf)) {
  throw "The controlled candidate identity is missing."
}
$identity = Get-Content -Raw -LiteralPath $identityPath | ConvertFrom-Json
if (
  $identity.candidateSha -ne $ExpectedCandidateSha -or
  $identity.releaseAuthority -ne "ZERO_RELEASE" -or
  $identity.sourceBranch -ne "qctp-platform-rev3-codex"
) {
  throw "The selected candidate does not match the requested ZERO_RELEASE Rev3 checkpoint."
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodePath = $nodeCommand.Source
$windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path -LiteralPath $windowsPowerShell -PathType Leaf)) {
  throw "Windows PowerShell was not found at the expected system path."
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$installedLauncher = Join-Path $InstallRoot "Start-QctpRev3PrivatePreview.ps1"
$installedServer = Join-Path $InstallRoot "preview-server.mjs"

$taskArguments = @(
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy Bypass",
  "-WindowStyle Hidden",
  ('-File "{0}"' -f $installedLauncher),
  ('-CandidateDirectory "{0}"' -f $resolvedCandidate),
  ('-ExpectedCandidateSha "{0}"' -f $ExpectedCandidateSha),
  ('-NodePath "{0}"' -f $nodePath),
  ('-PreviewServerPath "{0}"' -f $installedServer),
  "-Supervise",
  ("-Port {0}" -f $Port),
  ('-RuntimeRoot "{0}"' -f $InstallRoot)
) -join " "

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $windowsPowerShell -Argument $taskArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask -and $existingTask.State -eq "Running") {
  $existingAction = $existingTask.Actions | Select-Object -First 1
  if (
    $existingAction.Execute -ne $windowsPowerShell -or
    $existingAction.Arguments -notlike "*$installedLauncher*" -or
    $existingAction.Arguments -notlike "*-Supervise*" -or
    $existingAction.Arguments -notmatch '-ExpectedCandidateSha\s+"[0-9a-f]{40}"'
  ) {
    throw "The running task named '$TaskName' is not the exact controlled Rev3 preview task."
  }

  Stop-ScheduledTask -TaskName $TaskName
  $taskStopDeadline = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 250
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  } while ($null -ne $existingTask -and $existingTask.State -eq "Running" -and (Get-Date) -lt $taskStopDeadline)
  if ($null -ne $existingTask -and $existingTask.State -eq "Running") {
    throw "The prior controlled Rev3 preview task did not stop before replacement."
  }
}

$existingListener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $existingListener) {
  $existingHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/__qctp_runtime/health" -TimeoutSec 3
  $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($existingListener.OwningProcess)"
  if (
    $existingHealth.schema -ne "qctp-rev3-preview-health-v1" -or
    $existingHealth.candidateSha -notmatch "^[0-9a-f]{40}$" -or
    $existingHealth.releaseAuthority -ne "ZERO_RELEASE" -or
    $null -eq $existingProcess -or
    $existingProcess.Name -ne "node.exe" -or
    $existingProcess.CommandLine -notlike "*preview-server.mjs*" -or
    $existingProcess.CommandLine -notlike "*$($existingHealth.candidateSha)*"
  ) {
    throw "Port $Port is occupied by a process that is not the exact controlled Rev3 preview."
  }
  Stop-Process -Id $existingListener.OwningProcess -Force
  $stopDeadline = (Get-Date).AddSeconds(10)
  do {
    Start-Sleep -Milliseconds 200
    $remainingListener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  } while ($null -ne $remainingListener -and (Get-Date) -lt $stopDeadline)
  if ($null -ne $remainingListener) {
    throw "The prior controlled preview listener did not stop before supervised startup."
  }
}

Copy-Item -LiteralPath $sourceLauncher -Destination $installedLauncher -Force
Copy-Item -LiteralPath $sourceServer -Destination $installedServer -Force
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$healthUri = "http://127.0.0.1:$Port/__qctp_runtime/health"
$deadline = (Get-Date).AddSeconds(30)
$health = $null
do {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 3
  } catch {
    $health = $null
  }
} while ($null -eq $health -and (Get-Date) -lt $deadline)

if (
  $null -eq $health -or
  $health.candidateSha -ne $ExpectedCandidateSha -or
  $health.releaseAuthority -ne "ZERO_RELEASE"
) {
  throw "The installed Rev3 preview task did not produce the expected healthy listener."
}

$task = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
[ordered]@{
  schema = "qctp-rev3-preview-startup-install-v1"
  result = "PASS"
  taskName = $TaskName
  taskState = $task.State.ToString()
  lastTaskResult = $taskInfo.LastTaskResult
  candidateSha = $health.candidateSha
  host = "127.0.0.1"
  port = $Port
  installRoot = $InstallRoot
  releaseAuthority = "ZERO_RELEASE"
} | ConvertTo-Json -Compress
