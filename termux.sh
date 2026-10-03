#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 🤖 GEMINI STORE BOT — INSTALADOR NO ANDROID (TERMUX)
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "📱 Instalando dependências no Termux..."
pkg update -y && pkg install nodejs git -y

INSTALL_DIR="$HOME/gemini-store-bot"
if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR"
  git pull origin main || true
else
  git clone https://github.com/marcos-ce/gemini-store-bot.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

npm install

if [ ! -f .env ]; then
  echo ""
  read -rp "👉 Cole o BOT_TOKEN do @BotFather: " USER_BOT_TOKEN
  read -rp "👉 Cole o seu ADMIN_ID do @userinfobot: " USER_ADMIN_ID
  cat <<EOF > .env
BOT_TOKEN=${USER_BOT_TOKEN}
ADMIN_ID=${USER_ADMIN_ID}
API_BASE_URL=https://api.hewhotries.tech/v1
EOF
fi

npm run build

echo ""
echo "🚀 Iniciando bot no seu Android..."
node dist/index.js
