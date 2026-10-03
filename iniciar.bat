@echo off
chcp 65001 > nul
title Gemini Store Bot - Inicializador Windows
color 0B

echo ═══════════════════════════════════════════════════════
echo   🤖 GEMINI STORE BOT — INICIALIZADOR WINDOWS
echo ═══════════════════════════════════════════════════════
echo.

:: 1. Verifica se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js não foi encontrado no seu computador!
    echo.
    echo Baixe e instale a versão LTS gratuitamente em:
    echo 👉 https://nodejs.org
    echo.
    start https://nodejs.org
    pause
    exit /b
)

:: 2. Se não existir o arquivo .env, faz a configuração rápida inicial
if not exist .env (
    echo ═══════════════════════════════════════════════════════
    echo   🔑 CONFIGURAÇÃO INICIAL DA SUA LOJA
    echo ═══════════════════════════════════════════════════════
    echo Você só precisa informar 2 coisas agora. Todo o restante
    echo poderá ser configurado conversando com o bot no Telegram!
    echo.
    
    set /p USER_BOT_TOKEN="👉 Cole o BOT_TOKEN do Telegram (do @BotFather): "
    set /p USER_ADMIN_ID="👉 Digite o seu ADMIN_ID do Telegram (do @userinfobot): "
    
    (
        echo BOT_TOKEN=%USER_BOT_TOKEN%
        echo ADMIN_ID=%USER_ADMIN_ID%
        echo API_BASE_URL=https://api.bunaistore.shop/v1
    ) > .env
    
    echo.
    echo [OK] Configurações salvas no arquivo .env com sucesso!
    echo.
)

:: 3. Se não tiver os pacotes instalados, instala agora
if not exist node_modules (
    echo ⚙️ Instalando componentes necessários...
    call npm install
    echo.
)

:: 4. Se não estiver compilado, compila o TypeScript
if not exist dist\index.js (
    echo 🔨 Compilando o bot...
    call npm run build
    echo.
)

echo.
echo ═══════════════════════════════════════════════════════
echo   🚀 INICIANDO BOT... (Para parar, feche esta janela)
echo ═══════════════════════════════════════════════════════
echo.

:loop
node dist/index.js
echo.
echo [AVISO] O bot foi finalizado. Reiniciando em 5 segundos... (Pressione Ctrl+C para encerrar)
timeout /t 5 > nul
goto loop
