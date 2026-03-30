@echo off
setlocal enabledelayedexpansion

set "taskName=SparepartServer"
set "projectDir=%~dp0"
set "launcher=!projectDir!run_server_hidden.vbs"
set "schtasks=%WINDIR%\System32\schtasks.exe"
set "taskRun=wscript.exe \"!launcher!\""

if not exist "!launcher!" (
    echo Launcher not found: !launcher!
    exit /b 1
)

if not exist "!schtasks!" (
    echo schtasks.exe not found: !schtasks!
    exit /b 1
)

"!schtasks!" /Create /F /SC ONLOGON /RL LIMITED /TN "!taskName!" /TR "!taskRun!"

if errorlevel 1 (
    echo Failed to register scheduled task !taskName!
    exit /b 1
)

echo Registered scheduled task: !taskName!
