@echo off
rem Desactiva el auto-login del kiosko (vuelve a la pantalla de inicio de sesion normal).
set "RK=HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
reg delete "%RK%" /v AutoAdminLogon /f >nul 2>&1
reg delete "%RK%" /v DefaultPassword /f >nul 2>&1
reg add "%RK%" /v AutoAdminLogon /t REG_SZ /d 0 /f >nul
echo Modo consola desactivado. Arranque normal restaurado.
