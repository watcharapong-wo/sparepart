@echo off
REM Start Sparepart Server - Double-click to run
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Force kill any existing node servers to ensure update
echo [INFO] Stopping any old/stuck server versions...
C:\Windows\System32\taskkill.exe /F /IM node.exe /T >nul 2>&1

REM Wait a moment for port release
C:\Windows\System32\timeout.exe /t 2 /nobreak >nul

REM Start server fresh
echo [INFO] Starting Sparepart Server (Version 2.3)...
echo [INFO] Server will run on http://localhost:5000
echo.
call npm run start

REM Keep window open on exit
pause
