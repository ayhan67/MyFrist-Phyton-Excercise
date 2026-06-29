Add-Type -AssemblyName System.Drawing

$sourcePath = "c:\Users\USER\OneDrive\Desktop\PROJE YENİ HALİ\logo_temp.png"
$destPath = "c:\Users\USER\OneDrive\Desktop\PROJE YENİ HALİ\isg-extension\icons\store_icon.png"

$img = [System.Drawing.Image]::FromFile($sourcePath)

$bmp = New-Object System.Drawing.Bitmap 128, 128
$g = [System.Drawing.Graphics]::FromImage($bmp)

$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 128, 128)

$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$img.Dispose()
