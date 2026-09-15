@echo off
title image2 studio server
start "" "http://localhost:8765/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-image2.ps1"
if errorlevel 1 pause
