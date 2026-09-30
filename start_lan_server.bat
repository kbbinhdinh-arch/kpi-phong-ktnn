@echo off
title KBNN KHU VUC XV - HE THONG KPI PHONG KTNN CHAY TREN MAY CHU NOI BO (OFFLINE)
color 0B

cd /d "%~dp0"

:: Thiet lap che do chay OFFLINE hoan toan bang CSDL tep tin tren o dia
set STORAGE_MODE=local
set PORT=8080
set AUTHOR_SERVER=true

:: Tu dong xac dinh IP LAN cua may tinh (mac dinh 10.41.96.41)
set "SERVER_IP=10.41.96.41"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set "DETECTED_IP=%%b"
    )
)
if defined DETECTED_IP set "SERVER_IP=%DETECTED_IP%"

echo ============================================================================
echo   KHO BAC NHA NUOC KHU VUC XV - PHONG KE TOAN NHA NUOC
echo   HE THONG QUAN LY VA DANH GIA KPI CAN BO CONG CHUC
echo   MAY CHU NOI BO LAN IP: %SERVER_IP% (CHAY OFFLINE 100%%)
echo ============================================================================
echo.

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
echo   [-] Can bo phong truy cap tai: http://%SERVER_IP%:%PORT%
echo ============================================================================
echo.
echo [*] Dang tu dong mo trinh duyet tai: http://%SERVER_IP%:%PORT% ...
echo [Luu y: Giu cua so nay mo de may chu luon hoat dong trong gio lam viec]
echo.

:: Tu dong bat trang chu KPI tren trinh duyet sau 2 giay
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://%SERVER_IP%:%PORT%"

%NODE_CMD% server.js
pause
