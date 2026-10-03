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

// Rastreamento de clientes digitando valor de recarga personalizada (userId -> promptMsgId)
const customDepositPromptUsers = new Map<number, number>();

/**
 * Configura o botão azul oficial 'Menu' do Telegram e seus comandos de forma resiliente
 */
export async function setupBotCommands(bot: Bot) {
  try {
    // Comandos públicos para qualquer cliente
    await bot.api.setMyCommands([
      { command: "start", description: "🏪 Início da Loja" },
      { command: "carteira", description: "💰 Carteira & Saldo" },
      { command: "ajuda", description: "❓ Como Funciona e Suporte" },
    ]);

    // Comandos avançados para o Dono da Loja (Admin)
    if (env.ADMIN_ID) {
      await bot.api.setMyCommands(
        [
          { command: "admin", description: "🛡️ Painel de Controle" },
          { command: "start", description: "🏪 Visão do Cliente" },
          { command: "carteira", description: "💰 Carteira" },
          { command: "addsaldo", description: "➕ Adicionar Saldo a Cliente" },
          { command: "remsaldo", description: "➖ Remover Saldo de Cliente" },
          { command: "simular", description: "🧪 Simular Entrega" },
          { command: "diagnostico", description: "🩺 Testar Conexões" },
        ],
        { scope: { type: "chat", chat_id: env.ADMIN_ID } }
      );
    }
  } catch (err) {
    console.warn("[Bot Commands] Aviso ao configurar comandos nativos do Telegram:", err);
  }
}

export function createBot(): Bot {
  if (!env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN não foi configurado no arquivo .env");
  }

  const bot = new Bot(env.BOT_TOKEN);

  // ─── Middleware Global: Resiliência contra Erros e Stale Queries ──────────
  bot.use(async (ctx, next) => {
    try {
      if (ctx.from) {
        userRepo.touch(ctx.from.id, ctx.from.username, ctx.from.first_name);
      }
      await next();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes("message is not modified")) {
        try {
          await ctx.answerCallbackQuery();
        } catch {}
        return;
      }
      if (errMsg.includes("query is too old")) {
        return;
      }
      console.error(`[Bot Error] Falha na requisição ${ctx.update.update_id}:`, errMsg);
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCallbackQuery({
            text: "⚠️ Ação concluída ou expirada.",
            show_alert: false,
          });
        } catch {}
      }
    }
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
    const text =
      `💬 <b>SUPORTE & ATENDIMENTO</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Para dúvidas sobre seu pedido, ativação ou pagamentos, nossa equipe está à disposição para te atender:\n\n` +
      `👉 Atendimento oficial: <b>@${config.supportUsername || "Admin"}</b>`;

    if (ctx.callbackQuery?.message?.text) {
      return ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboards.supportMenu(config.supportUsername),
      });
    }
    return ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboards.supportMenu(config.supportUsername),
    });
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
    const promptText =
      "💵 <b>RECARGA DE VALOR PERSONALIZADO</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Digite o valor em Reais que deseja adicionar à sua carteira:\n" +
      "<i>(Exemplo: <code>45.00</code> ou <code>100.00</code> — Mínimo: R$ 5,00)</i>";

    if (ctx.callbackQuery?.message?.text) {
      try {
        await ctx.editMessageText(promptText, {
          parse_mode: "HTML",
          reply_markup: keyboards.cancelPrompt("nav_wallet"),
        });
        customDepositPromptUsers.set(ctx.from.id, ctx.callbackQuery.message.message_id);
        return;
      } catch {}
    }

    const sent = await ctx.reply(promptText, {
      parse_mode: "HTML",
      reply_markup: keyboards.cancelPrompt("nav_wallet"),
    });
    customDepositPromptUsers.set(ctx.from.id, sent.message_id);
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

  // ─── Tratamento de Mensagens de Texto (Resiliente) ────────────────────────
  bot.on("message:text", async (ctx) => {
    // 1. Verifica se o cliente está digitando valor de recarga personalizada
    if (customDepositPromptUsers.has(ctx.from.id)) {
      const promptMsgId = customDepositPromptUsers.get(ctx.from.id);
      customDepositPromptUsers.delete(ctx.from.id);

      // Apaga o que o usuário digitou para não deixar lixo no chat
      try {
        await ctx.deleteMessage();
      } catch {}

      const text = ctx.message.text.trim();
      const val = parseFloat(text.replace(",", "."));
      if (isNaN(val) || val < 5.0) {
        if (promptMsgId) {
          try {
            await ctx.api.editMessageText(
              ctx.chat.id,
              promptMsgId,
              "❌ <b>Valor inválido!</b> O valor mínimo para recarga via PIX é de <b>R$ 5,00</b>.\n\nDigite novamente ou clique em Cancelar:",
              {
                parse_mode: "HTML",
                reply_markup: keyboards.cancelPrompt("nav_wallet"),
              }
            );
            customDepositPromptUsers.set(ctx.from.id, promptMsgId);
            return;
          } catch {}
        }
        return ctx.reply("❌ Valor mínimo para recarga via PIX é de R$ 5,00. Tente novamente:", {
          reply_markup: keyboards.cancelPrompt("nav_wallet"),
        });
      }

      // Apaga a mensagem do prompt anterior para dar lugar limpo ao QR Code
      if (promptMsgId) {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, promptMsgId);
        } catch {}
      }

      return handleDepositSelect(ctx, val);
    }

    // 2. Se for o Admin, verifica prompts ativos de configuração
    if (ctx.from.id === env.ADMIN_ID) {
      const config = settingsRepo.getConfig();
      const prompt = config.activePromptKey;

      if (prompt) {
        const text = ctx.message.text;

        // Se estiver no assistente de primeiro boot
        if (prompt.startsWith("wiz_")) {
          return handleWizardStep(ctx, prompt, text);
        }

        // Se for prompt comum do menu admin
        return handleAdminPrompt(ctx, prompt, text);
      }
    }

    // 3. Fallback inteligente e resiliente para clientes (reconhece termos e nunca deixa sem resposta)
    const lower = ctx.message.text.toLowerCase().trim();
    if (
      lower.includes("comprar") ||
      lower.includes("preço") ||
      lower.includes("preco") ||
      lower.includes("quero") ||
      lower.includes("pix")
    ) {
      return handleBuyNow(ctx);
    }
    if (lower.includes("carteira") || lower.includes("saldo") || lower.includes("recarga")) {
      return handleWallet(ctx);
    }
    if (
      lower.includes("funciona") ||
      lower.includes("duvida") ||
      lower.includes("ajuda") ||
      lower.includes("como") ||
      lower.includes("regras")
    ) {
      return handleCustomerFaq(ctx);
    }
    if (
      lower.includes("suporte") ||
      lower.includes("falar") ||
      lower.includes("contato") ||
      lower.includes("atendente")
    ) {
      const config = settingsRepo.getConfig();
      return ctx.reply(
        `💬 <b>SUPORTE & ATENDIMENTO</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Para dúvidas sobre pedidos, pagamentos ou suporte técnico, fale diretamente com: @${config.supportUsername || "Admin"}`,
        {
          parse_mode: "HTML",
          reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
        }
      );
    }

    // Se o cliente enviar qualquer mensagem comum ("oi", "olá", "menu"), exibe a loja acolhendo o cliente
    return handleCustomerStart(ctx);
  });

  return bot;
}
