# Export the approved artwork into browser and Windows icon formats.
# Windows-only build helper; the app itself has no image-processing dependency.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceFolder = Join-Path $projectRoot 'assets\branding'
$appFolder = Join-Path $projectRoot 'app'

function Export-PngBytes([System.Drawing.Image]$Source, [int]$Size) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = [System.IO.MemoryStream]::new()
    try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($Source, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return ,$stream.ToArray()
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
        $stream.Dispose()
    }
}

$flame = [System.Drawing.Image]::FromFile((Join-Path $sourceFolder 'tailored-flame.png'))
$monogram = [System.Drawing.Image]::FromFile((Join-Path $sourceFolder 'sf-monogram.png'))
try {
    foreach ($entry in @(@('brand-flame.png', 128), @('favicon-32.png', 32), @('apple-touch-icon.png', 180))) {
        [System.IO.File]::WriteAllBytes((Join-Path $appFolder $entry[0]), (Export-PngBytes $flame $entry[1]))
    }
    [System.IO.File]::WriteAllBytes((Join-Path $appFolder 'brand-monogram.png'), (Export-PngBytes $monogram 256))
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $frames = @($sizes | ForEach-Object { ,(Export-PngBytes $flame $_) })
    $iconStream = [System.IO.MemoryStream]::new()
    $writer = [System.IO.BinaryWriter]::new($iconStream)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($index = 0; $index -lt $sizes.Count; $index++) {
            $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$index].Length)
            $writer.Write([uint32]$offset)
            $offset += $frames[$index].Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
        $writer.Flush()
        foreach ($name in @('stylebyfire.ico', 'favicon.ico')) {
            [System.IO.File]::WriteAllBytes((Join-Path $appFolder $name), $iconStream.ToArray())
        }
    } finally {
        $writer.Dispose()
        $iconStream.Dispose()
    }
} finally {
    $flame.Dispose()
    $monogram.Dispose()
}
Write-Output 'Exported the tailored flame and SF monogram for the app.'
