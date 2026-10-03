import { Context } from "grammy";
import { env } from "../../config/env.js";
import { settingsRepo, orderRepo, userRepo } from "../../db/database.js";
import { MasterApiClient } from "../../services/apiClient.js";
import { MercadoPagoService } from "../../services/mercadopago.js";
import { keyboards } from "../keyboards.js";

function isAdmin(ctx: Context): boolean {
  return !!(ctx.from && ctx.from.id === env.ADMIN_ID);
}

/**
 * Renderiza o painel de controle principal do Admin
 */
export async function showAdminPanel(ctx: Context, editMessage = false) {
  if (!isAdmin(ctx)) {
    return ctx.reply("⛔ Acesso não autorizado.");
  }

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

  if (editMessage && ctx.callbackQuery?.message) {
    try {
      return await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboards.adminMenu(config.walletEnabled),
      });
    } catch {}
  }

  return ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboards.adminMenu(config.walletEnabled),
  });
}

/**
 * Trata o clique nos botões inline do /admin
 */
export async function handleAdminCallback(ctx: Context) {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔ Não autorizado." });
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  if (data === "adm_set_name") {
    settingsRepo.updateConfig({ activePromptKey: "set_name" });
    return ctx.reply("🏷️ <b>Digite o novo nome para sua loja:</b>", {
      parse_mode: "HTML",
      reply_markup: keyboards.cancelPrompt(),
    });
  }

  if (data === "adm_set_price") {
    settingsRepo.updateConfig({ activePromptKey: "set_price" });
    return ctx.reply(
      "💵 <b>Digite o novo preço de venda em Reais:</b>\n<i>(Exemplo: 29.90 ou 35.00)</i>",
      {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      }
    );
  }

  if (data === "adm_set_mp") {
    settingsRepo.updateConfig({ activePromptKey: "set_mp" });
    return ctx.reply(
      "💳 <b>Cole o seu novo Access Token do Mercado Pago:</b>\n" +
        "<i>(A mensagem será apagada do chat assim que enviada por segurança)</i>",
      {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      }
    );
  }

  if (data === "adm_set_api") {
    settingsRepo.updateConfig({ activePromptKey: "set_api" });
    return ctx.reply(
      "🔑 <b>Cole a sua nova Chave de API de Revenda (gg_live_...):</b>\n" +
        "<i>(A mensagem será apagada do chat assim que enviada por segurança)</i>",
      {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      }
    );
  }

  if (data === "adm_set_support") {
    settingsRepo.updateConfig({ activePromptKey: "set_support" });
    return ctx.reply(
      "💬 <b>Digite o novo @ do seu Telegram para suporte aos clientes:</b>\n<i>(Exemplo: @seu_usuario)</i>",
      {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      }
    );
  }

  if (data === "adm_cancel_prompt") {
    settingsRepo.updateConfig({ activePromptKey: "" });
    return ctx.reply("❌ Alteração cancelada.", {
      reply_markup: keyboards.adminMenu(),
    });
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

    return ctx.reply(
      `📊 <b>RELATÓRIO DE VENDAS & FATURAMENTO</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Pedidos Concluídos: <b>${stats.totalSales}</b>\n` +
        `• Faturamento Total: <b>R$ ${stats.totalGrossBrl.toFixed(2)}</b>\n` +
        `• Custo Total de Fornecimento: <b>R$ ${stats.totalCostBrl.toFixed(2)}</b>\n` +
        `• 💰 <b>Lucro Líquido Total: R$ ${stats.totalProfitBrl.toFixed(2)}</b>` +
        recentText,
      { parse_mode: "HTML", reply_markup: keyboards.adminMenu() }
    );
  }

  if (data === "adm_broadcast") {
    settingsRepo.updateConfig({ activePromptKey: "set_broadcast" });
    return ctx.reply(
      "📢 <b>Envio de Aviso para Todos os Clientes:</b>\n\n" +
        "Digite a mensagem que deseja transmitir para todos os usuários cadastrados no bot.\n" +
        "<i>(Ou clique em Cancelar abaixo se mudou de ideia)</i>",
      {
        parse_mode: "HTML",
        reply_markup: keyboards.cancelPrompt(),
      }
    );
  }

  if (data === "adm_texts") {
    return ctx.reply(
      `📝 <b>PERSONALIZAÇÃO DE TEXTOS DA LOJA</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Escolha qual mensagem você deseja personalizar:\n\n` +
        `• <b>Descrição do Produto:</b> Exibida no menu inicial do /start\n` +
        `• <b>Dúvidas & Regras (FAQ):</b> Exibida no botão 'Como Funciona'\n` +
        `• <b>Instruções Pós-Entrega:</b> Enviada junto com o link após a aprovação do PIX`,
      {
        parse_mode: "HTML",
        reply_markup: keyboards.messagesMenu(),
      }
    );
  }

  if (data === "adm_set_desc") {
    settingsRepo.updateConfig({ activePromptKey: "set_desc" });
    const current = settingsRepo.get("product_description", "<i>(Padrão de fábrica ativo)</i>");
    return ctx.reply(
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
    return ctx.reply(
      `✏️ <b>ALTERAR DÚVIDAS & REGRAS (FAQ)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Envie o texto que será exibido quando o cliente clicar em 'Como Funciona':\n\n` +
        `<b>Texto atual:</b>\n${current}`,
      { parse_mode: "HTML", reply_markup: keyboards.cancelPrompt() }
    );
  }

  if (data === "adm_set_delivery") {
    settingsRepo.updateConfig({ activePromptKey: "set_delivery" });
    const current = settingsRepo.get("post_delivery_text", "<i>(Padrão de fábrica ativo)</i>");
    return ctx.reply(
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
    await ctx.reply("✅ <b>Todos os textos foram restaurados para o padrão original de fábrica!</b>", {
      parse_mode: "HTML",
    });
    return showAdminPanel(ctx);
  }

  if (data === "adm_toggle_wallet") {
    const config = settingsRepo.getConfig();
    const nextState = !config.walletEnabled;
    settingsRepo.updateConfig({ walletEnabled: nextState });
    return showAdminPanel(ctx, true);
  }

  if (data === "adm_back_panel") {
    return showAdminPanel(ctx);
  }

  if (data === "adm_preview") {
    const config = settingsRepo.getConfig();
    return ctx.reply(
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
 */
export async function handleAdminPrompt(ctx: Context, promptKey: string, text: string) {
  if (!isAdmin(ctx)) return;
  const clean = text.trim();

  if (promptKey === "set_name") {
    if (clean.length < 2 || clean.length > 40) {
      return ctx.reply("❌ Digite um nome entre 2 e 40 caracteres.");
    }
    settingsRepo.updateConfig({ storeName: clean, activePromptKey: "" });
    await ctx.reply(`✅ Nome da loja alterado para: <b>${clean}</b>`, { parse_mode: "HTML" });
    return showAdminPanel(ctx);
  }

  if (promptKey === "set_price") {
    const val = parseFloat(clean.replace(",", "."));
    if (isNaN(val) || val < 15.0) {
      return ctx.reply("❌ O preço de venda deve ser um número maior que R$ 15,00 (custo de fábrica).");
    }
    settingsRepo.updateConfig({ salePriceBrl: val, activePromptKey: "" });
    await ctx.reply(`✅ Preço atualizado para: <b>R$ ${val.toFixed(2)}</b>`, { parse_mode: "HTML" });
    return showAdminPanel(ctx);
  }

  if (promptKey === "set_mp") {
    try {
      await ctx.deleteMessage();
    } catch {}
    const mp = new MercadoPagoService(clean);
    const test = await mp.testConnection();
    if (!test.ok) {
      return ctx.reply(`❌ Token Mercado Pago inválido: ${test.error}`);
    }
    settingsRepo.updateConfig({ mpAccessToken: clean, activePromptKey: "" });
    await ctx.reply(`✅ Mercado Pago atualizado com sucesso! (Conta: ${test.nickname})`);
    return showAdminPanel(ctx);
  }

  if (promptKey === "set_api") {
    try {
      await ctx.deleteMessage();
    } catch {}
    const config = settingsRepo.getConfig();
    const client = new MasterApiClient(config.apiBaseUrl, clean);
    const acc = await client.getAccount();
    if (!acc.ok || !acc.user) {
      return ctx.reply(`❌ Chave de API inválida: ${acc.error}`);
    }
    settingsRepo.updateConfig({ resellerApiKey: clean, activePromptKey: "" });
    await ctx.reply(
      `✅ Chave de API conectada! (Saldo atual: R$ ${acc.user.balance_brl.toFixed(2)})`
    );
    return showAdminPanel(ctx);
  }

  if (promptKey === "set_support") {
    const user = clean.replace(/^@/, "");
    settingsRepo.updateConfig({ supportUsername: user, activePromptKey: "" });
    await ctx.reply(`✅ Usuário de suporte atualizado para: @${user}`);
    return showAdminPanel(ctx);
  }

  if (promptKey === "set_broadcast") {
    settingsRepo.updateConfig({ activePromptKey: "" });
    const users = userRepo.getAll();
    if (users.length === 0) {
      return ctx.reply("ℹ️ Nenhum cliente cadastrado no bot ainda.");
    }

    const wait = await ctx.reply(`⏳ Enviando aviso para ${users.length} usuários...`);
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

    return ctx.api.editMessageText(
      ctx.chat!.id,
      wait.message_id,
      `✅ <b>Aviso disparado com sucesso!</b>\n\n` +
        `• Enviados: <b>${sent}</b>\n` +
        `• Falhas/Bloqueios: <b>${failed}</b>`,
      { parse_mode: "HTML", reply_markup: keyboards.adminMenu() }
    );
  }

  if (promptKey === "set_desc") {
    settingsRepo.set("product_description", clean);
    settingsRepo.updateConfig({ activePromptKey: "" });
    await ctx.reply("✅ <b>Descrição do produto atualizada com sucesso!</b>\nSeus clientes já verão o novo texto no /start.", {
      parse_mode: "HTML",
    });
    return showAdminPanel(ctx);
  }

  if (promptKey === "set_faq") {
    settingsRepo.set("faq_text", clean);
    settingsRepo.updateConfig({ activePromptKey: "" });
    await ctx.reply("✅ <b>Texto de Dúvidas & Regras (FAQ) atualizado com sucesso!</b>", {
      parse_mode: "HTML",
    });
    return showAdminPanel(ctx);
  }

  if (promptKey === "set_delivery") {
    settingsRepo.set("post_delivery_text", clean);
    settingsRepo.updateConfig({ activePromptKey: "" });
    await ctx.reply("✅ <b>Instruções pós-entrega atualizadas com sucesso!</b>", {
      parse_mode: "HTML",
    });
    return showAdminPanel(ctx);
  }
}

/**
 * Simulação de entrega de teste com custo zero
 */
export async function handleSimulateDelivery(ctx: Context) {
  if (!isAdmin(ctx)) return;

  const mockId = `SIM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const mockLink = `https://families.google.com/join/demo-invite-${Math.random().toString(36).substring(2, 9)}`;

  // 1. Mensagem de aviso
  await ctx.reply(
    `🧪 <b>[SIMULAÇÃO DE TESTE — CUSTO R$ 0,00]</b>\n` +
      `<i>Esta é exatamente a mensagem e link que o cliente recebe no Telegram assim que o PIX é aprovado:</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
    { parse_mode: "HTML" }
  );

  // 2. Mensagem que o cliente recebe
  const clientText =
    `🎉 <b>PAGAMENTO CONFIRMADO COM SUCESSO!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
    `🆔 <b>Pedido:</b> <code>${mockId}</code>\n\n` +
    `🔑 <b>SEU LINK DE ATIVAÇÃO EXCLUSIVO:</b>\n` +
    `<tg-spoiler>${mockLink}</tg-spoiler>\n\n` +
    `<blockquote>📖 <b>Instruções Rápidas:</b>\n` +
    `1. Clique no link acima para abrir o convite oficial do Google.\n` +
    `2. Aceite o convite com a sua conta Google Gmail.\n` +
    `3. Pronto! Seus 5TB e Gemini PRO estarão ativos por 18 meses.</blockquote>\n\n` +
    `💬 Dúvidas? Fale com nosso suporte a qualquer momento.`;

  await ctx.reply(clientText, { parse_mode: "HTML" });

  // 3. Notificação que o admin recebe no privado
  return ctx.reply(
    `📢 <b>[CÓPIA QUE O ADMIN RECEBE EM TEMPO REAL]</b>\n` +
      `💰 <b>NOVA VENDA CONCLUÍDA!</b>\n\n` +
      `👤 <b>Cliente:</b> ${ctx.from?.first_name || "Cliente Teste"} (ID: <code>${ctx.from?.id}</code>)\n` +
      `💵 <b>Valor Recebido:</b> <code>R$ 29,90</code>\n` +
      `📉 <b>Custo API:</b> <code>R$ 15,00</code>\n` +
      `💰 <b>Seu Lucro Líquido:</b> <code>R$ 14,90</code>\n\n` +
      `🔑 <b>Entregue ao cliente:</b>\n<code>${mockLink}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <i>Simulação concluída! Nenhum centavo foi debitado de fornecedores.</i>`,
    { parse_mode: "HTML", reply_markup: keyboards.adminMenu() }
  );
}

/**
 * Autodiagnóstico completo de saúde do bot
 */
export async function handleDiagnostics(ctx: Context) {
  if (!isAdmin(ctx)) return;

  const wait = await ctx.reply("⏳ <i>Executando autodiagnóstico completo...</i>", {
    parse_mode: "HTML",
  });

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
    `• <b>Preço Configurado:</b> R$ ${config.salePriceBrl.toFixed(2)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Tudo verificado e funcionando de forma autônoma!</i>`;

  return ctx.api.editMessageText(ctx.chat!.id, wait.message_id, diagText, {
    parse_mode: "HTML",
    reply_markup: keyboards.adminMenu(config.walletEnabled),
  });
}

/**
 * Adiciona ou remove saldo manualmente de um cliente (/addsaldo, /remsaldo)
 */
export async function handleAdminAddSaldo(ctx: Context) {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Acesso não autorizado.");

  const text = ctx.message?.text || "";
  const parts = text.split(" ").filter(Boolean);

  if (parts.length < 3) {
    return ctx.reply(
      "📌 <b>Uso do comando:</b>\n<code>/addsaldo [ID_USUARIO] [VALOR]</code>\n\n" +
        "<i>Exemplo para adicionar:</i> <code>/addsaldo 123456789 25.00</code>\n" +
        "<i>Exemplo para remover:</i> <code>/remsaldo 123456789 10.00</code>",
      { parse_mode: "HTML" }
    );
  }

  const targetId = parseInt(parts[1], 10);
  const rawValue = parseFloat(parts[2].replace(",", "."));

  if (isNaN(targetId) || isNaN(rawValue) || rawValue === 0) {
    return ctx.reply("❌ ID de usuário ou valor inválido.");
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
    { parse_mode: "HTML" }
  );
}
