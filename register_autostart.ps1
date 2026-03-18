$taskName = "SparepartServer"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $scriptRoot "run_server_hidden.vbs"

if (-not (Test-Path $launcher)) {
    throw "Launcher not found: $launcher"
}

try {
    # Create a scheduled task action
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$launcher`""
    
    # Create a trigger for logon
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    
    # Register the task
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -RunLevel Limited -Force -ErrorAction Stop
    
    Write-Output "[OK] Registered scheduled task: $taskName"
    Write-Output "Server will start automatically when you sign in to Windows."
} catch {
    throw "Failed to register scheduled task: $($_.Exception.Message)"
}
