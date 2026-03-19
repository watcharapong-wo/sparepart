'Save this file as keep_server_running.vbs and double-click to keep server running
'This will restart the server if it's not running

Option Explicit
Dim shell, fso, nodeExe, projectDir, logFile
Dim objWMIService, colItems, objItem, pidToKill

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

nodeExe = "node.exe"
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
logFile = projectDir & "\server_running.log"

' Function to check if port 5000 is listening
Function IsPortListening()
    Dim objShell, objExec, output
    Set objShell = CreateObject("WScript.Shell")
    On Error Resume Next
    Set objExec = objShell.Exec("netstat -ano | findstr :5000")
    output = objExec.StdOut.ReadLine()
    IsPortListening = (output <> "")
    On Error GoTo 0
End Function

' Check every 10 seconds if server is running
Do While True
    If Not IsPortListening() Then
        shell.LogEvent 4, "Server not running, starting..."
        shell.CurrentDirectory = projectDir
        shell.Run "npm run start", 0, False
        WScript.Sleep 3000
    End If
    
    WScript.Sleep 10000 ' Check every 10 seconds
Loop
