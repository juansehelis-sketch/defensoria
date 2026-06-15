@echo off
chcp 65001 >nul
echo Quitando arranque automatico y backup diario...
echo (Los datos y los backups NO se borran.)
powershell -NoProfile -Command "Unregister-ScheduledTask -TaskName 'Defensoria - Backup diario' -Confirm:$false -ErrorAction SilentlyContinue; Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Defensoria (servidor).lnk') -ErrorAction SilentlyContinue; Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Defensoria.lnk') -ErrorAction SilentlyContinue; Write-Host 'Listo.'"
echo.
pause
