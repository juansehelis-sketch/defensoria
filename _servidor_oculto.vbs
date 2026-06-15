' Arranca el servidor de la Defensoria de forma OCULTA (sin ventana).
' Se usa para que el sistema se levante solo al prender la PC.
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = base & "\backend"
sh.Run "cmd /c "".\venv\Scripts\python.exe"" -m uvicorn app.main:app --host 0.0.0.0 --port 8000", 0, False
