param(
    [Parameter(Mandatory = $true)][string]$DocxPath,
    [Parameter(Mandatory = $true)][string]$PdfPath,
    [Parameter(Mandatory = $true)][string]$StatusPath
)

$ErrorActionPreference = 'Stop'
[System.IO.File]::WriteAllText($StatusPath, "started`n")
$word = $null
$document = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.Options.SaveNormalPrompt = $false
    $word.Options.ConfirmConversions = $false
    $document = $word.Documents.Open($DocxPath, $false, $true)
    [System.IO.File]::AppendAllText($StatusPath, "opened`n")
    $document.ExportAsFixedFormat($PdfPath, 17)
    [System.IO.File]::AppendAllText($StatusPath, "exported`n")
    $document.Close($false)
    $document = $null
    [System.IO.File]::AppendAllText($StatusPath, "completed`n")
}
catch {
    [System.IO.File]::AppendAllText($StatusPath, "error: $($_.Exception.ToString())`n")
    throw
}
finally {
    if ($document -ne $null) {
        try { $document.Close($false) } catch {}
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
    }
    if ($word -ne $null) {
        try { $word.Quit() } catch {}
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
    }
}
