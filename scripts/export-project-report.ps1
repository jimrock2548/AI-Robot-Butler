$ErrorActionPreference = 'Stop'
$reportRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../reports/project-documentation'))
$inputPath = Join-Path $reportRoot 'AI-Robot-Butler-Report.docx'
$pdfPath = Join-Path $reportRoot 'AI-Robot-Butler-Report.pdf'
$docPath = Join-Path $reportRoot 'AI-Robot-Butler-Report.doc'
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.Options.BackgroundSave = $false
  Write-Output 'Opening report'
  $document = $word.Documents.Open($inputPath, $false, $false)
  $document.Fields.Update() | Out-Null
  foreach ($toc in $document.TablesOfContents) { $toc.Update() }
  $document.Repaginate()
  $document.Save()
  Write-Output 'Updated contents and saved DOCX'
  $pages = $document.ComputeStatistics(2)
  $document.SaveAs2($docPath, 0)
  Write-Output 'Saved legacy DOC'
  $document.ExportAsFixedFormat($pdfPath, 17, $false, 0, 0, 1, 1, 0, $true, $false, 1, $true, $true, $false)
  Write-Output ('Exported Word .docx, Word .doc and PDF; pages: ' + $pages)
} finally {
  if ($document) { $document.Close(0); [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
  if ($word) { $word.Quit(); [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
