import { Bot, Context } from "grammy";
import { env } from "../config/env.js";
import { settingsRepo, userRepo } from "../db/database.js";
import {
  handleCustomerStart,
  handleCustomerFaq,
  handleBuyNow,
  handleCheckPix,
  handleCancelPix,
  handleWallet,
  handleDepositSelect,
  handleCheckDeposit,
  handleCancelDeposit,
  handleBuyWithWallet,
  executeDirectPixCheckout,
} from "./handlers/customer.js";
import {
  showAdminPanel,
  handleAdminCallback,
  handleAdminPrompt,
  handleSimulateDelivery,
  handleDiagnostics,
  handleAdminAddSaldo,
} from "./handlers/admin.js";
import { startWizard, handleWizardStep } from "./handlers/wizard.js";
import { keyboards } from "./keyboards.js";

// Rastreamento de clientes digitando valor de recarga personalizada
const customDepositPromptUsers = new Set<number>();

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
  bot.command(["carteira", "saldo"], handleWallet);
  bot.command(["admin", "painel"], (ctx) => showAdminPanel(ctx));
  bot.command(["addsaldo", "remsaldo"], handleAdminAddSaldo);
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
  bot.callbackQuery("buy_wallet", handleBuyWithWallet);
  bot.callbackQuery("buy_pix_direct", executeDirectPixCheckout);
  bot.callbackQuery("nav_wallet", handleWallet);
  bot.callbackQuery("nav_home", handleCustomerStart);
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

  // Callbacks de Recarga de Carteira
  bot.callbackQuery(/^dep_qty_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const amount = parseInt(ctx.match[1], 10);
    return handleDepositSelect(ctx, amount);
  });

  bot.callbackQuery("dep_custom", async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();
    customDepositPromptUsers.add(ctx.from.id);
    return ctx.reply(
      "💵 <b>Qual valor você deseja recarregar na sua carteira?</b>\n\n" +
        "Digite o valor em Reais (exemplo: <code>45.00</code> ou <code>100.00</code>):",
      { parse_mode: "HTML" }
    );
  });

  bot.callbackQuery(/^check_dep_(.+)$/, async (ctx) => {
    const depId = ctx.match[1];
    return handleCheckDeposit(ctx, depId);
  });

  bot.callbackQuery(/^cancel_dep_(.+)$/, async (ctx) => {
    const depId = ctx.match[1];
    return handleCancelDeposit(ctx, depId);
  });

  // Callbacks de Pagamento PIX de Pedido
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

  // ─── Tratamento de Mensagens de Texto ─────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    // 1. Verifica se o cliente está digitando valor de recarga personalizada
    if (customDepositPromptUsers.has(ctx.from.id)) {
      customDepositPromptUsers.delete(ctx.from.id);
      const text = ctx.message.text.trim();
      const val = parseFloat(text.replace(",", "."));
      if (isNaN(val) || val < 5.0) {
        return ctx.reply("❌ Valor mínimo para recarga via PIX é de R$ 5,00. Tente novamente clicando em Recarregar.", {
          reply_markup: keyboards.customerMain(settingsRepo.getConfig().salePriceBrl, settingsRepo.getConfig().supportUsername, true),
        });
      }
      return handleDepositSelect(ctx, val);
    }

    // 2. Se for o Admin, verifica prompts ativos
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
