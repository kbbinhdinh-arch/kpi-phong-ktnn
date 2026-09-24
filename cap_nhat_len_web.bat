@echo off
title KBNN KHU VUC XV - CAP NHAT UNG DUNG KPI LEN WEB RENDER
color 0A
echo ============================================================================
echo   KBNN KHU VUC XV - PHONG KE TOAN NHA NUOC
echo   DANG TIEN HANH CAP NHAT MA NGUON LEN GITHUB DE RENDER TU DONG DEPLOY...
echo ============================================================================
echo.
cd /d "%~dp0"

echo 1. Kiem tra trang thai ma nguon local...
git status -s

echo.
echo 2. Dang day ma nguon len GitHub (origin main)...
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================================
    echo   [THANH CONG] Da day ma nguon len GitHub thanh cong!
    echo   Render Cloud dang tu dong Build va Deploy ban moi nhat len Internet.
    echo   Vui long doi khoang 1 - 2 phut roi vao lai trang web tren trinh duyet!
    echo ============================================================================
) else (
    echo.
    echo ============================================================================
    echo   [LUU Y] Chua the day len GitHub do can dang nhap tai khoan GitHub!
    echo   Vui long dang nhap tren trinh duyet hoac nhap Token khi duoc hoi.
    echo ============================================================================
)

echo.
pause
