import { createBot } from "./bot/bot.js";
import { env } from "./config/env.js";
import { settingsRepo } from "./db/database.js";

async function main() {
  console.log(`
  ═══════════════════════════════════════════════════════
  🤖 GEMINI STORE BOT — SISTEMA DE VENDAS AUTÔNOMO
  ═══════════════════════════════════════════════════════
  `);

  if (!env.BOT_TOKEN) {
    console.error("❌ ERRO FATAL: BOT_TOKEN não encontrado no arquivo .env!");
    console.error("👉 Crie seu bot no @BotFather do Telegram e coloque o token no .env.");
    process.exit(1);
  }

  if (!env.ADMIN_ID) {
    console.warn("⚠️ AVISO: ADMIN_ID não configurado. Comandos administrativos estarão bloqueados.");
  }

  const config = settingsRepo.getConfig();
  console.log(`[Store] Nome da Loja: ${config.storeName}`);
  console.log(`[Store] Preço Venda: R$ ${config.salePriceBrl.toFixed(2)}`);
  console.log(`[Store] Mercado Pago: ${config.mpAccessToken ? "Configurado" : "Pendente"}`);
  console.log(`[Store] API Fornecedor: ${config.resellerApiKey ? "Configurada" : "Pendente"}`);
  console.log(`[Store] Status Geral: ${config.isConfigured ? "🟢 Loja Pronta" : "🟡 Aguardando Setup (/setup)"}`);

  const bot = createBot();

  console.log("\n🚀 Conectando com a API do Telegram via Long Polling...");
  
  // Inicia o bot
  bot.start({
    onStart(botInfo) {
      console.log(`✅ Bot @${botInfo.username} online e pronto para receber clientes!`);
      if (!config.isConfigured && env.ADMIN_ID) {
        console.log(`👉 Abra o Telegram, acesse @${botInfo.username} e envie /start para configurar sua loja.`);
      }
    },
  });

  // Encerramento seguro
  const shutdown = () => {
    console.log("\n🛑 Encerrando bot de forma segura...");
    bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("❌ Erro fatal ao iniciar o bot:", err);
  process.exit(1);
});
