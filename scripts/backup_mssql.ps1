param(
  [string]$SqlServer = "localhost,14330",
  [string]$Database = "sparepart",
  [string]$BackupDir = "D:\\Project Sparepart\\new-project\\SQLD\\backups",
  [int]$RetentionDays = 14,
  [string]$SqlUser = "sparepart_app",
  [string]$SqlPassword = "Sparepart@2026!"
)

$ErrorActionPreference = "Stop"

function Get-SqlCmdPath {
  $candidates = @(
    "$env:ProgramFiles\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe",
    "$env:ProgramFiles\\Microsoft SQL Server\\Client SDK\\ODBC\\180\\Tools\\Binn\\sqlcmd.exe",
    "sqlcmd"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -eq "sqlcmd") {
      if (Get-Command sqlcmd -ErrorAction SilentlyContinue) { return "sqlcmd" }
    } elseif (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "sqlcmd not found. Please install SQL command-line tools."
}

$sqlcmd = Get-SqlCmdPath

if (!(Test-Path $BackupDir)) {
  New-Item -Path $BackupDir -ItemType Directory | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path $BackupDir ("$Database`_$timestamp.bak")

Write-Output "[BACKUP] Server: $SqlServer"
Write-Output "[BACKUP] Database: $Database"
Write-Output "[BACKUP] Output: $backupPath"

$query = "BACKUP DATABASE [$Database] TO DISK = N'$backupPath' WITH COPY_ONLY, CHECKSUM, STATS = 10;"
$args = @("-S", $SqlServer, "-d", "master", "-b", "-Q", $query)
if ($SqlUser -and $SqlPassword) {
  $args = @("-S", $SqlServer, "-U", $SqlUser, "-P", $SqlPassword, "-d", "master", "-b", "-Q", $query)
} else {
  $args = @("-S", $SqlServer, "-E", "-d", "master", "-b", "-Q", $query)
}

& $sqlcmd @args
if ($LASTEXITCODE -ne 0) {
  throw "Backup failed with exit code $LASTEXITCODE"
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "$Database`_*.bak" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Output "[BACKUP] Success"
