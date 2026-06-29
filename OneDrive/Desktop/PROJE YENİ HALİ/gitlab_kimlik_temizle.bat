@echo off
chcp 65001 >nul
echo ====================================
echo GitLab - Kayitli Git Kimligi Temizle
echo ====================================
echo.
echo Tarayicida proje aciliyor ama push olmuyorsa,
echo Git baska/eski hesap kullaniyor olabilir.
echo.

cmdkey /delete:git:https://gitlab.com 2>nul
if %errorlevel% equ 0 (echo [OK] git:https://gitlab.com silindi) else (echo [--] git:https://gitlab.com kaydi yoktu)

cmdkey /delete:git:https://oauth-refresh-token.gitlab.com 2>nul
if %errorlevel% equ 0 (echo [OK] oauth-refresh-token silindi) else (echo [--] oauth kaydi yoktu)

echo.
echo ------------------------------------
echo Sonraki adimlar:
echo 1) GitLab - Preferences - Access Tokens
echo 2) Token olustur: write_repository (ve read_repository)
echo 3) deploy_backend.bat ve deploy_frontend.bat calistir
echo.
echo Push sorunca:
echo   Kullanici adi = GitLab kullanici adiniz
echo   Sifre       = TOKEN (normal sifre DEGIL)
echo ------------------------------------
echo.
pause
