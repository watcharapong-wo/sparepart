Option Explicit

Dim shell, fso, projectDir, scriptPath, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = projectDir & "\start_server_hidden.ps1"

command = "powershell.exe -ExecutionPolicy Bypass -File """ & scriptPath & """"
shell.Run command, 0, False
