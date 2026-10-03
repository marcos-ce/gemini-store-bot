import { Bot, Context } from "grammy";
import { env } from "../config/env.js";
import { settingsRepo, userRepo } from "../db/database.js";
import { handleCustomerStart, handleCustomerFaq, handleBuyNow, handleCheckPix, handleCancelPix } from "./handlers/customer.js";
import { showAdminPanel, handleAdminCallback, handleAdminPrompt, handleSimulateDelivery, handleDiagnostics } from "./handlers/admin.js";
import { startWizard, handleWizardStep } from "./handlers/wizard.js";

export function createBot(): Bot {
  if (!env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN não foi configurado no arquivo .env");
  }

  const bot = new Bot(env.BOT_TOKEN);

  // ─── Middleware Global: Registro de Usuários ──────────────────────────────
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      userRepo.touch(ctx.from.id, ctx.from.username, ctx.from.first_name);
    }
    await next();
  });

  // ─── Comandos Básicos ─────────────────────────────────────────────────────
  bot.command("start", handleCustomerStart);
  bot.command(["admin", "painel"], (ctx) => showAdminPanel(ctx));
  bot.command("setup", (ctx) => {
    if (ctx.from?.id === env.ADMIN_ID) return startWizard(ctx);
  });
  bot.command("simular", (ctx) => {
    if (ctx.from?.id === env.ADMIN_ID) return handleSimulateDelivery(ctx);
  });
  bot.command("diagnostico", (ctx) => {
    if (ctx.from?.id === env.ADMIN_ID) return handleDiagnostics(ctx);
  });
  bot.command("ajuda", handleCustomerFaq);

  // ─── Callbacks de Navegação & Compra ───────────────────────────────────────
  bot.callbackQuery("buy_now", handleBuyNow);
  bot.callbackQuery("nav_faq", handleCustomerFaq);
  bot.callbackQuery("wiz_start", (ctx) => {
    if (ctx.from?.id === env.ADMIN_ID) return startWizard(ctx);
  });
  bot.callbackQuery("nav_support", async (ctx) => {
    const config = settingsRepo.getConfig();
    await ctx.answerCallbackQuery();
    return ctx.reply(
      `💬 <b>SUPORTE & ATENDIMENTO</b>\n\n` +
        `Para dúvidas sobre pedidos, pagamentos ou suporte técnico, fale diretamente com: @${config.supportUsername || "Admin"}`,
      { parse_mode: "HTML" }
    );
  });

  // Callbacks de Pagamento PIX
  bot.callbackQuery(/^check_pix_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    return handleCheckPix(ctx, orderId);
  });

  bot.callbackQuery(/^cancel_pix_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    return handleCancelPix(ctx, orderId);
  });

  // Callbacks do Painel Admin
  bot.callbackQuery(/^adm_/, handleAdminCallback);

  // ─── Tratamento de Mensagens de Texto (Prompts do Admin e Wizard) ─────────
  bot.on("message:text", async (ctx) => {
    if (ctx.from.id !== env.ADMIN_ID) return;

    const config = settingsRepo.getConfig();
    const prompt = config.activePromptKey;

    if (!prompt) return;

    const text = ctx.message.text;

    // Se estiver no assistente de primeiro boot
    if (prompt.startsWith("wiz_")) {
      return handleWizardStep(ctx, prompt, text);
    }

    // Se for prompt comum do menu admin
    return handleAdminPrompt(ctx, prompt, text);
  });

  // ─── Tratamento de Erros Global ───────────────────────────────────────────
  bot.catch((err) => {
    console.error(`[Bot Error] Falha na requisição ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}
