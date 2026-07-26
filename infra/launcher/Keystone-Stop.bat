@echo off
REM Double-click to stop Keystone on this branch PC (data is preserved).
title Keystone - Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0keystone-stop.ps1" %*
echo.
pause
