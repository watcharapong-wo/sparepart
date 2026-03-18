$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$batchFile = Join-Path $scriptRoot "register_autostart.bat"

if (-not (Test-Path $batchFile)) {
    throw "Batch file not found: $batchFile"
}

& $batchFile

if ($LASTEXITCODE -ne 0) {
    throw "Failed to register scheduled task (batch exit code: $LASTEXITCODE)"
}

Write-Output "Scheduled task registration completed."
