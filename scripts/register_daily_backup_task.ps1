param(
  [string]$TaskName = "Sparepart-MSSQL-Daily-Backup",
  [string]$Time = "01:00"
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "backup_mssql.ps1"
if (!(Test-Path $scriptPath)) {
  throw "backup_mssql.ps1 not found at $scriptPath"
}

$powershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
if (!(Test-Path $powershellExe)) {
  throw "powershell.exe not found at $powershellExe"
}

$workingDir = Split-Path -Parent $scriptPath
$action = New-ScheduledTaskAction -Execute $powershellExe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -WorkingDirectory $workingDir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$taskUser = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType S4U -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null

Write-Output "[SCHEDULE] Task registered"
Write-Output "[SCHEDULE] Name: $TaskName"
Write-Output "[SCHEDULE] Time: $Time"
Write-Output "[SCHEDULE] User: $taskUser"
