[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CandidateDirectory,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[0-9a-f]{40}$")]
  [string]$ExpectedCandidateSha,

  [string]$NodePath,

  [string]$PreviewServerPath = (Join-Path $PSScriptRoot "preview-server.mjs"),

  [switch]$Supervise,

  [ValidateRange(1, 65535)]
  [int]$Port = 4179,

  [string]$RuntimeRoot = (Join-Path $env:LOCALAPPDATA "QCTP\rev3-preview")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-RequiredPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath,

    [Parameter(Mandatory = $true)]
    [ValidateSet("Container", "Leaf")]
    [string]$PathType,

    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  if (-not (Test-Path -LiteralPath $LiteralPath -PathType $PathType)) {
    throw "$Description was not found: $LiteralPath"
  }
  return (Resolve-Path -LiteralPath $LiteralPath).Path
}

function Read-HealthyListener {
  param(
    [Parameter(Mandatory = $true)]
    [string]$HealthUri,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha
  )

  $health = Invoke-RestMethod -Uri $HealthUri -TimeoutSec 3
  if (
    $health.schema -ne "qctp-rev3-preview-health-v1" -or
    $health.candidateSha -ne $ExpectedSha -or
    $health.releaseAuthority -ne "ZERO_RELEASE"
  ) {
    throw "The listener on the preview port does not match the controlled Rev3 candidate."
  }
  return $health
}

$candidateRoot = Resolve-RequiredPath -LiteralPath $CandidateDirectory -PathType Container -Description "Candidate directory"
$siteRoot = Resolve-RequiredPath -LiteralPath (Join-Path $candidateRoot "site") -PathType Container -Description "Candidate site"
$identityPath = Resolve-RequiredPath -LiteralPath (Join-Path $siteRoot "QCTP_REV3_RUNTIME_IDENTITY.json") -PathType Leaf -Description "Candidate identity"
$serverPath = Resolve-RequiredPath -LiteralPath $PreviewServerPath -PathType Leaf -Description "Preview server"

$identity = Get-Content -Raw -LiteralPath $identityPath | ConvertFrom-Json
if (
  $identity.schema -ne "qctp-rev3-runtime-identity-v1" -or
  $identity.candidateSha -ne $ExpectedCandidateSha -or
  $identity.sourceBranch -ne "qctp-platform-rev3-codex" -or
  $identity.releaseAuthority -ne "ZERO_RELEASE"
) {
  throw "The candidate identity does not match the expected ZERO_RELEASE Rev3 checkpoint."
}

if ([string]::IsNullOrWhiteSpace($NodePath)) {
  $nodeCommand = Get-Command node.exe -ErrorAction Stop
  $NodePath = $nodeCommand.Source
}
$resolvedNode = Resolve-RequiredPath -LiteralPath $NodePath -PathType Leaf -Description "Node.js executable"

$healthUri = "http://127.0.0.1:$Port/__qctp_runtime/health"
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
$logRoot = Join-Path $RuntimeRoot "logs"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$stdoutPath = Join-Path $logRoot "preview.stdout.log"
$stderrPath = Join-Path $logRoot "preview.stderr.log"
$supervisorLogPath = Join-Path $logRoot "preview.supervisor.jsonl"

$arguments = @(
  ('"{0}"' -f $serverPath),
  "--root",
  ('"{0}"' -f $siteRoot),
  "--host",
  "127.0.0.1",
  "--port",
  $Port.ToString(),
  "--candidate-sha",
  $ExpectedCandidateSha
)

function Write-SupervisorEvent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EventName,

    [hashtable]$Details = @{}
  )

  $entry = [ordered]@{
    schema = "qctp-rev3-preview-supervisor-event-v1"
    timestamp = (Get-Date).ToString("o")
    event = $EventName
    supervisorProcessId = $PID
    candidateSha = $ExpectedCandidateSha
    port = $Port
  }
  foreach ($key in $Details.Keys) {
    $entry[$key] = $Details[$key]
  }
  Add-Content -LiteralPath $supervisorLogPath -Value ($entry | ConvertTo-Json -Compress) -Encoding UTF8
}

