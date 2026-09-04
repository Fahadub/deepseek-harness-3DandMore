@echo off
chcp 65001 >nul
title DeepSeek Harness 3D v5 - 3060
cd /d "%~dp0"

echo =====================================
echo   DeepSeek Harness 3D v5 - port 3060
echo   UI:    http://127.0.0.1:3060
echo   Tools: http://127.0.0.1:3060/tools
echo =====================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 goto :nopnpm

if exist "node_modules" goto :ready
echo [SETUP 1/3] Installing dependencies (first run only)...
call pnpm install
if errorlevel 1 goto :failinstall
echo [SETUP 2/3] Project ships prebuilt - no build step needed.
echo [SETUP 3/3] Generating local config...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools-suite\make-cordis.ps1"
if errorlevel 1 goto :failcordis
goto :engines

:ready
echo [CONFIG] Generating local config...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools-suite\make-cordis.ps1"
if errorlevel 1 goto :failcordis

:engines
if exist "tools-suite\godot\Godot.exe" goto :blender
echo [ENGINE] Downloading Godot 4.7.2 ~180MB (once)...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools-suite\download-godot.ps1"
if errorlevel 1 echo [WARN] Godot download failed - you can retry later from the tools hub.

:blender
if exist "tools-suite\blender\blender.exe" goto :start
echo [ENGINE] Downloading Blender 4.5 LTS ~350MB (once)...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools-suite\download-blender.ps1"
if errorlevel 1 echo [WARN] Blender download failed - you can retry later from the tools hub.

:start
echo [START] Stopping any previous server on port 3060...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3060 .*LISTENING"') do taskkill /PID %%a /T /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo [START] Opening browser automatically when the server is ready...
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 120;$i++){try{Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3060' | Out-Null; Start-Process 'http://127.0.0.1:3060'; break}catch{Start-Sleep 2}}"

echo.
echo Keep this window open while the server runs.
echo.
pnpm dsh web --patch tools-suite/cordis-runtime.yml
echo.
echo Press R to restart or X to exit.
choice /C RX /N /M "R=restart  X=exit"
if errorlevel 2 exit /b 0
"%~f0"

:nopnpm
echo [ERROR] pnpm not found. Install Node.js 22+ from nodejs.org then run: npm install -g pnpm
pause
exit /b 1

:failinstall
echo [ERROR] pnpm install failed.
pause
exit /b 1

:failcordis
echo [ERROR] Failed to generate cordis-runtime.yml.
pause
exit /b 1
