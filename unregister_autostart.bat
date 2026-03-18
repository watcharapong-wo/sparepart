@echo off
setlocal

set "taskName=SparepartServer"
set "schtasks=%WINDIR%\System32\schtasks.exe"

if not exist "!schtasks!" (
    echo schtasks.exe not found: !schtasks!
    exit /b 1
)

!schtasks! /Delete /F /TN !taskName!

if errorlevel 1 (
    echo Failed to delete scheduled task !taskName!
    exit /b 1
)

echo Deleted scheduled task: !taskName!
