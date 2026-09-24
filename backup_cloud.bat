@echo off
title KBNN KHU VUC XV - SAO LUU DU LIEU KPI CLOUD VE MAY
color 0B
echo ============================================================================
echo   KBNN KHU VUC XV - PHONG KE TOAN NHA NUOC
echo   DANG TIEN HANH SAO LUU TOAN BO DU LIEU KPI MONGODB ATLAS VE DIA CUC BO...
echo ============================================================================
echo.
cd /d "%~dp0"
if exist "node-runtime\node.exe" (
  node-runtime\node.exe backup_cloud_to_disk.js
) else (
  node backup_cloud_to_disk.js
)
pause
