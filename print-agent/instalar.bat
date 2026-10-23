@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Banguelas - Instalar impressao automatica

where node >nul 2>&1
if errorlevel 1 (
  echo O Node.js ainda nao esta instalado neste computador.
  echo.
  where winget >nul 2>&1
  if errorlevel 1 (
    echo Baixe e instale o Node.js LTS em https://nodejs.org e depois de dois cliques em instalar.bat de novo.
  ) else (
    echo Instalando o Node.js ^(o Windows pode pedir permissao - clique em Sim^)...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    echo.
    echo Pronto. FECHE esta janela e de dois cliques em instalar.bat DE NOVO.
  )
  echo.
  pause
  exit /b 1
)

node index.js menu
