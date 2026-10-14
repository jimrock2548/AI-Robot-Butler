param([switch]$Install)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$runtimeDir = Join-Path $projectRoot '.tools/llama-b10545'
$modelDir = Join-Path $projectRoot '.models'
$modelPath = Join-Path $modelDir 'Qwen_Qwen3.5-2B-Q5_K_M.gguf'
if ($Install) {
    New-Item -ItemType Directory -Force -Path $runtimeDir, $modelDir | Out-Null
    if (-not (Get-ChildItem -LiteralPath $runtimeDir -Filter 'llama-server.exe' -Recurse)) {
        $archivePath = Join-Path $projectRoot '.tools/llama-b10545-vulkan.zip'
        curl.exe -fL --retry 3 --connect-timeout 15 -o $archivePath 'https://github.com/ggml-org/llama.cpp/releases/download/b10545/llama-b10545-bin-win-vulkan-x64.zip'
        if ($LASTEXITCODE -ne 0) { throw 'Runtime download failed' }
        Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDir -Force
    }
    $modelValid = (Test-Path -LiteralPath $modelPath) -and ((Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash -eq '3f50d5f830873c22d33558f69eb2c34aa59858f37e7a58a982aae88bb38ebe88')
    if (-not $modelValid) {
        $partialPath = $modelPath + '.partial'
        curl.exe -fL --retry 3 --connect-timeout 15 -C - -o $partialPath 'https://huggingface.co/bartowski/Qwen_Qwen3.5-2B-GGUF/resolve/main/Qwen_Qwen3.5-2B-Q5_K_M.gguf?download=true'
        if ($LASTEXITCODE -ne 0) { throw 'Model download failed' }
        if ((Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash -ne '3f50d5f830873c22d33558f69eb2c34aa59858f37e7a58a982aae88bb38ebe88') { throw 'Model checksum mismatch' }
        Move-Item -LiteralPath $partialPath -Destination $modelPath -Force
    }
    Write-Output 'Local AI runtime and verified model are ready.'
    exit 0
}
$serverPath = Get-ChildItem -LiteralPath $runtimeDir -Filter 'llama-server.exe' -Recurse | Select-Object -First 1 -ExpandProperty FullName
if (-not $serverPath -or -not (Test-Path -LiteralPath $modelPath)) { throw 'Run scripts/start-local-ai.ps1 -Install first' }
& $serverPath -m $modelPath -c 4096 -t 6 -ngl 99 --reasoning off --host 127.0.0.1 --port 8080 --alias qwen3.5-2b --no-webui --cors-origins http://localhost:4000
exit $LASTEXITCODE
