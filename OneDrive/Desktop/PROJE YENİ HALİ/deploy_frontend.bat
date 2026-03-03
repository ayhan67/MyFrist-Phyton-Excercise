@echo off
echo ====================================
echo Frontend GitLab Gonderimi Basliyor
echo ====================================

cd isg-frontend

set /p message="Commit mesajinizi girin (Bos birakirsa 'Auto deploy update' yazilacak): "
if "%message%"=="" set message=Auto deploy update

git add .
git commit -m "%message%"
git push

echo ====================================
echo Frontend Gonderimi Tamamlandi!
echo ====================================
pause
