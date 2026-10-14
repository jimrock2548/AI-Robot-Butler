$ErrorActionPreference = 'Stop'
$reportRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../reports/project-documentation'))
$chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$htmlUri = ([Uri](Join-Path $reportRoot 'AI-Robot-Butler-Report.html')).AbsoluteUri
$outputPath = Join-Path $reportRoot 'AI-Robot-Butler-Report-browser.pdf'
$profilePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.tools/report-chrome-profile'))
& $chromePath --headless --disable-gpu --no-first-run --no-default-browser-check --allow-file-access-from-files --no-pdf-header-footer "--user-data-dir=$profilePath" "--print-to-pdf=$outputPath" $htmlUri | Out-Null
