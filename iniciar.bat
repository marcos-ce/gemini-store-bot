@echo off
setlocal EnableDelayedExpansion
title Gemini Store Bot - Inicializador Windows
color 0B

echo ===================================================
echo   GEMINI STORE BOT - INICIALIZADOR WINDOWS
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    echo.
    echo Baixe e instale a versao LTS gratuitamente em:
    echo https://nodejs.org
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

if not exist .env (
    echo ===================================================
    echo   CONFIGURACAO INICIAL DA SUA LOJA
    echo ===================================================
    echo Informe os dados abaixo para iniciar o bot:
    echo.
    set /p BOT_TOKEN="Cole o BOT_TOKEN do Telegram (do @BotFather): "
    set /p ADMIN_ID="Digite o seu ADMIN_ID do Telegram (do @userinfobot): "
    
    echo BOT_TOKEN=!BOT_TOKEN!> .env
    echo ADMIN_ID=!ADMIN_ID!>> .env
    echo API_BASE_URL=https://api.bunaistore.shop/v1>> .env
    
    echo.
    echo [OK] Arquivo .env criado com sucesso!
    echo.
)

if not exist node_modules (
    echo Instalando pacotes necessarios...
    call npm install
    echo.
)

if not exist dist\index.js (
    echo Compilando o bot...
    call npm run build
    echo.
)

echo.
echo ===================================================
echo   INICIANDO O BOT... (Feche a janela para parar)
echo ===================================================
echo.

:loop
node dist/index.js
echo.
echo [AVISO] O bot parou. Reiniciando em 5 segundos... (Pressione Ctrl+C para cancelar)
timeout /t 5 >nul
goto loop
