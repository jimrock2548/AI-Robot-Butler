param(
    [ValidateSet('backend', 'admin', 'kiosk')]
    [string]$Service = 'backend'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# Inspect live hardware without a demo map, AI, automatic docking, or robot writes.
# These process-scoped values override any existing .env settings.
$env:DB_MODE = 'memory'
$env:ROBOT_MODE = 'hermes'
$env:HERMES_BASE_URL = 'http://192.168.1.63:1448'
$env:HERMES_READ_ONLY = 'true'
$env:AI_MODE = 'off'
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
