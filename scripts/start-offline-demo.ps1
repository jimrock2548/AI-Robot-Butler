param(
  [ValidateSet('backend','admin','kiosk')][string]$Service = 'backend',
  [switch]$LocalAI
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
# Separate ports and build directories; never use the hardware adapter.
$env:ROBOT_MODE = 'mock'
$env:DB_MODE = 'memory'
$env:HERMES_BASE_URL = 'http://mock.invalid'
$env:HERMES_READ_ONLY = 'false'
$env:HERMES_AUTO_DOCK = 'false'
$env:AI_MODE = if ($LocalAI) { 'local' } else { 'off' }
$env:AI_NAVIGATION_ONLY = 'true'
$env:PORT = '4010'
$env:CORS_ORIGIN = 'http://localhost:3010'
$env:KIOSK_TOKEN = 'offline-demo-device-token'
$env:API_URL = 'http://localhost:4010'
$env:NEXT_PUBLIC_API_URL = 'http://localhost:4010'
$env:NEXT_PUBLIC_KIOSK_AI_URL = 'http://localhost:3011/ai'
$env:ADMIN_DIST_DIR = '.next-offline-demo'
$env:KIOSK_DIST_DIR = '.next-offline-demo'
switch ($Service) {
  'backend' { pnpm --filter @hermes/backend dev }
  'admin' { pnpm --filter @hermes/admin exec next dev -p 3010 }
  'kiosk' { pnpm --filter @hermes/kiosk exec next dev -p 3011 }
}
exit $LASTEXITCODE
