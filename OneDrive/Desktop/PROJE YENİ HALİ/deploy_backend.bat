@echo off
echo ====================================
echo Backend GitLab Gonderimi Basliyor
echo ====================================

cd isg-backend

set /p message="Commit mesajinizi girin (Bos birakirsa 'Auto deploy update' yazilacak): "
if "%message%"=="" set message=Auto deploy update

git add .
git commit -m "%message%"
git push

echo ====================================
echo Backend Gonderimi Tamamlandi!
echo ====================================
pause
