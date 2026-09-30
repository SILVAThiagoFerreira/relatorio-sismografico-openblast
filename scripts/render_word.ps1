param(
    [Parameter(Mandatory=$true)][string[]]$Inputs,
    [string]$OutputDirectory = 'analysis/render',
    [int]$Dpi = 120,
    [ValidateSet('Poppler','MuPDF')][string]$Rasterizer = 'Poppler'
)
$ErrorActionPreference = 'Stop'
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$word = $null
$results = @()
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    foreach ($inputPath in $Inputs) {
        $source = (Resolve-Path -LiteralPath $inputPath).Path
        $before = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
        $stem = [IO.Path]::GetFileNameWithoutExtension($source)
        $folder = Join-Path $outputRoot $stem
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        $pdf = Join-Path $folder 'document.pdf'
        $document = $null
        try {
            # Open read-only, never save or materialize updated fields into the source.
            $document = $word.Documents.Open($source, $false, $true, $false)
            $pages = $document.ComputeStatistics(2)
            $document.ExportAsFixedFormat($pdf, 17)
        } finally {
            if ($null -ne $document) {
                $document.Close(0)
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
            }
        }
        $after = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
        if ($before -ne $after) { throw "Original modified unexpectedly: $source" }
        # MiKTeX Poppler cannot reliably open accented Windows paths. Use an ASCII staging path.
        $staging = Join-Path $env:TEMP ('sismo-render-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $staging | Out-Null
        try {
            Copy-Item -LiteralPath $pdf -Destination (Join-Path $staging 'document.pdf')
            if ($Rasterizer -eq 'MuPDF') {
                & python -c 'import fitz,sys; from pathlib import Path; source=Path(sys.argv[1]); out=Path(sys.argv[2]); dpi=int(sys.argv[3]); doc=fitz.open(source); [page.get_pixmap(matrix=fitz.Matrix(dpi/72,dpi/72)).save(out/("page-%02d.png"%(i+1))) for i,page in enumerate(doc)]' (Join-Path $staging 'document.pdf') $staging $Dpi
            } else {
                & pdftoppm -png -r $Dpi (Join-Path $staging 'document.pdf') (Join-Path $staging 'page')
            }
            if ($LASTEXITCODE -ne 0) { throw "$Rasterizer rasterization failed: $pdf" }
            Get-ChildItem -LiteralPath $staging -Filter 'page-*.png' | Copy-Item -Destination $folder
        } finally {
            $resolvedStaging = [IO.Path]::GetFullPath($staging)
            $resolvedTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
            if ($resolvedStaging.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
            }
        }
        $pngs = @(Get-ChildItem -LiteralPath $folder -Filter 'page-*.png')
        if ($pngs.Count -ne $pages) { throw "Page count mismatch: Word=$pages PNG=$($pngs.Count)" }
        $results += [PSCustomObject]@{ source=$source; sha256=$before; pages=$pages; pdf=$pdf; png_count=$pngs.Count; original_unchanged=$true; renderer='Microsoft Word read-only COM ExportAsFixedFormat'; rasterizer=$Rasterizer }
    }
} finally {
    if ($null -ne $word) {
        $word.Quit(0)
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
    }
}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputRoot 'render-audit.json') -Encoding UTF8
$results | ConvertTo-Json -Depth 4
