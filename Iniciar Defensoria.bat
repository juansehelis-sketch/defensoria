@echo off
chcp 65001 >nul
title Defensoria - Sistema de Gestion
cd /d "%~dp0backend"

rem Si el servidor ya esta corriendo en el puerto 8000, solo abre el navegador.
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo Iniciando el servidor, aguarde unos segundos...
  start "Defensoria - Servidor" /min cmd /c ".\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
  timeout /t 6 /nobreak >nul
)

start "" http://localhost:8000
exit
