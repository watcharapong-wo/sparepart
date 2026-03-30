Option Explicit

Dim shell, fso, projectDir, scriptPath, command
Dim systemRoot, powerShellPath

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = projectDir & "\start_server_hidden.ps1"

systemRoot = shell.ExpandEnvironmentStrings("%SystemRoot%")
powerShellPath = systemRoot & "\System32\WindowsPowerShell\v1.0\powershell.exe"

If Not fso.FileExists(powerShellPath) Then
	powerShellPath = "pwsh.exe"
End If

command = """" & powerShellPath & """ -NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """"
shell.Run command, 0, False
