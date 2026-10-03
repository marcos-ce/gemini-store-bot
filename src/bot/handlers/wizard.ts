import { Context } from "grammy";
import { settingsRepo } from "../../db/database.js";
import { MercadoPagoService } from "../../services/mercadopago.js";
import { MasterApiClient } from "../../services/apiClient.js";
import { keyboards } from "../keyboards.js";

let wizardMessageId: number | null = null;

/**
 * Inicia o assistente de configuração passo a passo
 */
export async function startWizard(ctx: Context) {
  settingsRepo.updateConfig({ activePromptKey: "wiz_store_name" });

  const msg =
    `👋 <b>BEM-VINDO AO ASSISTENTE DE CONFIGURAÇÃO!</b>\n\n` +
    `Vamos deixar sua loja 100% pronta para vender no piloto automático em poucos segundos.\n\n` +
    `1️⃣ <b>Passo 1 de 5:</b>\n` +
    `Qual será o <b>Nome da sua Loja</b>?\n` +
    `<i>(Ex: Minha Loja VIP, GG Store, Gemini Premium)</i>`;

  if (ctx.callbackQuery?.message?.text) {
    try {
      await ctx.editMessageText(msg, {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      });
      wizardMessageId = ctx.callbackQuery.message.message_id;
      return;
    } catch {}
  }

  const sent = await ctx.reply(msg, {
    parse_mode: "HTML",
    reply_markup: keyboards.cancelPrompt(),
  });
  wizardMessageId = sent.message_id;
}

/**
 * Processa a resposta do Admin durante o Wizard em uma única mensagem sem lixo
 */
