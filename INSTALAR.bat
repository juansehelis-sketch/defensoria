@echo off
chcp 65001 >nul
echo Configurando arranque automatico, acceso directo y backup diario...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
echo.
pause
