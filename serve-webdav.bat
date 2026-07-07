@echo off
chcp 65001 >nul
title opencode-sync WebDAV Server
cd /d "%~dp0"

set PORT=8080
set DATA_DIR=%TEMP%\opencode-sync-webdav

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

echo ============================================
echo  opencode-sync 本地 WebDAV 服务器
echo ============================================
echo  地址: http://localhost:%PORT%
echo  目录: %DATA_DIR%
echo ============================================
echo.
echo  按 Ctrl+C 停止
echo.
echo  新终端执行同步:
echo    opencode-sync push --remote-url http://localhost:%PORT%
echo.

node src/webdav-server.js %PORT% "%DATA_DIR%"
pause
