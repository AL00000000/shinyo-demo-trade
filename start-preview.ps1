$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node -ErrorAction SilentlyContinue
if ($taskNode) { $taskNodePath = $taskNode.Source }
else {
    $taskNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $taskNodePath)) { throw 'Node.js 24以上をインストールしてください。' }
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist\index.html'))) { throw 'npm install と npm run export を実行してください。' }
Write-Host 'http://127.0.0.1:8790 をブラウザーで開いてください。このウィンドウを閉じると終了します。'
& $taskNodePath scripts/preview.mjs
