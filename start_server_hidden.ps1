$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = "C:\Program Files\nodejs\node.exe"
$logDir = Join-Path $projectDir "logs"
$stdoutLog = Join-Path $logDir "server.out.log"
$stderrLog = Join-Path $logDir "server.err.log"

if (-not (Test-Path $nodeExe)) {
    throw "Node executable not found: $nodeExe"
}

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$listener = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    Write-Output "Port 5000 already in use by PID $($listener.OwningProcess)."
    exit 0
}

Start-Process -FilePath $nodeExe -ArgumentList "index.js" -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
Write-Output "Server start requested in hidden mode."
