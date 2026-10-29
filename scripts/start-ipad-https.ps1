param([string]$LanIp = '', [switch]$SetupOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$httpsArgs = @('scripts/ipad-https-proxy.mjs')
if ($LanIp) { $httpsArgs += "--host=$LanIp" }
if ($SetupOnly) { $httpsArgs += '--setup-only' }
& node @httpsArgs
exit $LASTEXITCODE
