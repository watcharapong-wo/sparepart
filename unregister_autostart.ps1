$taskName = "SparepartServer"

try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
    Write-Output "[OK] Deleted scheduled task: $taskName"
} catch {
    throw "Failed to delete scheduled task: $($_.Exception.Message)"
}
