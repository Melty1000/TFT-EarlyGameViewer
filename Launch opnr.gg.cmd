@echo off
setlocal
title opnr.gg

set "ROOT=%~dp0"
set "PORT=3002"
set "URL=http://127.0.0.1:%PORT%/"

cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required before this launcher can run.
  echo Install Node.js from https://nodejs.org/, then double-click this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required before this launcher can run.
  echo Install Node.js with npm from https://nodejs.org/, then double-click this file again.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='%URL%';" ^
  "try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process $url; exit 0 } } catch {};" ^
  "exit 1"

if not errorlevel 1 (
  echo opnr.gg is already running at %URL%
  exit /b 0
)

echo Starting opnr.gg on %URL%
echo This window must stay open while you use the app.
echo Fresh installs can take several minutes. Do not close this window during dependency install.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ^
  "$url='%URL%';" ^
  "$deadline=(Get-Date).AddMinutes(5);" ^
  "do { try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process $url; exit 0 } } catch {}; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline);" ^
  "exit 1"

call npm run launch
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo opnr.gg stopped with exit code %EXIT_CODE%.
if "%EXIT_CODE%"=="0" (
  echo The server stopped normally.
) else (
  echo Leave this window open and read the error above.
)
echo.
pause
exit /b %EXIT_CODE%
