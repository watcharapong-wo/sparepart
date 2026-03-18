$taskName = "SparepartServer"
$schtasks = Join-Path $env:WINDIR "System32\schtasks.exe"

if (-not (Test-Path $schtasks)) {
    throw "schtasks.exe not found: $schtasks"
}

& $schtasks /Delete /F /TN $taskName

if ($LASTEXITCODE -ne 0) {
    throw "Failed to delete scheduled task $taskName"
}

Write-Output "Deleted scheduled task: $taskName"
