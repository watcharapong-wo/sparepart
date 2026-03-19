@echo off
REM Start Sparepart Server - Double-click to run
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Check if port 5000 is already in use
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000"') do (
    echo [INFO] Killing existing process on port 5000 (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
)

REM Wait a moment for port to be released
timeout /t 1 /nobreak >nul

REM Start server
echo [INFO] Starting Sparepart Server...
echo [INFO] Server will run on http://localhost:5000
echo.
call npm run start

REM Keep window open on exit
pause
