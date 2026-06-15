# Configura el arranque automatico, el acceso directo y el backup diario.
# Se ejecuta desde INSTALAR.bat (no hace falta correrlo a mano).
$base = $PSScriptRoot
$ws = New-Object -ComObject WScript.Shell

# (1) Autostart: servidor oculto al iniciar sesion
$startup = [Environment]::GetFolderPath('Startup')
$lnk1 = $ws.CreateShortcut((Join-Path $startup "Defensoria (servidor).lnk"))
$lnk1.TargetPath = "wscript.exe"
$lnk1.Arguments = '"' + (Join-Path $base "_servidor_oculto.vbs") + '"'
$lnk1.WorkingDirectory = $base
$lnk1.Description = "Servidor de la Defensoria (arranca oculto)"
$lnk1.Save()
Write-Host "[1] Autostart configurado."

# (2) Acceso directo en el escritorio
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk2 = $ws.CreateShortcut((Join-Path $desktop "Defensoria.lnk"))
$lnk2.TargetPath = (Join-Path $base "Iniciar Defensoria.bat")
$lnk2.WorkingDirectory = $base
$lnk2.Description = "Abrir el Sistema de la Defensoria"
$lnk2.Save()
Write-Host "[2] Acceso directo en el escritorio creado."

# (3) Backup diario (13:00, recupera si la PC estuvo apagada)
$accion = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ('/c "' + (Join-Path $base "backup.bat") + '"')
$trigger = New-ScheduledTaskTrigger -Daily -At 1:00pm
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Defensoria - Backup diario" -Action $accion -Trigger $trigger -Settings $settings -Description "Backup diario de la base de la Defensoria" -Force | Out-Null
Write-Host "[3] Backup diario programado."
Write-Host ""
Write-Host "Listo. Reinicia la PC o doble-clic en 'Defensoria' (escritorio) para empezar."