function Start-VerifiedPreviewProcess {
  param(
    [Parameter(Mandatory = $true)]
    [int]$RestartAttempt
  )

  $process = Start-Process -FilePath $resolvedNode -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  $deadline = (Get-Date).AddSeconds(20)
  $verifiedHealth = $null
  do {
    Start-Sleep -Milliseconds 250
    if ($process.HasExited) {
      $stderrTail = if (Test-Path -LiteralPath $stderrPath) {
        (Get-Content -LiteralPath $stderrPath -Tail 20) -join [Environment]::NewLine
      } else {
        "No stderr log was created."
      }
      throw "The Rev3 preview process exited during startup. $stderrTail"
    }
    try {
      $verifiedHealth = Read-HealthyListener -HealthUri $healthUri -ExpectedSha $ExpectedCandidateSha
    } catch {
      $verifiedHealth = $null
    }
  } while ($null -eq $verifiedHealth -and (Get-Date) -lt $deadline)

  if ($null -eq $verifiedHealth) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "The Rev3 preview listener did not become healthy before the startup deadline."
  }

  $state = [ordered]@{
    schema = "qctp-rev3-private-preview-runtime-state-v1"
    candidateSha = $ExpectedCandidateSha
    candidateDirectory = $candidateRoot
    siteDirectory = $siteRoot
    host = "127.0.0.1"
    port = $Port
    processId = $process.Id
    supervisorProcessId = if ($Supervise) { $PID } else { $null }
    restartAttempt = $RestartAttempt
    startedAt = (Get-Date).ToString("o")
    releaseAuthority = "ZERO_RELEASE"
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RuntimeRoot "runtime-state.json") -Encoding UTF8

  return [pscustomobject]@{
    Process = $process
    Health = $verifiedHealth
    StartedAt = Get-Date
  }
}

$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $listener) {
  $health = Read-HealthyListener -HealthUri $healthUri -ExpectedSha $ExpectedCandidateSha
  $runtimeStatePath = Join-Path $RuntimeRoot "runtime-state.json"
  if ($Supervise -and (Test-Path -LiteralPath $runtimeStatePath -PathType Leaf)) {
    $runtimeState = Get-Content -Raw -LiteralPath $runtimeStatePath | ConvertFrom-Json
    $supervisorProperty = $runtimeState.PSObject.Properties["supervisorProcessId"]
    $existingSupervisorId = if ($null -ne $supervisorProperty) { $supervisorProperty.Value } else { $null }
    if ($null -ne $existingSupervisorId -and $existingSupervisorId -ne $PID) {
      $existingSupervisor = Get-Process -Id $existingSupervisorId -ErrorAction SilentlyContinue
      if ($null -ne $existingSupervisor) {
        throw "The controlled Rev3 preview is already owned by supervisor process $existingSupervisorId."
      }
    }
  }
  $previewProcess = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
  $previewStartedAt = Get-Date
  $startResult = "ALREADY_RUNNING"
} else {
  $started = Start-VerifiedPreviewProcess -RestartAttempt 0
  $health = $started.Health
  $previewProcess = $started.Process
  $previewStartedAt = $started.StartedAt
  $startResult = if ($Supervise) { "STARTED_SUPERVISED" } else { "STARTED_DETACHED" }
}

[ordered]@{
  schema = "qctp-rev3-preview-start-v1"
  result = $startResult
  candidateSha = $ExpectedCandidateSha
  port = $Port
  processId = $previewProcess.Id
} | ConvertTo-Json -Compress

if (-not $Supervise) {
  exit 0
}

Write-SupervisorEvent -EventName "SUPERVISION_STARTED" -Details @{ processId = $previewProcess.Id }
$restartAttempt = 0
while ($true) {
  $previewProcess.WaitForExit()
  $exitCode = $previewProcess.ExitCode
  $runSeconds = [Math]::Max(0, [int]((Get-Date) - $previewStartedAt).TotalSeconds)
  if ($runSeconds -ge 60) {
    $restartAttempt = 0
  }
  $restartAttempt++
  $delaySeconds = [Math]::Min(60, 5 * [Math]::Pow(2, [Math]::Min(4, $restartAttempt - 1)))
  Write-SupervisorEvent -EventName "PROCESS_EXITED" -Details @{
    processId = $previewProcess.Id
    exitCode = $exitCode
    runSeconds = $runSeconds
    restartAttempt = $restartAttempt
    retryDelaySeconds = $delaySeconds
  }

  $restarted = $false
  do {
    Start-Sleep -Seconds $delaySeconds
    try {
      $started = Start-VerifiedPreviewProcess -RestartAttempt $restartAttempt
      $health = $started.Health
      $previewProcess = $started.Process
      $previewStartedAt = $started.StartedAt
      Write-SupervisorEvent -EventName "PROCESS_RESTARTED" -Details @{
        processId = $previewProcess.Id
        restartAttempt = $restartAttempt
      }
      $restarted = $true
    } catch {
      Write-SupervisorEvent -EventName "RESTART_FAILED" -Details @{
        restartAttempt = $restartAttempt
        message = $_.Exception.Message
      }
      $restartAttempt++
      $delaySeconds = [Math]::Min(60, 5 * [Math]::Pow(2, [Math]::Min(4, $restartAttempt - 1)))
    }
  } while (-not $restarted)
}
