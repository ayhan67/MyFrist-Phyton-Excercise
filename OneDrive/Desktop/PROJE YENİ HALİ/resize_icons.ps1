Add-Type -AssemblyName System.Drawing
$SourceFile = "c:\Users\USER\OneDrive\Desktop\PROJE YENİ HALİ\isg-frontend\public\yeni-ikon.png"
$DestFolder = "c:\Users\USER\OneDrive\Desktop\PROJE YENİ HALİ\isg-frontend\public\icons"
$Sizes = @(72, 96, 128, 144, 152, 192, 384, 512)

Write-Host "Source: $SourceFile"
Write-Host "Dest: $DestFolder"

foreach ($Size in $Sizes) {
    try {
        # Load the image into a stream to avoid locking
        $Stream = New-Object System.IO.FileStream($SourceFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read)
        $Img = [System.Drawing.Image]::FromStream($Stream)
        $Stream.Close()
        $Stream.Dispose()

        $NewImg = New-Object System.Drawing.Bitmap($Size, $Size)
        $Graphics = [System.Drawing.Graphics]::FromImage($NewImg)
        
        $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        
        $Graphics.DrawImage($Img, 0, 0, $Size, $Size)
        
        $FileName = "icon-$($Size)x$($Size).png"
        $OutPath = Join-Path $DestFolder $FileName
        $NewImg.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        Write-Host "SUCCESS: Created $FileName"
        
        $Graphics.Dispose()
        $NewImg.Dispose()
        $Img.Dispose()
    }
    catch {
        Write-Host "ERROR on size $Size : $($_.Exception.Message)" -ForegroundColor Red
    }
}
