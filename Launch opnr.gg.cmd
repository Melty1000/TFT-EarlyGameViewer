@echo off
setlocal
title opnr.gg

set "ROOT=%~dp0"

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

echo Starting opnr.gg desktop shell.
echo This window must stay open while you use the app.
echo Fresh installs can take several minutes while dependencies and Rust crates install.
echo.

call npm run launch
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo opnr.gg stopped with exit code %EXIT_CODE%.
if "%EXIT_CODE%"=="0" (
  echo The desktop shell stopped normally.
) else (
  echo Leave this window open and read the error above.
)
echo.
pause
exit /b %EXIT_CODE%
