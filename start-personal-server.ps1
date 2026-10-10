$ErrorActionPreference = 'Stop'
$config = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $PSScriptRoot '.env')) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $config[$matches[1]] = $matches[2] }
}
$nodeBinary = $config['NODE_RUNTIME_PATH']
if (-not $nodeBinary) { $nodeBinary = (Get-Command node).Source }
$runtimeDirectory = $config['DATA_DIR']
$pidFile = Join-Path $runtimeDirectory 'runner.pid'
if (Test-Path -LiteralPath $pidFile) {
  $existingId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$existingId"
  if ($existing -and $existing.CommandLine -like '*server/run-personal.ts*') { exit 0 }
}
$process = Start-Process -FilePath $nodeBinary -ArgumentList '--env-file=.env','--import','tsx','server/run-personal.ts' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log') -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id
