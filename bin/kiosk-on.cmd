@echo off
rem Activa el modo consola: auto-login en la cuenta de kiosko al arrancar.
rem Edita KIOSK_USER y KIOSK_PASS con los datos de tu cuenta de kiosko.
set "KIOSK_USER=GameKiosk"
set "KIOSK_PASS=CAMBIA_ME"
set "RK=HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
reg add "%RK%" /v AutoAdminLogon /t REG_SZ /d 1 /f >nul
reg add "%RK%" /v DefaultUserName /t REG_SZ /d %KIOSK_USER% /f >nul
reg add "%RK%" /v DefaultDomainName /t REG_SZ /d %COMPUTERNAME% /f >nul
reg add "%RK%" /v DefaultPassword /t REG_SZ /d %KIOSK_PASS% /f >nul
echo Modo consola activado. Reinicia para entrar como %KIOSK_USER%.
