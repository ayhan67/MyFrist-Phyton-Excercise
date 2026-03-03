@echo off
echo ====================================
echo TUM PROJE GitLab Gonderimi Basliyor
echo ====================================

set /p message="Commit mesajinizi girin (Bos birakirsa 'Auto deploy update' yazilacak): "
if "%message%"=="" set message=Auto deploy update

echo.
echo --- BACKEND GONDERILIYOR ---
cd isg-backend
git add .
git commit -m "%message%"
git push
cd ..

echo.
echo --- FRONTEND GONDERILIYOR ---
cd isg-frontend
git add .
git commit -m "%message%"
git push
cd ..

echo ====================================
echo TUM ISLEMLER TAMAMLANDI!
echo ====================================
pause
