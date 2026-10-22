$ErrorActionPreference = 'Stop'
$mediaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.private/media'))
New-Item -ItemType Directory -Path $mediaRoot -Force | Out-Null
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 1280,720
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::SteelBlue)
  for ($i = 0; $i -lt 80; $i++) {
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, ($i * 31 % 256), ($i * 71 % 256), ($i * 13 % 256)))
    try { $graphics.FillRectangle($brush, ($i * 37 % 1200), ($i * 53 % 650), 80, 70) } finally { $brush.Dispose() }
  }
  $bitmap.Save((Join-Path $mediaRoot 'synthetic.jpg'), [System.Drawing.Imaging.ImageFormat]::Jpeg)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
$ffmpegTool = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ffmpegTool) {
  $videoFile = Join-Path $mediaRoot 'synthetic.mp4'
  if (-not (Test-Path -LiteralPath $videoFile)) {
    & $ffmpegTool.Source -hide_banner -loglevel error -f lavfi -i 'testsrc2=size=1280x720:rate=24' -t 5 -c:v libx264 -pix_fmt yuv420p -movflags +faststart $videoFile
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic video generation failed' }
  }
  Write-Output 'Synthetic JPEG and 5-second H.264 MP4 prepared in tests/performance/.private/media.'
} else {
  Write-Output 'Synthetic JPEG prepared. Video NOT PREPARED: install ffmpeg and rerun, or supply a synthetic H.264 MP4 under 15 seconds and 25 MiB.'
}
