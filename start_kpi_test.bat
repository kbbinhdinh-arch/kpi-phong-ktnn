@echo off
title KBNN KHU VUC XV - HE THONG KPI CHAY THU NGHIEM CUC BO
color 0A
echo ============================================================================
echo   KBNN KHU VUC XV - PHONG KE TOAN NHA NUOC
echo   KHOI DONG HE THONG KPI KIEM TRA THU NGHIEM TAI: http://localhost:8888
echo ============================================================================
echo.
cd /d "%~dp0"
node-runtime\node.exe server.js
pause
