param(
    [ValidateSet('backend', 'admin', 'kiosk')]
    [string]$Service = 'backend',
    [switch]$LocalAI,
    [switch]$WithoutAI
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# Startup polls only. Motion is sent only after an operator action in the console.
$env:DB_MODE = 'pg'
$env:ROBOT_MODE = 'hermes'
$env:HERMES_BASE_URL = 'http://192.168.1.63:1448'
$env:HERMES_READ_ONLY = 'false'
$env:HERMES_AUTO_DOCK = 'false'
$env:HERMES_MAX_LINEAR_MPS = '0.1'
$env:HERMES_MAX_ANGULAR_RPS = '0.3'
$env:AI_MODE = if ($WithoutAI) { 'off' } else { 'local' }
$env:PORT = '4000'
$env:CORS_ORIGIN = 'http://localhost:3000'
$env:NEXT_PUBLIC_API_URL = 'http://localhost:4000'
$env:API_URL = 'http://localhost:4000'

switch ($Service) {
    'backend' { pnpm --filter @hermes/backend dev }
    'admin' { pnpm --filter @hermes/admin dev }
    'kiosk' { pnpm --filter @hermes/kiosk dev }
}
exit $LASTEXITCODE
