@echo off
chcp 65001 >nul
title opencode-sync 定时同步任务安装
cd /d "%~dp0"

echo ============================================
echo  opencode-sync 定时同步任务安装
echo ============================================
echo.

set RUNNER=%CD%\task-runner.bat

schtasks /create /tn "opencode-sync" /ru %USERNAME% /f /sc daily /st 19:00 /tr "%RUNNER%"

if %errorlevel% equ 0 (
  echo [OK] 定时任务已创建
  echo.
  echo  编辑 %RUNNER% 配置 WebDAV 地址和密码
  echo  立即测试: schtasks /run /tn opencode-sync
  echo  删除任务: schtasks /delete /tn opencode-sync /f
) else (
  echo [失败] 请以管理员身份运行
)

pause
