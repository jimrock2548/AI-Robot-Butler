$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$testRuleName = 'Hermes-Supervised-Test-' + [guid]::NewGuid().ToString()
$ruleCreated = $false
node scripts/check-robot-link-loss.mjs --phase=before
if ($LASTEXITCODE -ne 0) { throw 'Robot must be connected and E-stop engaged before the network test' }
try {
    New-NetFirewallRule -Name $testRuleName -DisplayName $testRuleName -Direction Outbound -Action Block -Protocol TCP -RemoteAddress '192.168.1.63' -RemotePort 1448 -Profile Any | Out-Null
    $ruleCreated = $true
    node scripts/check-robot-link-loss.mjs --phase=blocked
    if ($LASTEXITCODE -ne 0) { throw 'Real link-loss check failed' }
} finally {
    if ($ruleCreated) {
        Remove-NetFirewallRule -Name $testRuleName
        if (Get-NetFirewallRule -Name $testRuleName -ErrorAction SilentlyContinue) { throw 'Temporary robot network rule was not removed' }
        node scripts/check-robot-link-loss.mjs --phase=recovered
        if ($LASTEXITCODE -ne 0) { throw 'Robot connection did not recover after removing the temporary rule' }
    }
}
