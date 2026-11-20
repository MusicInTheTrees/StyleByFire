@echo off
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" "%~dp0scripts\launch.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo StyleByFire needs Node.js 22 or newer, but node.exe was not found.
    echo Please install Node.js or repair its installation, then try again.
    pause
    exit /b 1
  )
  node "%~dp0scripts\launch.mjs"
)
if errorlevel 1 (
  echo.
  echo StyleByFire could not open. The details are shown above.
  pause
  exit /b 1
)
