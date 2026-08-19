[CmdletBinding()]
param(
    [switch]$SkipBrowserTests,
    [switch]$SkipRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$implementation = Join-Path $PSScriptRoot 'Deploy-QctpAudioPatchRev4.ps1'
if (-not (Test-Path -LiteralPath $implementation)) {
    throw "Required deployment implementation is missing: $implementation"
}

& $implementation @PSBoundParameters
