@echo off
chcp 65001 >nul
title APS Vietnam - Construction & HR Management Portal
echo ======================================================================
echo    CÔNG TY GIẢI PHÁP CHÂU Á THÁI BÌNH DƯƠNG VIỆT NAM (APS VIỆT NAM)
echo    KHỞI ĐỘNG HỆ THỐNG QUẢN LÝ DỰ ÁN XÂY DỰNG & NHÂN SỰ CÔNG TRƯỜNG
echo ======================================================================
echo.

set PATH=C:\Program Files\nodejs;%PATH%

echo [1/2] Đang khởi động Backend Server (Port 5000)...
start "APS Backend API" cmd /k "cd /d "%~dp0backend" && node src/server.js"

timeout /t 2 /nobreak >nul

echo [2/2] Đang khởi động Frontend Web Portal (Port 3000)...
start "APS Frontend Web" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ======================================================================
echo ✅ ĐÃ KHỞI CHẠY THÀNH CÔNG HỆ THỐNG!
echo 👉 Giao diện Web:   http://localhost:3000
echo 👉 API Backend:     http://localhost:5000/api
echo ======================================================================
echo.
pause
