import { Context } from "grammy";
import { env } from "../../config/env.js";
import { settingsRepo, orderRepo, userRepo } from "../../db/database.js";
import { MasterApiClient } from "../../services/apiClient.js";
import { MercadoPagoService } from "../../services/mercadopago.js";
import { keyboards } from "../keyboards.js";

let lastAdminPanelMessageId: number | null = null;

export function setLastAdminPanelMessageId(id: number | null) {
  lastAdminPanelMessageId = id;
}

export function getLastAdminPanelMessageId(): number | null {
  return lastAdminPanelMessageId;
}

function isAdmin(ctx: Context): boolean {
  return !!(ctx.from && ctx.from.id === env.ADMIN_ID);
}

/**
 * Renderiza o painel de controle principal do Admin (sempre reaproveitando a mensagem para zero poluição)
 */
export async function showAdminPanel(ctx: Context, editMessage = false, targetMsgId?: number) {
  if (!isAdmin(ctx)) {
    return ctx.reply("⛔ Acesso não autorizado.");
  }

  // Limpa prompt pendente
  settingsRepo.updateConfig({ activePromptKey: "" });

  const config = settingsRepo.getConfig();
  const stats = orderRepo.getStats();

  // Consulta saldo atual na API do fornecedor
  let apiStatus = "⚪ Não configurada";
  let apiBalanceText = "—";
  if (config.resellerApiKey) {
    const client = new MasterApiClient(config.apiBaseUrl, config.resellerApiKey);
    const acc = await client.getAccount();
    if (acc.ok && acc.user) {
      apiStatus = "🟢 Conectada";
      apiBalanceText = `R$ ${acc.user.balance_brl.toFixed(2)}`;
    } else {
      apiStatus = "🔴 Erro / Sem saldo";
    }
  }

  // Consulta status do Mercado Pago
  let mpStatus = "⚪ Não configurado";
  if (config.mpAccessToken) {
    const mp = new MercadoPagoService(config.mpAccessToken);
    const test = await mp.testConnection();
    if (test.ok) {
      mpStatus = `🟢 Ativo (${test.nickname || "Conta OK"})`;
    } else {
      mpStatus = "🔴 Token Inválido";
    }
  }

  const profitPerSale = config.salePriceBrl - 15.0;

  const text =
    `🛡️ <b>PAINEL DE CONTROLE — DONO DA LOJA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏪 <b>Nome da Loja:</b> ${config.storeName}\n` +
    `⭐ <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
    `💵 <b>Preço de Venda:</b> R$ ${config.salePriceBrl.toFixed(2)} <i>(Lucro: R$ ${profitPerSale.toFixed(2)}/un)</i>\n` +
    `💬 <b>Suporte:</b> @${config.supportUsername || "Não configurado"}\n\n` +
    `💳 <b>Mercado Pago:</b> ${mpStatus}\n` +
    `🔑 <b>API Fornecedor:</b> ${apiStatus} · Saldo: <b>${apiBalanceText}</b>\n\n` +
    `📊 <b>RESUMO FINANCEIRO</b>\n` +
    `• Vendas Entregues: <b>${stats.totalSales} pedidos</b>\n` +
    `• Faturamento Bruto: <b>R$ ${stats.totalGrossBrl.toFixed(2)}</b>\n` +
    `• 💰 <b>Seu Lucro Líquido: R$ ${stats.totalProfitBrl.toFixed(2)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Clique nos botões abaixo para alterar qualquer configuração:</i>`;

  const msgIdToEdit =
    targetMsgId || (ctx.callbackQuery?.message ? ctx.callbackQuery.message.message_id : lastAdminPanelMessageId);

  if ((editMessage || ctx.callbackQuery?.message) && msgIdToEdit) {
    try {
      await ctx.api.editMessageText(ctx.chat!.id, msgIdToEdit, text, {
        parse_mode: "HTML",
        reply_markup: keyboards.adminMenu(config.walletEnabled),
      });
      lastAdminPanelMessageId = msgIdToEdit;
      return;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes("message is not modified")) {
        try {
          await ctx.answerCallbackQuery();
        } catch {}
        return;
      }
    }
  }

  // Se foi comando (/admin), apaga o comando digitado para manter o chat limpo
  try {
    await ctx.deleteMessage();
  } catch {}

  // Apaga painel anterior se ainda estiver aberto no chat
  if (lastAdminPanelMessageId) {
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, lastAdminPanelMessageId);
    } catch {}
  }

  const sent = await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboards.adminMenu(config.walletEnabled),
  });
  lastAdminPanelMessageId = sent.message_id;
}

/**
 * Trata o clique nos botões inline do /admin (editando em tempo real)
 */
export async function handleAdminCallback(ctx: Context) {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔ Não autorizado." });
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  if (data === "adm_refresh" || data === "adm_back_panel" || data === "adm_cancel_prompt") {
    return showAdminPanel(ctx, true);
  }

  if (data === "adm_set_name") {
    settingsRepo.updateConfig({ activePromptKey: "set_name" });
    return ctx.editMessageText(
      "🏷️ <b>ALTERAR NOME DA LOJA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Digite o novo nome para sua loja aqui na conversa:\n<i>(Exemplo: Minha Loja VIP)</i>",
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_set_price") {
    settingsRepo.updateConfig({ activePromptKey: "set_price" });
    return ctx.editMessageText(
      "💵 <b>ALTERAR PREÇO DE VENDA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Digite o novo preço de venda em Reais:\n<i>(Exemplo: 29.90 ou 35.00 — Custo API: R$ 15,00)</i>",
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_set_mp") {
    settingsRepo.updateConfig({ activePromptKey: "set_mp" });
    return ctx.editMessageText(
      "💳 <b>TOKEN MERCADO PAGO</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Cole aqui o seu novo <b>Access Token de Produção</b>:\n" +
        "<i>(Sua mensagem será apagada do chat imediatamente por segurança)</i>",
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_set_api") {
    settingsRepo.updateConfig({ activePromptKey: "set_api" });
    return ctx.editMessageText(
      "🔑 <b>CHAVE DA API FORNECEDOR</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Cole aqui a sua nova <b>Chave de API</b> (<code>gg_live_...</code>):\n" +
        "<i>(Sua mensagem será apagada do chat imediatamente por segurança)</i>",
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_set_support") {
    settingsRepo.updateConfig({ activePromptKey: "set_support" });
    return ctx.editMessageText(
      "💬 <b>USUÁRIO DE SUPORTE</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Digite o novo @ do seu Telegram para suporte aos clientes:\n<i>(Exemplo: @seu_usuario)</i>",
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_simulate") {
    return handleSimulateDelivery(ctx);
  }

  if (data === "adm_diag") {
    return handleDiagnostics(ctx);
  }

  if (data === "adm_stats") {
    const stats = orderRepo.getStats();
    const recent = orderRepo.getRecent(5);

    let recentText = "";
    if (recent.length > 0) {
      recentText =
        `\n\n📦 <b>Últimas Vendas:</b>\n` +
        recent
          .map(
            (o) =>
              `• <code>${o.id}</code> — R$ ${(o.price_cents / 100).toFixed(2)} (${o.created_at.slice(0, 16)})`
          )
          .join("\n");
    }

    return ctx.editMessageText(
      `📊 <b>RELATÓRIO DE VENDAS & FATURAMENTO</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Pedidos Concluídos: <b>${stats.totalSales}</b>\n` +
        `• Faturamento Total: <b>R$ ${stats.totalGrossBrl.toFixed(2)}</b>\n` +
        `• Custo Total de Fornecimento: <b>R$ ${stats.totalCostBrl.toFixed(2)}</b>\n` +
        `• 💰 <b>Lucro Líquido Total: R$ ${stats.totalProfitBrl.toFixed(2)}</b>` +
        recentText,
      { parse_mode: "HTML", reply_markup: keyboards.adminBackOnly() }
    );
  }

  if (data === "adm_broadcast") {
    settingsRepo.updateConfig({ activePromptKey: "set_broadcast" });
    return ctx.editMessageText(
      "📢 <b>ENVIO DE COMUNICADO GERAL</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "Digite a mensagem que deseja transmitir para todos os usuários cadastrados no bot.\n" +
        "<i>(Ou clique em Cancelar abaixo para voltar ao painel)</i>",
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_texts") {
    return ctx.editMessageText(
      `📝 <b>PERSONALIZAÇÃO DE TEXTOS DA LOJA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Escolha qual mensagem você deseja personalizar:\n\n` +
        `• <b>Descrição do Produto:</b> Exibida no menu inicial do /start\n` +
        `• <b>Dúvidas & Regras (FAQ):</b> Exibida no botão 'Como Funciona'\n` +
        `• <b>Instruções Pós-Entrega:</b> Enviada junto com o link após a aprovação do PIX`,
      { parse_mode: "HTML", reply_markup: keyboards.messagesMenu() }
    );
  }

  if (data === "adm_set_desc") {
    settingsRepo.updateConfig({ activePromptKey: "set_desc" });
    const current = settingsRepo.get("product_description", "<i>(Padrão de fábrica ativo)</i>");
    return ctx.editMessageText(
      `✏️ <b>ALTERAR DESCRIÇÃO DO PRODUTO</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Envie agora o texto que deseja exibir na tela principal do /start.\n` +
        `<i>(Suporta emojis e formatação HTML: &lt;b&gt;, &lt;i&gt;, &lt;blockquote&gt;)</i>\n\n` +
        `<b>Texto atual:</b>\n${current}`,
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_set_faq") {
    settingsRepo.updateConfig({ activePromptKey: "set_faq" });
    const current = settingsRepo.get("faq_text", "<i>(Padrão de fábrica ativo)</i>");
    return ctx.editMessageText(
      `✏️ <b>ALTERAR DÚVIDAS & REGRAS (FAQ)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Envie o texto que será exibido quando o cliente clicar em 'Como Funciona':\n\n` +
        `<b>Texto atual:</b>\n${current}`,
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_set_delivery") {
    settingsRepo.updateConfig({ activePromptKey: "set_delivery" });
    const current = settingsRepo.get("post_delivery_text", "<i>(Padrão de fábrica ativo)</i>");
    return ctx.editMessageText(
      `✏️ <b>ALTERAR INSTRUÇÕES PÓS-ENTREGA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Envie as instruções que serão entregues ao cliente junto com o link de ativação:\n\n` +
        `<b>Texto atual:</b>\n${current}`,
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_reset_texts") {
    settingsRepo.delete("product_description");
    settingsRepo.delete("faq_text");
    settingsRepo.delete("post_delivery_text");
    await ctx.answerCallbackQuery({ text: "✅ Textos restaurados para os padrões originais!" });
    return showAdminPanel(ctx, true);
  }

  if (data === "adm_toggle_wallet") {
    const config = settingsRepo.getConfig();
    settingsRepo.updateConfig({ walletEnabled: !config.walletEnabled });
    return showAdminPanel(ctx, true);
  }

  if (data === "adm_preview") {
    const config = settingsRepo.getConfig();
    return ctx.editMessageText(
      `👁️ <b>Prévia da Loja (Visão do seu Cliente):</b>\n━━━━━━━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: "HTML",
        reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
      }
    );
  }
}

