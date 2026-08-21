@echo off
cd /d "%~dp0"
start "" http://localhost:5174/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 5174
pause
