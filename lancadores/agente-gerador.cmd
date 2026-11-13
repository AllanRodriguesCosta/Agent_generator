@echo off
rem Lancador leve para Windows (precisa do Node 20+ e do Git instalados).
rem Copie este arquivo para a pasta raiz do seu site e de dois cliques.
rem Sem Node? Use o executavel agente-gerador-windows.exe da pagina de Releases.
chcp 65001 >nul
cd /d "%~dp0"
call npx --yes github:AllanRodriguesCosta/Agent_generator assistente "%~dp0."
echo.
pause
