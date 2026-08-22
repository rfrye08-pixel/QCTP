@echo off
setlocal
cd /d "%~dp0"

echo QCTP Day 1 iPhone audio-patch deployment
echo This will update the controlled candidate branch, run verification, rebuild the PWA, and refresh the local runtime.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Deploy-QctpAudioPatch.ps1"
set "QCTP_EXIT=%ERRORLEVEL%"

echo.
if "%QCTP_EXIT%"=="0" (
  echo Deployment completed. Follow the 50-second iPhone audio acceptance shown above.
) else (
  echo Deployment did not complete. Preserve this window and send the exact failure text for reroute.
)
echo.
pause
exit /b %QCTP_EXIT%
