# This script requests admin elevation and then unregisters the scheduled task
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$unregisterScript = Join-Path $scriptPath "unregister_autostart.ps1"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires administrator privileges."
    Write-Host "Requesting elevation..."
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$unregisterScript`"" -Wait
    exit
}

# If we reach here, we have admin privileges
& $unregisterScript
