@echo off
echo ==========================================
echo ISG Pratik - PRODUCTION DEPLOYMENT
echo ==========================================
echo.
echo WARNING: This will deploy to production server!
echo.
pause

:: 1. Git Commit
echo Step 1: Committing changes to Git...
echo.
git add .
git commit -m "feat: v1.3.18 - Strict Personnel Assignment Locks & Quota Shield"
if %errorLevel% neq 0 (
    echo.
    echo ERROR: Git commit failed!
    pause
    exit /b 1
)
echo ✅ Git commit successful
echo.

:: 2. Push to Production
echo Step 2: Pushing to production branch...
echo.
git push origin main
if %errorLevel% neq 0 (
    echo.
    echo ERROR: Git push failed!
    pause
    exit /b 1
)
echo ✅ Git push successful
echo.

:: 3. Deploy Instructions
echo ==========================================
echo DEPLOYMENT COMPLETE (Git Push)
echo ==========================================
echo.
echo Next steps on production server:
echo.
echo 1. SSH to production server:
echo    ssh user@isgdestek.com.tr
echo.
echo 2. Pull changes:
echo    cd /path/to/isg-backend
echo    git pull origin main
echo.
echo 3. Restart backend:
echo    pm2 restart isg-backend
echo    OR
echo    systemctl restart isg-backend
echo.
echo 4. Deploy frontend:
echo    cd /path/to/isg-frontend
echo    git pull origin main
echo    npm run build
echo    sudo systemctl restart nginx
echo.
echo 5. RUN MAINTENANCE RECOVERY (Remote):
echo    Once backend is restarted, trigger recovery via browser/Postman:
echo    POST https://isgdestek.com.tr/api/isg-katip/maintenance/recovery
echo    Body: { "execute": true }
echo.
echo 6. Test:
echo    - Check Denizli workplaces in Archive
echo    - Verified they are moved to 'onaylandi'
echo.
echo ==========================================
echo For detailed instructions, see:
echo DEPLOYMENT_CHECKLIST.md
echo ==========================================
echo.
pause
