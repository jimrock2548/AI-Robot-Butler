param([switch]$CheckOnly, [ValidateSet('ipad-mic-2026-10-29', 'ipad-speech-2026-10-29')][string]$Checkpoint = 'ipad-mic-2026-10-29')
$ErrorActionPreference = 'Stop'
$rollbackRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$checkpointPath = Join-Path $rollbackRoot ('.tools/checkpoints/' + $Checkpoint)
$before = Get-Content -LiteralPath (Join-Path $checkpointPath 'manifest.json') -Raw | ConvertFrom-Json
$after = Get-Content -LiteralPath (Join-Path $checkpointPath 'after.json') -Raw | ConvertFrom-Json
foreach ($entry in $before.files) {
    if ($entry.existed) {
        $backupFile = Join-Path $checkpointPath ('files/' + $entry.file)
        if ((Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Backup checksum mismatch: $($entry.file)" }
    }
}
# Refuse to overwrite edits made after this repair, and verify all targets before changing any file.
foreach ($entry in $after.files) {
    $rollbackTarget = [System.IO.Path]::GetFullPath((Join-Path $rollbackRoot $entry.file))
    if (-not $rollbackTarget.StartsWith($rollbackRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Checkpoint target is outside the workspace' }
    $exists = Test-Path -LiteralPath $rollbackTarget
    if ($exists -ne $entry.exists) { throw "File existence changed after repair: $($entry.file)" }
    if ($exists -and (Get-FileHash -LiteralPath $rollbackTarget -Algorithm SHA256).Hash -ne $entry.sha256) { throw "File changed after repair; review before rollback: $($entry.file)" }
}
if ($CheckOnly) { Write-Output 'Checkpoint hashes verified. Rollback is available; no files or processes changed.'; return }
if ($Checkpoint -eq 'ipad-mic-2026-10-29') {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'scripts[\\/]ipad-https-proxy\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
}
foreach ($entry in $before.files) {
    $rollbackTarget = [System.IO.Path]::GetFullPath((Join-Path $rollbackRoot $entry.file))
    if (-not $rollbackTarget.StartsWith($rollbackRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Checkpoint target is outside the workspace' }
    if ($entry.existed) { Copy-Item -LiteralPath (Join-Path $checkpointPath ('files/' + $entry.file)) -Destination $rollbackTarget -Force }
    elseif (Test-Path -LiteralPath $rollbackTarget) { Remove-Item -LiteralPath $rollbackTarget -Force }
}
Write-Output 'Restored the pre-iPad-microphone checkpoint. Existing map/AI work and database data were not reset.'
