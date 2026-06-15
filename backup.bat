@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
".\venv\Scripts\python.exe" backup.py
