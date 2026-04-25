@echo off
setlocal

set "ROOT=%~dp0"
set "PORT=3002"
set "URL=http://127.0.0.1:%PORT%/"

cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required before this launcher can run.
  echo Install Node.js, then double-click this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required before this launcher can run.
  echo Install Node.js with npm, then double-click this file again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='%URL%';" ^
  "try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process $url; exit 0 } } catch {};" ^
  "exit 1"

if not errorlevel 1 (
  echo TFT Early Game Viewer is already running.
  exit /b 0
)

echo Starting TFT Early Game Viewer on %URL%
echo.

start "TFT Early Game Viewer Dev Server" cmd /k "cd /d ""%ROOT%"" && npm run launch"

echo Waiting for the app to respond...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='%URL%';" ^
  "$deadline=(Get-Date).AddSeconds(30);" ^
  "do { try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 750 } while ((Get-Date) -lt $deadline);" ^
  "exit 1"

if errorlevel 1 (
  echo.
  echo The dev server did not respond at %URL% within 30 seconds.
  echo Check the dev server window for the actual error.
  pause
  exit /b 1
)

exit /b 0
