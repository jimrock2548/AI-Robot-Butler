param([switch]$LocalAI)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:DB_MODE = 'memory'
$env:ROBOT_MODE = 'mock'
$env:HERMES_READ_ONLY = 'false'
$env:HERMES_AUTO_DOCK = 'false'
$env:HERMES_BASE_URL = 'http://mock.invalid'
$env:AI_MODE = if ($LocalAI) { 'local' } else { 'off' }
$env:PORT = '4000'
$env:CORS_ORIGIN = 'http://localhost:3000'
Write-Output 'MOCK TEST: memory only, no hardware network requests. Demo login: admin / admin123'
pnpm --filter @hermes/backend dev
exit $LASTEXITCODE
