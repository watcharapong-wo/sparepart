@echo off
echo [INFO] Stopping Sparepart Server...

REM Kill Node.exe on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000"') do (
    echo [INFO] Killing process on port 5000 (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill keep_server_running.vbs (WScript.exe)
echo [INFO] Stopping background monitor scripts (WScript)...
taskkill /F /IM wscript.exe >nul 2>&1

echo [SUCCESS] Server and monitor stopped.
pause
