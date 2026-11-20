@echo off
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" "%~dp0scripts\launch.mjs" --stop
) else (
  node "%~dp0scripts\launch.mjs" --stop
)
if errorlevel 1 pause