/**
 * Trata o texto digitado pelo Admin após clicar em um botão de configuração
 * (apaga a mensagem do admin e atualiza a mensagem original no mesmo lugar)
 */
export async function handleAdminPrompt(ctx: Context, promptKey: string, text: string) {
  if (!isAdmin(ctx)) return;

  // Apaga a mensagem digitada pelo usuário imediatamente
  try {
    await ctx.deleteMessage();
  } catch {}

  const clean = text.trim();
  const targetId = lastAdminPanelMessageId;

  const showPromptError = async (err: string) => {
    if (targetId) {
      try {
        await ctx.api.editMessageText(ctx.chat!.id, targetId, `${err}\n\nTente novamente ou cancele:`, {
          parse_mode: "HTML",
          reply_markup: keyboards.cancelPrompt(),
        });
        return;
      } catch {}
    }
    await ctx.reply(err, { reply_markup: keyboards.cancelPrompt() });
  };

  if (promptKey === "set_name") {
    if (clean.length < 2 || clean.length > 40) {
      return showPromptError("❌ <b>Nome inválido!</b> Digite um nome entre 2 e 40 caracteres.");
    }
    settingsRepo.updateConfig({ storeName: clean, activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_price") {
    const val = parseFloat(clean.replace(",", "."));
    if (isNaN(val) || val < 15.0) {
      return showPromptError(
        "❌ <b>Preço inválido!</b> O valor de venda deve ser no mínimo R$ 15,00 (preço de custo de fábrica)."
      );
    }
    settingsRepo.updateConfig({ salePriceBrl: val, activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_mp") {
    if (targetId) {
      try {
        await ctx.api.editMessageText(ctx.chat!.id, targetId, "⏳ <i>Testando novo token do Mercado Pago...</i>", {
          parse_mode: "HTML",
        });
      } catch {}
    }

    const mp = new MercadoPagoService(clean);
    const test = await mp.testConnection();
    if (!test.ok) {
      return showPromptError(`❌ <b>Token Mercado Pago inválido!</b>\n<i>${test.error}</i>`);
    }
    settingsRepo.updateConfig({ mpAccessToken: clean, activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_api") {
    if (targetId) {
      try {
        await ctx.api.editMessageText(ctx.chat!.id, targetId, "⏳ <i>Testando chave de API com o servidor...</i>", {
          parse_mode: "HTML",
        });
      } catch {}
    }

    const config = settingsRepo.getConfig();
    const client = new MasterApiClient(config.apiBaseUrl, clean);
    const acc = await client.getAccount();
    if (!acc.ok || !acc.user) {
      return showPromptError(`❌ <b>Chave de API inválida!</b>\n<i>${acc.error}</i>`);
    }
    settingsRepo.updateConfig({ resellerApiKey: clean, activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_support") {
    const user = clean.replace(/^@/, "");
    settingsRepo.updateConfig({ supportUsername: user, activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_desc") {
    settingsRepo.set("product_description", clean);
    settingsRepo.updateConfig({ activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_faq") {
    settingsRepo.set("faq_text", clean);
    settingsRepo.updateConfig({ activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_delivery") {
    settingsRepo.set("post_delivery_text", clean);
    settingsRepo.updateConfig({ activePromptKey: "" });
    return showAdminPanel(ctx, true, targetId || undefined);
  }

  if (promptKey === "set_broadcast") {
    settingsRepo.updateConfig({ activePromptKey: "" });
    const users = userRepo.getAll();
    if (users.length === 0) {
      return showPromptError("ℹ️ Nenhum cliente cadastrado no bot ainda.");
    }

    if (targetId) {
      try {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          targetId,
          `⏳ <i>Disparando aviso para ${users.length} usuários...</i>`,
          { parse_mode: "HTML" }
        );
      } catch {}
    }

    let sent = 0;
    let failed = 0;

    for (const u of users) {
      try {
        await ctx.api.sendMessage(
          u.id,
          `📢 <b>COMUNICADO DA LOJA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n${clean}`,
          { parse_mode: "HTML" }
        );
        sent++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    const report =
      `✅ <b>Aviso disparado com sucesso!</b>\n\n` +
      `• Enviados com sucesso: <b>${sent}</b>\n` +
      `• Bloqueios/Falhas: <b>${failed}</b>`;

    if (targetId) {
      try {
        return await ctx.api.editMessageText(ctx.chat!.id, targetId, report, {
          parse_mode: "HTML",
          reply_markup: keyboards.adminBackOnly(),
        });
      } catch {}
    }
    return ctx.reply(report, { parse_mode: "HTML", reply_markup: keyboards.adminBackOnly() });
  }
}

/**
 * Simulação de entrega de teste com custo zero (apresentada no painel sem criar mensagens extras)
 */
export async function handleSimulateDelivery(ctx: Context) {
  if (!isAdmin(ctx)) return;

  const mockId = `SIM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const mockLink = `https://families.google.com/join/demo-invite-${Math.random().toString(36).substring(2, 9)}`;

  const text =
    `🧪 <b>SIMULAÇÃO DE TESTE — CUSTO R$ 0,00</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
    `🆔 <b>Pedido Simulado:</b> <code>${mockId}</code>\n\n` +
    `🔑 <b>Link Exclusivo (Entregue com Spoiler ao Cliente):</b>\n` +
    `<tg-spoiler>${mockLink}</tg-spoiler>\n\n` +
    `<blockquote>📖 <b>Instruções Enviadas ao Cliente:</b>\n` +
    `1. Clique no link para abrir o convite oficial do Google.\n` +
    `2. Aceite com sua conta Google Gmail pessoal.\n` +
    `3. Pronto! 5TB e Gemini PRO ativos por 18 meses!</blockquote>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 <b>Exemplo Financeiro da Venda:</b>\n` +
    `• Recebido no Mercado Pago: <b>R$ 29,90</b>\n` +
    `• Custo da API Mestra: <b>R$ 15,00</b>\n` +
    `• <b>Seu Lucro Líquido: R$ 14,90</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <i>Nenhum centavo foi debitado da sua carteira nesta simulação.</i>`;

  if (ctx.callbackQuery?.message) {
    try {
      return await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboards.adminBackOnly(),
      });
    } catch {}
  }

  return ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboards.adminBackOnly(),
  });
}

/**
 * Autodiagnóstico completo de saúde do bot (editado no painel)
 */
export async function handleDiagnostics(ctx: Context) {
  if (!isAdmin(ctx)) return;

  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText("⏳ <i>Executando autodiagnóstico completo...</i>", {
        parse_mode: "HTML",
      });
    } catch {}
  }

  const config = settingsRepo.getConfig();

  // Teste 1: SQLite
  const userCount = userRepo.count();
  const dbStatus = "🟢 SQLite Conectado (WAL Mode)";

  // Teste 2: Mercado Pago
  let mpResult = "⚪ Não configurado";
  if (config.mpAccessToken) {
    const mp = new MercadoPagoService(config.mpAccessToken);
    const test = await mp.testConnection();
    mpResult = test.ok ? `🟢 Conectado (Titular: ${test.nickname})` : `🔴 Falha: ${test.error}`;
  }

  // Teste 3: Upstream Master API
  let apiResult = "⚪ Não configurado";
  if (config.resellerApiKey) {
    const client = new MasterApiClient(config.apiBaseUrl, config.resellerApiKey);
    const acc = await client.getAccount();
    if (acc.ok && acc.user) {
      apiResult = `🟢 Conectada (Saldo: R$ ${acc.user.balance_brl.toFixed(2)})`;
    } else {
      apiResult = `🔴 Falha: ${acc.error}`;
    }
  }

  const diagText =
    `🩺 <b>RELATÓRIO DE AUTODIAGNÓSTICO</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Telegram Bot:</b> 🟢 Online\n` +
    `• <b>Banco de Dados:</b> ${dbStatus} (${userCount} clientes)\n` +
    `• <b>Mercado Pago:</b> ${mpResult}\n` +
    `• <b>API Fornecedor:</b> ${apiResult}\n` +
    `• <b>Preço de Venda:</b> R$ ${config.salePriceBrl.toFixed(2)}\n` +
    `• <b>Suporte:</b> @${config.supportUsername || "Admin"}\n` +
    `• <b>Carteira:</b> ${config.walletEnabled ? "🟢 Ativada" : "🔴 Desativada"}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Tudo pronto e operando normalmente.`;

  if (ctx.callbackQuery?.message) {
    try {
      return await ctx.editMessageText(diagText, {
        parse_mode: "HTML",
        reply_markup: keyboards.adminBackOnly(),
      });
    } catch {}
  }

  return ctx.reply(diagText, {
    parse_mode: "HTML",
    reply_markup: keyboards.adminBackOnly(),
  });
}

/**
 * Adiciona ou remove saldo manualmente de um cliente (/addsaldo, /remsaldo)
 */
export async function handleAdminAddSaldo(ctx: Context) {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Acesso não autorizado.");

  const text = ctx.message?.text || "";
  const parts = text.split(" ").filter(Boolean);

  // Tenta apagar a mensagem com o comando para manter o chat limpo
  try {
    await ctx.deleteMessage();
  } catch {}

  if (parts.length < 3) {
    return ctx.reply(
      "📌 <b>Uso do comando:</b>\n<code>/addsaldo [ID_USUARIO] [VALOR]</code>\n\n" +
        "<i>Exemplo para adicionar:</i> <code>/addsaldo 123456789 25.00</code>\n" +
        "<i>Exemplo para remover:</i> <code>/remsaldo 123456789 10.00</code>",
      { parse_mode: "HTML", reply_markup: keyboards.adminBackOnly() }
    );
  }

  const targetId = parseInt(parts[1], 10);
  const rawValue = parseFloat(parts[2].replace(",", "."));

  if (isNaN(targetId) || isNaN(rawValue) || rawValue === 0) {
    return ctx.reply("❌ ID de usuário ou valor inválido.", { reply_markup: keyboards.adminBackOnly() });
  }

  const isRemoval = text.startsWith("/remsaldo") || rawValue < 0;
  const absValue = Math.abs(rawValue);
  const cents = Math.round(absValue * 100);

  if (isRemoval) {
    userRepo.debitBalance(targetId, cents);
  } else {
    userRepo.addBalance(targetId, cents);
  }

  const currentBal = (userRepo.getBalance(targetId) / 100).toFixed(2).replace(".", ",");
  const actionLabel = isRemoval ? "removido" : "adicionado";

  // Notifica o cliente se possível
  try {
    const notifyClientText = isRemoval
      ? `ℹ️ <b>Seu saldo foi ajustado pelo administrador:</b> -R$ ${absValue.toFixed(2).replace(".", ",")}\n💳 Saldo Atual: <b>R$ ${currentBal}</b>`
      : `🎉 <b>Você recebeu uma recarga de saldo do administrador:</b> +R$ ${absValue.toFixed(2).replace(".", ",")}\n💳 Saldo Atual: <b>R$ ${currentBal}</b>`;
    await ctx.api.sendMessage(targetId, notifyClientText, { parse_mode: "HTML" });
  } catch {}

  return ctx.reply(
    `✅ <b>Saldo ${actionLabel} com sucesso!</b>\n\n` +
      `👤 <b>Usuário:</b> <code>${targetId}</code>\n` +
      `💵 <b>Valor:</b> R$ ${absValue.toFixed(2).replace(".", ",")}\n` +
      `💳 <b>Novo Saldo Atual:</b> R$ ${currentBal}`,
    { parse_mode: "HTML", reply_markup: keyboards.adminBackOnly() }
  );
}
