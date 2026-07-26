@echo off
REM Double-click to start Keystone on this branch PC.
title Keystone - Start
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0keystone-start.ps1" %*
echo.
pause
