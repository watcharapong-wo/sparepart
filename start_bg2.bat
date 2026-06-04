@echo off
cd "d:\Project Sparepart\new-project"
start /b cmd /c "node index.js > logs\server.out.log 2> logs\server.err.log"
