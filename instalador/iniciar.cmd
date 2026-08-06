@echo off
title POS Sucursal Zona Oeste
cd /d "%~dp0"

"%~dp0node.exe" "%~dp0iniciar.mjs"

if errorlevel 1 (
  echo.
  echo ---------------------------------------------------------------
  echo  El sistema no pudo iniciarse.
  echo  Anotá el mensaje de arriba antes de cerrar esta ventana.
  echo ---------------------------------------------------------------
  echo.
  pause
)
