#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# 🤖 GEMINI STORE BOT — INSTALADOR AUTOMÁTICO EM 1 COMANDO (VPS LINUX)
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  🚀 INICIANDO INSTALAÇÃO DO GEMINI STORE BOT"
echo "═══════════════════════════════════════════════════════"
echo ""

# 1. Atualização do sistema e dependências básicas
echo "📦 [1/6] Verificando dependências do sistema..."
sudo apt-get update -y > /dev/null 2>&1 || true
sudo apt-get install -y curl git build-essential > /dev/null 2>&1

# 2. Instalação do Node.js 22 LTS se não existir ou for antigo (< 22)
if ! command -v node > /dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 22 ]; then
  echo "📥 [2/6] Instalando Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - > /dev/null 2>&1
  sudo apt-get install -y nodejs > /dev/null 2>&1
else
  echo "✅ [2/6] Node.js $(node -v) já está instalado."
fi

# 3. Download do Bot
INSTALL_DIR="$HOME/gemini-store-bot"
if [ -d "$INSTALL_DIR" ]; then
  echo "🔄 [3/6] Atualizando arquivos do bot..."
  cd "$INSTALL_DIR"
  git pull origin main || true
else
  echo "📥 [3/6] Baixando o bot do repositório..."
  git clone https://github.com/marcos-ce/gemini-store-bot.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# 4. Instalação dos pacotes NPM
echo "⚙️ [4/6] Instalando pacotes do projeto..."
npm install > /dev/null 2>&1

# 5. Configuração do arquivo .env interativa
if [ ! -f .env ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  🔑 CONFIGURAÇÃO BÁSICA INICIAL"
  echo "═══════════════════════════════════════════════════════"
  echo "Você só precisa informar 2 coisas agora. Todo o restante"
  echo "poderá ser configurado conversando com o bot no Telegram!"
  echo ""

  read -rp "👉 Digite o BOT_TOKEN do Telegram (do @BotFather): " USER_BOT_TOKEN
  read -rp "👉 Digite o seu ADMIN_ID do Telegram (do @userinfobot): " USER_ADMIN_ID
  read -rp "👉 URL da API Mestra [Pressione ENTER para padrão]: " USER_API_URL

  if [ -z "$USER_API_URL" ]; then
    USER_API_URL="https://api.hewhotries.tech/v1"
  fi

  cat <<EOF > .env
BOT_TOKEN=${USER_BOT_TOKEN}
ADMIN_ID=${USER_ADMIN_ID}
API_BASE_URL=${USER_API_URL}
EOF

  echo "✅ Arquivo .env gerado com sucesso!"
else
  echo "✅ [5/6] Arquivo .env já existe, mantendo configurações."
fi

# 6. Compilação TypeScript
echo "🔨 [6/6] Compilando o bot..."
npm run build

# 7. Configuração do PM2 para rodar 24h e reiniciar no boot
if ! command -v pm2 > /dev/null 2>&1; then
  echo "⚙️ Instalando gerenciador de processos PM2..."
  sudo npm install -g pm2 > /dev/null 2>&1
fi

pm2 delete gemini-store-bot > /dev/null 2>&1 || true
pm2 start dist/index.js --name "gemini-store-bot" --time
pm2 save > /dev/null 2>&1 || true

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  🎉 SUCESSO! SEU BOT JÁ ESTÁ RODANDO 24H POR DIA!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "👉 Abra seu bot no Telegram e envie /start"
echo "   Ele fará a configuração interativa da sua loja pelo chat!"
echo ""
echo "Comandos úteis na VPS:"
echo "• Ver logs ao vivo:    pm2 logs gemini-store-bot"
echo "• Reiniciar o bot:     pm2 restart gemini-store-bot"
echo "• Parar o bot:         pm2 stop gemini-store-bot"
echo "═══════════════════════════════════════════════════════"
echo ""
