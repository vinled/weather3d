@echo off
title Windy 3D - Servidor Meteorologico e Trafego Maritimo
cd /d "%~dp0"
echo ======================================================================
echo   Iniciando Windy 3D (Servidor Local Node.js)...
echo   Aguarde a inicializacao. O navegador sera aberto automaticamente!
echo ======================================================================

:: Aguarda 1 segundo e abre o navegador padrao no endereco local
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Inicia o servidor Fastify/Node
node server.js

pause
