@echo off
title KBNN KHU VUC XV - HE THONG KPI PHONG KTNN CHAY TREN MAY CHU NOI BO (OFFLINE)
color 0B
echo ============================================================================
echo   KHO BAC NHA NUOC KHU VUC XV - PHONG KE TOAN NHA NUOC
echo   HE THONG QUAN LY VA DANH GIA KPI CAN BO CONG CHUC
echo   MAY CHU NOI BO LAN IP: 10.41.97.11 (CHAY OFFLINE 100%%)
echo ============================================================================
echo.

cd /d "%~dp0"

:: Thiet lap che do chay OFFLINE hoan toan bang CSDL tep tin tren o dia may chu 11
set STORAGE_MODE=local
set PORT=8080
set AUTHOR_SERVER=true

echo [*] Dang kiem tra moi truong Node.js...
if exist "node-runtime\node.exe" (
    echo [+] Su dung moi truong Node.js Portable san co...
    set "NODE_CMD=node-runtime\node.exe"
) else (
    echo [+] Su dung Node.js cai tren he thong...
    set "NODE_CMD=node"
)

echo.
echo ============================================================================
echo   UNG DUNG KPI DANG HOAT DONG SAN SANG PHUC VU:
echo   [-] Che do CSDL:               CSDL TEP TIN CUC BO (OFFLINE 100%%)
echo   [-] Thu muc luu tru:           %~dp0data\
echo   [-] Truy cap tai may chu:      http://localhost:%PORT%
echo   [-] Can bo phong truy cap tai: http://10.41.97.11:%PORT%
echo ============================================================================
echo.
echo [Luu y: Giu cua so nay mo de may chu luon hoat dong trong gio lam viec]
echo.

%NODE_CMD% server.js
pause
