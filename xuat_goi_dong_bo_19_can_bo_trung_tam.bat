@echo off
title TAO GOI DONG BO 19 CAN BO TRUNG TAM TIEN MAT (BAO VE 16 CAN BO QUANG NGAI)
color 0A
cd /d "%~dp0"

echo ============================================================================
echo   KBNN KHU VUC XV - PHONG KE TOAN NHA NUOC
echo   DANG TRICH XUAT GOI DONG BO AN TOAN CHO 19 CAN BO TRUNG TAM TIEN MAT...
echo ============================================================================
echo.

if exist "node-runtime\node.exe" (
    node-runtime\node.exe xuat_goi_dong_bo_19_can_bo_trung_tam.js
) else (
    node xuat_goi_dong_bo_19_can_bo_trung_tam.js
)

pause
