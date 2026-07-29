# 시/ 폴더의 원본 사진으로 assets/thumbs, assets/view 이미지를 다시 만듭니다.
#   powershell -ExecutionPolicy Bypass -File tools\make-images.ps1
Add-Type -AssemblyName System.Drawing

$root     = Split-Path -Parent $PSScriptRoot
$src      = Join-Path $root ([char]0xC2DC)     # "시"
$thumbDir = Join-Path $root "assets\thumbs"
$viewDir  = Join-Path $root "assets\view"

New-Item -ItemType Directory -Force $thumbDir | Out-Null
New-Item -ItemType Directory -Force $viewDir  | Out-Null

function Save-Resized($img, $maxDim, $outPath, $quality) {
    $scale = [Math]::Min(1.0, $maxDim / [Math]::Max($img.Width, $img.Height))
    $nw = [int]($img.Width * $scale); $nh = [int]($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap $nw, $nh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $g.Dispose()
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ps = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$quality)
    $bmp.Save($outPath, $codec, $ps)
    $bmp.Dispose()
    return "$nw x $nh"
}

foreach ($f in (Get-ChildItem -Path $src -Filter *.jpg | Sort-Object Name)) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)

    # EXIF 회전 정보를 이미지에 반영하고 태그는 지운다
    if ($img.PropertyIdList -contains 0x0112) {
        $o = [BitConverter]::ToUInt16($img.GetPropertyItem(0x0112).Value, 0)
        switch ($o) {
            3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
            6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
            8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
        }
        $img.RemovePropertyItem(0x0112)
    }

    $t = Save-Resized $img 900  (Join-Path $thumbDir $f.Name) 78
    $v = Save-Resized $img 2000 (Join-Path $viewDir  $f.Name) 86
    $img.Dispose()
    Write-Output ("{0}  thumb {1}  view {2}" -f $f.Name, $t, $v)
}
