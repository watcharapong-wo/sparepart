param(
  [string]$ApiBaseUrl = "http://localhost:5000",
  [string]$SqlServer = "localhost,14330",
  [string]$Database = "sparepart",
  [string]$SqlUser = "sparepart_app",
  [string]$SqlPassword = "Sparepart@2026!"
)

$ErrorActionPreference = "Continue"
$results = @()

function Add-Result {
  param([string]$Name, [bool]$Ok, [string]$Detail)
  $results += [PSCustomObject]@{
    Check = $Name
    Status = $(if ($Ok) { "PASS" } else { "FAIL" })
    Detail = $Detail
  }
}

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

  return $null
}

$sqlcmd = Get-SqlCmdPath
if ($null -eq $sqlcmd) {
  Add-Result "sqlcmd availability" $false "sqlcmd not found"
} else {
  Add-Result "sqlcmd availability" $true $sqlcmd
}

try {
  $svc = Get-Service -Name "MSSQL`$SQLEXPRESS" -ErrorAction Stop
  Add-Result "SQL Service" ($svc.Status -eq "Running") ("Status=" + $svc.Status)
} catch {
  Add-Result "SQL Service" $false $_.Exception.Message
}

if ($sqlcmd) {
  try {
    $out = & $sqlcmd -S $SqlServer -U $SqlUser -P $SqlPassword -d $Database -Q "SELECT DB_NAME() AS dbname" -h -1 -W -b 2>&1
    if ($LASTEXITCODE -eq 0) {
      Add-Result "MSSQL login" $true ($out | Out-String).Trim()
    } else {
      Add-Result "MSSQL login" $false ($out | Out-String).Trim()
    }
  } catch {
    Add-Result "MSSQL login" $false $_.Exception.Message
  }

  try {
    $out = & $sqlcmd -S $SqlServer -U $SqlUser -P $SqlPassword -d master -Q "SET NOCOUNT ON; SELECT name, physical_name FROM sys.master_files WHERE DB_NAME(database_id)='sparepart'" -h -1 -W -s "|" -b 2>&1
    if ($LASTEXITCODE -eq 0) {
      Add-Result "DB file location" $true (($out | Out-String).Trim() -replace "`r`n", " ; ")
    } else {
      Add-Result "DB file location" $false ($out | Out-String).Trim()
    }
  } catch {
    Add-Result "DB file location" $false $_.Exception.Message
  }
}

try {
  $resp = Invoke-WebRequest -Uri "$ApiBaseUrl/favicon.ico" -Method GET -TimeoutSec 8 -ErrorAction Stop
  Add-Result "API reachable" $true ("HTTP " + [int]$resp.StatusCode)
} catch {
  if ($_.Exception.Response) {
    Add-Result "API reachable" $true ("HTTP " + [int]$_.Exception.Response.StatusCode)
  } else {
    Add-Result "API reachable" $false $_.Exception.Message
  }
}

$results | Format-Table -AutoSize

$failed = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
if ($failed -gt 0) {
  Write-Output "[HEALTH] FAILED checks: $failed"
  exit 1
}

Write-Output "[HEALTH] All checks passed"
exit 0
