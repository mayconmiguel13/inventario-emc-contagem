@echo off
title Sistema de Gestao de Ativos EMC - Prefeitura de Contagem
echo ========================================================
echo   Iniciando Servidor de Gestao de Ativos e Devolucao EMC
echo   Prefeitura Municipal de Contagem
echo ========================================================
echo.
cd /d "%~dp0server"
start http://localhost:5000
node src/server.js
pause
