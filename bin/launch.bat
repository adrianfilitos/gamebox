@echo off
setlocal
set "CMD="
set "REQ=C:\GameBox\portal-launch\launch-request.txt"
if not exist "%REQ%" exit /b 0
set /p CMD=<"%REQ%"
if not defined CMD exit /b 0
start "" /b %CMD%
exit /b 0