export async function handleWizardStep(ctx: Context, step: string, text: string) {
  // Apaga a mensagem digitada pelo usuário imediatamente
  try {
    await ctx.deleteMessage();
  } catch {}

  const cleanText = text.trim();

  // ─── Passo 1: Nome da Loja ───
  if (step === "wiz_store_name") {
    if (cleanText.length < 2 || cleanText.length > 35) {
      const errText =
        `❌ <b>Nome inválido!</b> Digite um nome entre 2 e 35 caracteres.\n\n` +
        `1️⃣ <b>Passo 1 de 5:</b>\n` +
        `Qual será o <b>Nome da sua Loja</b>?`;
      if (wizardMessageId) {
        return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, errText, {
          parse_mode: "HTML",
          reply_markup: keyboards.cancelPrompt(),
        });
      }
      const sent = await ctx.reply(errText, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
      wizardMessageId = sent.message_id;
      return;
    }

    settingsRepo.updateConfig({
      storeName: cleanText,
      activePromptKey: "wiz_mp_token",
    });

    const step2Text =
      `✅ Nome definido: <b>${cleanText}</b>\n\n` +
      `2️⃣ <b>Passo 2 de 5:</b>\n` +
      `Cole aqui o seu <b>Access Token de Produção do Mercado Pago</b>:\n\n` +
      `<blockquote>💡 É aqui que você receberá o dinheiro das vendas via PIX na sua conta.\n` +
      `O token geralmente começa com <code>APP_USR-...</code></blockquote>`;

    if (wizardMessageId) {
      return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, step2Text, {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      });
    }
    const sent = await ctx.reply(step2Text, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
    wizardMessageId = sent.message_id;
    return;
  }

  // ─── Passo 2: Access Token do Mercado Pago ───
  if (step === "wiz_mp_token") {
    if (wizardMessageId) {
      try {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          wizardMessageId,
          "⏳ <i>Testando credenciais do Mercado Pago...</i>",
          { parse_mode: "HTML" }
        );
      } catch {}
    }

    const mp = new MercadoPagoService(cleanText);
    const test = await mp.testConnection();

    if (!test.ok) {
      const errText =
        `❌ <b>Credencial do Mercado Pago inválida!</b>\n\n` +
        `<i>Detalhes: ${test.error}</i>\n\n` +
        `Certifique-se de copiar o <b>Access Token de Produção</b> no painel de desenvolvedores do Mercado Pago.\n` +
        `Por favor, envie novamente:`;
      if (wizardMessageId) {
        return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, errText, {
          parse_mode: "HTML",
          reply_markup: keyboards.cancelPrompt(),
        });
      }
      const sent = await ctx.reply(errText, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
      wizardMessageId = sent.message_id;
      return;
    }

    settingsRepo.updateConfig({
      mpAccessToken: cleanText,
      activePromptKey: "wiz_api_key",
    });

    const step3Text =
      `✅ <b>Mercado Pago Conectado!</b>\n` +
      `👤 Titular: <code>${test.nickname || "Conta Ativa"}</code>\n\n` +
      `3️⃣ <b>Passo 3 de 5:</b>\n` +
      `Cole aqui a sua <b>Chave de API do Fornecedor</b>:\n\n` +
      `<blockquote>🔑 É a chave que você recebeu na compra para emissão dos produtos (começa com <code>gg_live_...</code>).</blockquote>`;

    if (wizardMessageId) {
      return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, step3Text, {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      });
    }
    const sent = await ctx.reply(step3Text, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
    wizardMessageId = sent.message_id;
    return;
  }

  // ─── Passo 3: Chave da API GGBot ───
  if (step === "wiz_api_key") {
    if (wizardMessageId) {
      try {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          wizardMessageId,
          "⏳ <i>Conectando com o servidor de fornecimento...</i>",
          { parse_mode: "HTML" }
        );
      } catch {}
    }

    const config = settingsRepo.getConfig();
    const client = new MasterApiClient(config.apiBaseUrl, cleanText);
    const account = await client.getAccount();

    if (!account.ok || !account.user) {
      const errText =
        `❌ <b>Chave de API do fornecedor inválida!</b>\n\n` +
        `<i>Erro: ${account.error}</i>\n\n` +
        `Verifique se colou a chave completa (<code>gg_live_...</code>) e tente novamente:`;
      if (wizardMessageId) {
        return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, errText, {
          parse_mode: "HTML",
          reply_markup: keyboards.cancelPrompt(),
        });
      }
      const sent = await ctx.reply(errText, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
      wizardMessageId = sent.message_id;
      return;
    }

    settingsRepo.updateConfig({
      resellerApiKey: cleanText,
      activePromptKey: "wiz_sale_price",
    });

    const step4Text =
      `✅ <b>Fornecedor Conectado com Sucesso!</b>\n` +
      `💰 Saldo na sua carteira de API: <b>R$ ${account.user.balance_brl.toFixed(2)}</b>\n\n` +
      `4️⃣ <b>Passo 4 de 5:</b>\n` +
      `Por quanto você deseja vender o <b>Google 5TB - Gemini Pro 18 Meses</b>?\n\n` +
      `<blockquote>💵 Custo da API: R$ 15,00\n` +
      `💡 Sugestão de venda: R$ 25,00 a R$ 39,90</blockquote>\n` +
      `Digite o valor (ex: <code>29.90</code>):`;

    if (wizardMessageId) {
      return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, step4Text, {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      });
    }
    const sent = await ctx.reply(step4Text, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
    wizardMessageId = sent.message_id;
    return;
  }

  // ─── Passo 4: Preço de Venda ───
  if (step === "wiz_sale_price") {
    const rawVal = parseFloat(cleanText.replace(",", "."));

    if (isNaN(rawVal) || rawVal <= 0 || rawVal < 15.0) {
      const errText =
        `⚠️ <b>Preço inválido ou abaixo do custo de R$ 15,00!</b>\n\n` +
        `Defina um valor superior para ter margem de lucro (ex: <code>25.00</code> ou <code>29.90</code>).\n` +
        `Digite o valor desejado:`;
      if (wizardMessageId) {
        return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, errText, {
          parse_mode: "HTML",
          reply_markup: keyboards.cancelPrompt(),
        });
      }
      const sent = await ctx.reply(errText, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
      wizardMessageId = sent.message_id;
      return;
    }

    settingsRepo.updateConfig({
      salePriceBrl: rawVal,
      activePromptKey: "wiz_support",
    });

    const defaultUser = ctx.from?.username ? `@${ctx.from.username}` : "@seu_suporte";
    const step5Text =
      `✅ Preço definido: <b>R$ ${rawVal.toFixed(2)}</b> (Lucro de R$ ${(rawVal - 15).toFixed(2)} por venda!)\n\n` +
      `5️⃣ <b>Passo Final:</b>\n` +
      `Qual é o seu <b>@ de usuário no Telegram</b> para suporte dos clientes?\n\n` +
      `Digite seu @ ou envie <code>ok</code> para usar <b>${defaultUser}</b>:`;

    if (wizardMessageId) {
      return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, step5Text, {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      });
    }
    const sent = await ctx.reply(step5Text, { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() });
    wizardMessageId = sent.message_id;
    return;
  }

  // ─── Passo 5: Suporte & Conclusão ───
  if (step === "wiz_support") {
    let support = cleanText.toLowerCase() === "ok" ? ctx.from?.username || "" : cleanText;
    support = support.replace(/^@/, "");

    settingsRepo.updateConfig({
      supportUsername: support,
      isConfigured: true,
      activePromptKey: "",
    });

    const finalConfig = settingsRepo.getConfig();
    const profit = finalConfig.salePriceBrl - 15.0;

    const finalText =
      `🎉 <b>PARABÉNS! SUA LOJA ESTÁ 100% CONFIGURADA!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏪 <b>Loja:</b> ${finalConfig.storeName}\n` +
      `⭐ <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
      `💵 <b>Preço de Venda:</b> R$ ${finalConfig.salePriceBrl.toFixed(2)}\n` +
      `📈 <b>Seu Lucro por Venda:</b> R$ ${profit.toFixed(2)}\n` +
      `💳 <b>Mercado Pago:</b> 🟢 Ativo (PIX Instantâneo)\n` +
      `🔑 <b>API Fornecedor:</b> 🟢 Conectada\n` +
      `💬 <b>Suporte:</b> @${finalConfig.supportUsername || "Admin"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👉 <b>Pronto para vender:</b> Seus clientes já podem dar <code>/start</code> e comprar!\n` +
      `👉 <b>Painel do Dono:</b> Digite <code>/admin</code> a qualquer momento para gerenciar tudo.`;

    if (wizardMessageId) {
      return ctx.api.editMessageText(ctx.chat!.id, wizardMessageId, finalText, {
        parse_mode: "HTML",
        reply_markup: keyboards.adminMenu(),
      });
    }
    return ctx.reply(finalText, {
      parse_mode: "HTML",
      reply_markup: keyboards.adminMenu(),
    });
  }
}
