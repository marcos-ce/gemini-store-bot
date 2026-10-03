import { Context, InputFile } from "grammy";
import { env } from "../../config/env.js";
import { settingsRepo, orderRepo, userRepo, depositRepo } from "../../db/database.js";
import { MasterApiClient } from "../../services/apiClient.js";
import { MercadoPagoService } from "../../services/mercadopago.js";
import { keyboards } from "../keyboards.js";
import { startWizard } from "./wizard.js";

// Rastreamento de polling em memória para evitar loops duplicados
const activePollingMap = new Set<string>();

/**
 * Helper para navegação limpa: edita a mensagem existente se foi acionada por botão inline,
 * ou envia nova mensagem se for comando inicial (/start) ou mensagem incompatível.
 */
export async function editOrReply(
  ctx: Context,
  text: string,
  options: { parse_mode?: "HTML" | "Markdown" | "MarkdownV2"; reply_markup?: any }
) {
  if (ctx.callbackQuery?.message) {
    try {
      // Se a mensagem anterior é texto, edita no mesmo lugar
      if (ctx.callbackQuery.message.text) {
        return await ctx.editMessageText(text, options);
      }
      // Se for mídia (ex: foto de QR Code anterior), apaga a mídia para limpar o chat
      try {
        await ctx.deleteMessage();
      } catch {}
      return await ctx.reply(text, options);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      // Se o usuário clicou no mesmo botão e o conteúdo não mudou, apenas responde silenciosamente
      if (errMsg.includes("message is not modified")) {
        try {
          await ctx.answerCallbackQuery();
        } catch {}
        return;
      }
      // Se a mensagem original foi apagada ou expirou, envia um novo menu limpo
      try {
        return await ctx.reply(text, options);
      } catch {}
    }
  }
  return await ctx.reply(text, options);
}

/**
 * Boas-vindas para clientes (/start)
 */
export async function handleCustomerStart(ctx: Context) {
  if (!ctx.from) return;

  // Registra usuário no banco
  userRepo.touch(ctx.from.id, ctx.from.username, ctx.from.first_name);

  const config = settingsRepo.getConfig();

  // Se for o dono do bot e o bot ainda não estiver configurado, inicia o assistente
  if (ctx.from.id === env.ADMIN_ID && !config.isConfigured) {
    return startWizard(ctx);
  }

  const priceFormatted = config.salePriceBrl.toFixed(2).replace(".", ",");

  const defaultDesc =
    `<blockquote>` +
    `✅ <b>5.000 GB (5TB)</b> de espaço para Google Drive, Fotos e Gmail\n` +
    `✅ <b>IA Gemini 1.5 PRO</b> desbloqueada e ilimitada\n` +
    `✅ Ativação direta na <b>sua própria conta Google</b>\n` +
    `✅ Não precisa de senha (apenas convite oficial seguro)\n` +
    `✅ Duração de <b>18 Meses</b> garantidos\n` +
    `⚡ <b>Entrega imediata e automática via PIX</b>` +
    `</blockquote>`;

  const customDesc = settingsRepo.get("product_description", defaultDesc);

  const welcomeText =
    `🏪 <b>${config.storeName.toUpperCase()}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⭐ <b>GOOGLE 5TB + GEMINI PRO (18 MESES)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${customDesc}\n\n` +
    `💵 <b>Valor:</b> Apenas <b>R$ ${priceFormatted}</b> (Pagamento único)\n\n` +
    `Clique no botão abaixo para garantir o seu acesso com entrega instantânea:`;

  return editOrReply(ctx, welcomeText, {
    parse_mode: "HTML",
    reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
  });
}

/**
 * FAQ e Dúvidas Frequentes
 */
export async function handleCustomerFaq(ctx: Context) {
  const config = settingsRepo.getConfig();
  const defaultFaq =
    `❓ <b>COMO FUNCIONA E DÚVIDAS FREQUENTES</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔹 <b>Preciso informar minha senha?</b>\n` +
    `Não! Sob hipótese alguma solicitamos sua senha. Você recebe um link oficial de ativação da família Google One diretamente no seu Telegram.\n\n` +
    `🔹 <b>Meus arquivos atuais continuam seguros?</b>\n` +
    `Sim! Seus arquivos, e-mails e fotos são 100% privados e ninguém da família tem acesso a eles.\n\n` +
    `🔹 <b>A entrega é imediata?</b>\n` +
    `Sim! Assim que o PIX for pago, nosso sistema valida automaticamente em menos de 3 segundos e entrega seu link aqui na conversa.\n\n` +
    `🔹 <b>Precisa de suporte?</b>\n` +
    `Fale diretamente com nosso atendimento: @${config.supportUsername || "Admin"}`;

  const faqText = settingsRepo.get("faq_text", defaultFaq);

  return editOrReply(ctx, faqText, {
    parse_mode: "HTML",
    reply_markup: keyboards.faqMenu(),
  });
}

/**
 * Visualização da Carteira do Cliente (/carteira)
 */
export async function handleWallet(ctx: Context) {
  if (!ctx.from) return;
  const config = settingsRepo.getConfig();

  if (!config.walletEnabled) {
    return editOrReply(ctx, "ℹ️ O sistema de carteira está desativado nesta loja.", {
      reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, false),
    });
  }

  const balCents = userRepo.getBalance(ctx.from.id);
  const balBrl = balCents / 100;
  const balFormatted = balBrl.toFixed(2).replace(".", ",");

  const text =
    `💰 <b>CARTEIRA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Cliente:</b> @${ctx.from.username || ctx.from.first_name}\n` +
    `💳 <b>Saldo Atual: R$ ${balFormatted}</b>\n\n` +
    `<blockquote>` +
    `💡 <b>Vantagens de ter Saldo:</b>\n` +
    `• Compre produtos instantaneamente em 1 clique.\n` +
    `• Não precisa abrir o app do banco a cada compra.\n` +
    `• Seu saldo nunca expira e fica seguro na sua conta.` +
    `</blockquote>\n\n` +
    `Escolha um valor abaixo para recarregar via PIX automático:`;

  return editOrReply(ctx, text, {
    parse_mode: "HTML",
    reply_markup: keyboards.walletMenu(balBrl),
  });
}

/**
 * Criação de PIX para Recarga de Carteira
 */
export async function handleDepositSelect(ctx: Context, amountBrl: number) {
  if (!ctx.from) return;
  const config = settingsRepo.getConfig();

  if (!config.mpAccessToken) {
    return ctx.reply("⚠️ Sistema de recarga em rápida manutenção.");
  }

  // Se veio de um clique em botão, apaga a mensagem do menu anterior para não deixar lixo
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.deleteMessage();
    } catch {}
  }

  const waitMsg = await ctx.reply("⏳ <i>Gerando PIX de recarga...</i>", { parse_mode: "HTML" });

  const depId = `DEP-${Date.now().toString(36).toUpperCase()}`;
  const mp = new MercadoPagoService(config.mpAccessToken);

  const pix = await mp.createPix({
    amountBrl,
    description: `${config.storeName} - Recarga de Saldo R$ ${amountBrl.toFixed(2)}`,
    externalReference: depId,
    payerEmail: `dep_${ctx.from.id}@gmail.com`,
  });

  if (!pix.ok || !pix.payment) {
    return ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Falha ao gerar PIX: ${pix.error}`);
  }

  const payment = pix.payment;
  depositRepo.create({
    id: depId,
    userId: ctx.from.id,
    amountCents: Math.round(amountBrl * 100),
    mpPaymentId: payment.id,
  });

  try {
    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);
  } catch {}

  const formattedAmount = amountBrl.toFixed(2).replace(".", ",");
  const captionText =
    `💰 <b>RECARGA DE CARTEIRA VIA PIX</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 <b>Valor da Recarga:</b> R$ ${formattedAmount}\n` +
    `🆔 <b>ID da Recarga:</b> <code>${depId}</code>\n\n` +
    `<blockquote>` +
    `📱 <b>Como Pagar:</b>\n` +
    `1. Copie o código PIX abaixo.\n` +
    `2. Pague no app do seu banco (PIX Copia e Cola).\n` +
    `3. Seu saldo será creditado automaticamente na sua carteira!` +
    `</blockquote>\n\n` +
    `🔑 <b>Código PIX:</b>\n` +
    `<code>${payment.qrCode}</code>\n\n` +
    `⏳ <i>Aguardando pagamento do banco...</i>`;

  let sentMessageId: number;
  if (payment.qrCodeBuffer) {
    const photo = await ctx.replyWithPhoto(new InputFile(payment.qrCodeBuffer, "dep-qrcode.png"), {
      caption: captionText,
      parse_mode: "HTML",
      reply_markup: keyboards.depositCheckout(payment.qrCode, depId),
    });
    sentMessageId = photo.message_id;
  } else {
    const msg = await ctx.reply(captionText, {
      parse_mode: "HTML",
      reply_markup: keyboards.depositCheckout(payment.qrCode, depId),
    });
    sentMessageId = msg.message_id;
  }

  startDepositPolling(ctx, depId, payment.id, sentMessageId);
}

/**
 * Loop de Polling para Recarga de Saldo
 */
function startDepositPolling(ctx: Context, depId: string, mpPaymentId: string, messageId: number) {
  if (activePollingMap.has(depId)) return;
  activePollingMap.add(depId);

  const startTime = Date.now();
  const maxDurationMs = 15 * 60 * 1000;

  const interval = setInterval(async () => {
    if (Date.now() - startTime > maxDurationMs) {
      clearInterval(interval);
      activePollingMap.delete(depId);
      return;
    }

    const config = settingsRepo.getConfig();
    const mp = new MercadoPagoService(config.mpAccessToken);
    const status = await mp.getPaymentStatus(mpPaymentId);

    if (status.approved) {
      clearInterval(interval);
      activePollingMap.delete(depId);
      await processSuccessfulDeposit(ctx, depId, messageId);
    }
  }, 3500);
}

/**
 * Credita o saldo na carteira e notifica
 */
async function processSuccessfulDeposit(ctx: Context, depId: string, messageId?: number) {
  const dep = depositRepo.getById(depId);
  if (!dep || dep.status === "approved") return;

  const wasMarked = depositRepo.markApproved(depId);
  if (!wasMarked) return; // Já foi creditado por outro processo

  const newBalCents = userRepo.addBalance(dep.user_id, dep.amount_cents);
  const newBalBrl = (newBalCents / 100).toFixed(2).replace(".", ",");
  const depBrl = (dep.amount_cents / 100).toFixed(2).replace(".", ",");

  // Apaga a foto com o QR Code antigo para não poluir o histórico
  if (messageId) {
    try {
      await ctx.api.deleteMessage(dep.user_id, messageId);
    } catch {}
  }

  // Notifica o cliente
  try {
    await ctx.api.sendMessage(
      dep.user_id,
      `🎉 <b>RECARGA CONFIRMADA COM SUCESSO!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💵 <b>Valor Creditado:</b> R$ ${depBrl}\n` +
        `💳 <b>Seu Novo Saldo: R$ ${newBalBrl}</b>\n\n` +
        `👉 <i>Você já pode comprar seus produtos com 1 clique usando seu saldo!</i>`,
      {
        parse_mode: "HTML",
        reply_markup: keyboards.customerMain(
          settingsRepo.getConfig().salePriceBrl,
          settingsRepo.getConfig().supportUsername,
          true
        ),
      }
    );
  } catch {}

  // Notifica o dono da loja
  try {
    await ctx.api.sendMessage(
      env.ADMIN_ID,
      `💰 <b>NOVA RECARGA DE SALDO RECEBIDA!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>Cliente:</b> (ID: <code>${dep.user_id}</code>)\n` +
        `💵 <b>Valor Recebido no Mercado Pago:</b> <code>R$ ${depBrl}</code>\n` +
        `🆔 <b>ID Recarga:</b> <code>${depId}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
      { parse_mode: "HTML" }
    );
  } catch {}
}

/**
 * Inicia o Checkout do Produto (Verifica se cliente tem saldo para oferecer 1-Clique)
 */
export async function handleBuyNow(ctx: Context) {
  if (!ctx.from) return;

  const config = settingsRepo.getConfig();

  // 1. Verificação se a loja está configurada
  if (!config.isConfigured || !config.mpAccessToken || !config.resellerApiKey) {
    if (ctx.from.id === env.ADMIN_ID) {
      return ctx.reply(
        "⚠️ <b>Loja não configurada!</b> Digite <code>/admin</code> para conectar seu Mercado Pago e Chave de API.",
        { parse_mode: "HTML" }
      );
    }
    return ctx.reply("⚠️ Loja em rápida manutenção. Por favor, tente novamente em instantes.");
  }

  // 2. Se a carteira estiver ativa e o cliente tiver saldo, oferece escolha
  if (config.walletEnabled) {
    const balCents = userRepo.getBalance(ctx.from.id);
    const balBrl = balCents / 100;

    if (balBrl >= config.salePriceBrl) {
      const priceFormatted = config.salePriceBrl.toFixed(2).replace(".", ",");
      const balFormatted = balBrl.toFixed(2).replace(".", ",");

      return editOrReply(
        ctx,
        `💳 <b>COMO DESEJA CONCLUIR SEU PEDIDO?</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📦 <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
          `💵 <b>Valor:</b> R$ ${priceFormatted}\n\n` +
          `💰 <b>Seu Saldo em Carteira:</b> R$ ${balFormatted}\n\n` +
          `Escolha a forma de pagamento:`,
        {
          parse_mode: "HTML",
          reply_markup: keyboards.checkoutOptions(config.salePriceBrl, balBrl),
        }
      );
    }
  }

  // Se não tiver saldo suficiente, vai direto para o PIX do produto
  return executeDirectPixCheckout(ctx);
}

/**
 * Compra com 1 Clique usando o Saldo da Carteira
 */
export async function handleBuyWithWallet(ctx: Context) {
  if (!ctx.from) return;

  const config = settingsRepo.getConfig();
  const priceCents = Math.round(config.salePriceBrl * 100);

  // 1. Débito atômico na carteira local
  const debited = userRepo.debitBalance(ctx.from.id, priceCents);
  if (!debited) {
    if (ctx.callbackQuery) {
      return ctx.answerCallbackQuery({
        text: "❌ Saldo insuficiente na carteira para concluir esta compra.",
        show_alert: true,
      });
    }
    return ctx.reply("❌ Saldo insuficiente na carteira para concluir esta compra.");
  }

  let targetMsgId: number | undefined;
  if (ctx.callbackQuery?.message?.text) {
    try {
      await ctx.editMessageText("⏳ <i>Emitindo seu produto imediatamente via API...</i>", {
        parse_mode: "HTML",
      });
      targetMsgId = ctx.callbackQuery.message.message_id;
    } catch {}
  }

  if (!targetMsgId) {
    const waitMsg = await ctx.reply("⏳ <i>Emitindo seu produto imediatamente via API...</i>", {
      parse_mode: "HTML",
    });
    targetMsgId = waitMsg.message_id;
  }

  const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;

  orderRepo.create({
    id: orderId,
    userId: ctx.from.id,
    userName: ctx.from.username || ctx.from.first_name,
    productName: "Google 5TB - Gemini PRO 18 MESES",
    priceCents,
    costCents: 1500,
  });

  const client = new MasterApiClient(config.apiBaseUrl, config.resellerApiKey);
  const deliveryResult = await client.createOrder(`WALLET-${orderId}`, "gemini-link-pro-18months");

  if (!deliveryResult.ok || !deliveryResult.order?.delivered_value) {
    // Estorna saldo do cliente na hora em caso de falha de fornecedor
    userRepo.addBalance(ctx.from.id, priceCents);
    orderRepo.markFailed(orderId, deliveryResult.error || "Erro de emissão");

    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        targetMsgId,
        `⚠️ <b>Falha temporária no fornecimento.</b>\n` +
          `O valor foi <b>estornado integralmente</b> para sua carteira.\n` +
          `Erro: ${deliveryResult.error || "Tente novamente em instantes."}`,
        {
          parse_mode: "HTML",
          reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
        }
      );
    } catch {}

    // Alerta o dono da loja
    try {
      await ctx.api.sendMessage(
        env.ADMIN_ID,
        `🚨 <b>FALHA NA EMISSÃO VIA CARTEIRA:</b>\nPedido: ${orderId}\nErro: ${deliveryResult.error}`,
        { parse_mode: "HTML" }
      );
    } catch {}

    return;
  }

  const link = deliveryResult.order.delivered_value;
  orderRepo.markDelivered(orderId, link);

  const defaultInstructions =
    `<blockquote>` +
    `📖 <b>Como Ativar seu Acesso:</b>\n` +
    `1. Clique no link acima para abrir o convite oficial do Google.\n` +
    `2. Escolha sua conta Gmail pessoal e confirme o aceite.\n` +
    `3. Pronto! Seus 5TB e Gemini PRO estarão ativos por 18 meses!` +
    `</blockquote>`;

  const customInstructions = settingsRepo.get("post_delivery_text", defaultInstructions);

  const successText =
    `🎉 <b>COMPRA CONCLUÍDA VIA CARTEIRA!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
    `🆔 <b>Pedido:</b> <code>${orderId}</code>\n\n` +
    `🔑 <b>SEU LINK DE ATIVAÇÃO EXCLUSIVO:</b>\n` +
    `<tg-spoiler>${link}</tg-spoiler>\n\n` +
    `${customInstructions}\n\n` +
    `💬 Precisa de ajuda? Nosso suporte está à disposição: @${config.supportUsername || "Admin"}`;

  try {
    await ctx.api.editMessageText(ctx.chat!.id, targetMsgId, successText, {
      parse_mode: "HTML",
      reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
    });
  } catch {
    await ctx.reply(successText, {
      parse_mode: "HTML",
      reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
    });
  }

  // Notificação para o dono
  const profit = config.salePriceBrl - 15.0;
  try {
    await ctx.api.sendMessage(
      env.ADMIN_ID,
      `🎉 <b>NOVA VENDA CONCLUÍDA (VIA SALDO DE CARTEIRA)!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>Cliente:</b> @${ctx.from.username || ctx.from.first_name} (ID: <code>${ctx.from.id}</code>)\n` +
        `💵 <b>Valor Debitado do Cliente:</b> <code>R$ ${config.salePriceBrl.toFixed(2)}</code>\n` +
        `📉 <b>Custo API:</b> <code>R$ 15,00</code>\n` +
        `💰 <b>SEU LUCRO LÍQUIDO: R$ ${profit.toFixed(2)}</b>\n` +
        `🆔 <b>Pedido:</b> <code>${orderId}</code>\n\n` +
        `🔑 <b>Entregue:</b>\n<code>${link}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
      { parse_mode: "HTML" }
    );
  } catch {}
}

/**
 * Executa o Checkout PIX Direto
 */
export async function executeDirectPixCheckout(ctx: Context) {
  if (!ctx.from) return;

  const config = settingsRepo.getConfig();

  // Apaga menu anterior para exibir apenas a tela de pagamento limpa
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.deleteMessage();
    } catch {}
  }

  const waitMsg = await ctx.reply("⏳ <i>Gerando seu QR Code PIX exclusivo...</i>", {
    parse_mode: "HTML",
  });

  // Pre-flight check de saldo na API do fornecedor
  const client = new MasterApiClient(config.apiBaseUrl, config.resellerApiKey);
  const accountCheck = await client.getAccount();

  if (!accountCheck.ok || !accountCheck.user || accountCheck.user.balance_brl < 15.0) {
    try {
      await ctx.api.sendMessage(
        env.ADMIN_ID,
        `⚠️ <b>ALERTA DE VENDAS — CARTEIRA SEM SALDO!</b>\n\n` +
          `O cliente @${ctx.from.username || ctx.from.first_name} tentou comprar, mas sua carteira de API está sem saldo (Saldo atual: R$ ${accountCheck.user?.balance_brl.toFixed(2) || "0,00"}).\n\n` +
          `👉 <i>Recarregue sua carteira de revenda agora para não perder essa venda!</i>`,
        { parse_mode: "HTML" }
      );
    } catch {}

    return ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      "⚠️ <b>Produto em reposição momentânea de estoque.</b>\n\n" +
        "Nossa equipe já foi notificada e em poucos instantes o estoque estará renovado. Tente novamente em alguns minutos!",
      {
        parse_mode: "HTML",
        reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
      }
    );
  }

  const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
  const mp = new MercadoPagoService(config.mpAccessToken);

  const pixResult = await mp.createPix({
    amountBrl: config.salePriceBrl,
    description: `${config.storeName} - Gemini Pro 18M`,
    externalReference: orderId,
    payerEmail: `cliente_${ctx.from.id}@gmail.com`,
  });

  if (!pixResult.ok || !pixResult.payment) {
    return ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ Falha ao emitir PIX: ${pixResult.error || "Tente novamente mais tarde."}`,
      {
        reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
      }
    );
  }

  const payment = pixResult.payment;

  orderRepo.create({
    id: orderId,
    userId: ctx.from.id,
    userName: ctx.from.username || ctx.from.first_name,
    mpPaymentId: payment.id,
    productName: "Google 5TB - Gemini PRO 18 MESES",
    priceCents: Math.round(config.salePriceBrl * 100),
    costCents: 1500,
  });

  try {
    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);
  } catch {}

  const formattedPrice = config.salePriceBrl.toFixed(2).replace(".", ",");
  const captionText =
    `💳 <b>PAGAMENTO PIX — ENTREGA AUTOMÁTICA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
    `💵 <b>Valor:</b> R$ ${formattedPrice}\n` +
    `🆔 <b>Pedido:</b> <code>${orderId}</code>\n\n` +
    `<blockquote>` +
    `📱 <b>Como Pagar:</b>\n` +
    `1. Copie o código PIX abaixo.\n` +
    `2. Abra o app do seu banco e escolha <b>PIX Copia e Cola</b>.\n` +
    `3. Conclua o pagamento e o link será entregue aqui na hora!` +
    `</blockquote>\n\n` +
    `🔑 <b>Código PIX Copia e Cola:</b>\n` +
    `<code>${payment.qrCode}</code>\n\n` +
    `⏳ <i>Aguardando confirmação do banco (expira em 15 minutos)...</i>`;

  let sentMessageId: number;
  if (payment.qrCodeBuffer) {
    const photoMsg = await ctx.replyWithPhoto(new InputFile(payment.qrCodeBuffer, "pix-qrcode.png"), {
      caption: captionText,
      parse_mode: "HTML",
      reply_markup: keyboards.pixCheckout(payment.qrCode, orderId),
    });
    sentMessageId = photoMsg.message_id;
  } else {
    const textMsg = await ctx.reply(captionText, {
      parse_mode: "HTML",
      reply_markup: keyboards.pixCheckout(payment.qrCode, orderId),
    });
    sentMessageId = textMsg.message_id;
  }

  startPaymentPolling(ctx, orderId, payment.id, sentMessageId);
}

/**
 * Loop de verificação de pagamento automático em background
 */
function startPaymentPolling(ctx: Context, orderId: string, mpPaymentId: string, messageId: number) {
  if (activePollingMap.has(orderId)) return;
  activePollingMap.add(orderId);

  const startTime = Date.now();
  const maxDurationMs = 15 * 60 * 1000;
  const intervalMs = 3500;

  const interval = setInterval(async () => {
    if (Date.now() - startTime > maxDurationMs) {
      clearInterval(interval);
      activePollingMap.delete(orderId);
      return;
    }

    const config = settingsRepo.getConfig();
    const mp = new MercadoPagoService(config.mpAccessToken);
    const status = await mp.getPaymentStatus(mpPaymentId);

    if (status.approved) {
      clearInterval(interval);
      activePollingMap.delete(orderId);
      await processSuccessfulDelivery(ctx, orderId, mpPaymentId, messageId);
    }
  }, intervalMs);
}

/**
 * Processa a entrega do produto via API mestra e notifica o cliente e o dono
 */
async function processSuccessfulDelivery(
  ctx: Context,
  orderId: string,
  mpPaymentId: string,
  messageId?: number
) {
  const order = orderRepo.getById(orderId);
  if (!order || order.status === "delivered") return;

  const config = settingsRepo.getConfig();
  const client = new MasterApiClient(config.apiBaseUrl, config.resellerApiKey);

  const deliveryResult = await client.createOrder(mpPaymentId, "gemini-link-pro-18months");

  if (!deliveryResult.ok || !deliveryResult.order?.delivered_value) {
    orderRepo.markFailed(orderId, deliveryResult.error || "Erro de emissão");

    try {
      await ctx.api.sendMessage(
        env.ADMIN_ID,
        `🚨 <b>FALHA NA ENTREGA AUTOMÁTICA!</b>\n\n` +
          `O pedido <code>${orderId}</code> foi pago no Mercado Pago, mas a API mestra retornou erro:\n` +
          `<i>${deliveryResult.error || "Erro desconhecido"}</i>\n\n` +
          `Verifique seu saldo de API ou entregue manualmente para o cliente (ID: <code>${order.user_id}</code>).`,
        { parse_mode: "HTML" }
      );
    } catch {}

    return ctx.api.sendMessage(
      order.user_id,
      `✅ <b>Seu pagamento foi confirmado com sucesso!</b>\n\n` +
        `Nosso sistema está finalizando os detalhes do seu acesso. Caso não receba em até 5 minutos, fale com nosso suporte: @${config.supportUsername || "Admin"}\n` +
        `🆔 Pedido: <code>${orderId}</code>`,
      {
        parse_mode: "HTML",
        reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
      }
    );
  }

  const link = deliveryResult.order.delivered_value;
  orderRepo.markDelivered(orderId, link);

  const defaultInstructions =
    `<blockquote>` +
    `📖 <b>Como Ativar seu Acesso:</b>\n` +
    `1. Clique no link acima para abrir o convite oficial do Google.\n` +
    `2. Escolha sua conta Gmail pessoal e confirme o aceite.\n` +
    `3. Pronto! Seus 5TB e Gemini PRO estarão ativos por 18 meses!` +
    `</blockquote>`;

  const customInstructions = settingsRepo.get("post_delivery_text", defaultInstructions);

  const successText =
    `🎉 <b>PAGAMENTO CONFIRMADO COM SUCESSO!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
    `🆔 <b>Pedido:</b> <code>${orderId}</code>\n\n` +
    `🔑 <b>SEU LINK DE ATIVAÇÃO EXCLUSIVO:</b>\n` +
    `<tg-spoiler>${link}</tg-spoiler>\n\n` +
    `${customInstructions}\n\n` +
    `💬 Precisa de ajuda? Nosso suporte está à disposição: @${config.supportUsername || "Admin"}`;

  // Apaga a mensagem com a foto do QR Code que já foi paga para deixar o chat 100% limpo
  if (messageId) {
    try {
      await ctx.api.deleteMessage(order.user_id, messageId);
    } catch {}
  }

  try {
    await ctx.api.sendMessage(order.user_id, successText, {
      parse_mode: "HTML",
      reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername, config.walletEnabled),
    });
  } catch {}

  const profit = config.salePriceBrl - 15.0;
  try {
    await ctx.api.sendMessage(
      env.ADMIN_ID,
      `🎉 <b>NOVA VENDA CONCLUÍDA NO SEU BOT!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>Cliente:</b> @${order.user_name || "Cliente"} (ID: <code>${order.user_id}</code>)\n` +
        `💵 <b>Recebido no Mercado Pago:</b> <code>R$ ${config.salePriceBrl.toFixed(2)}</code>\n` +
        `📉 <b>Custo API:</b> <code>R$ 15,00</code>\n` +
        `💰 <b>SEU LUCRO LÍQUIDO: R$ ${profit.toFixed(2)}</b>\n` +
        `🆔 <b>Pedido:</b> <code>${orderId}</code>\n\n` +
        `🔑 <b>Entregue:</b>\n<code>${link}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
      { parse_mode: "HTML" }
    );
  } catch {}
}

/**
 * Trata o botão "Já paguei / Verificar" do PIX de Pedido
 */
export async function handleCheckPix(ctx: Context, orderId: string) {
  const order = orderRepo.getById(orderId);
  if (!order) return ctx.answerCallbackQuery({ text: "Pedido não encontrado." });

  if (order.status === "delivered") {
    return ctx.answerCallbackQuery({ text: "Este pedido já foi entregue! Confira a conversa." });
  }

  if (!order.mp_payment_id) {
    return ctx.answerCallbackQuery({ text: "Aguarde alguns segundos e tente novamente." });
  }

  const config = settingsRepo.getConfig();
  const mp = new MercadoPagoService(config.mpAccessToken);
  const status = await mp.getPaymentStatus(order.mp_payment_id);

  if (status.approved) {
    await ctx.answerCallbackQuery({ text: "✅ Pagamento aprovado! Entregando..." });
    const msgId = ctx.callbackQuery?.message?.message_id;
    return processSuccessfulDelivery(ctx, orderId, order.mp_payment_id, msgId);
  }

  return ctx.answerCallbackQuery({
    text: "⏳ Pagamento ainda não detectado pelo banco. Conclua o PIX e aguarde alguns segundos!",
    show_alert: true,
  });
}

/**
 * Trata o botão "Já paguei / Verificar" do PIX de Recarga
 */
export async function handleCheckDeposit(ctx: Context, depId: string) {
  const dep = depositRepo.getById(depId);
  if (!dep) return ctx.answerCallbackQuery({ text: "Recarga não encontrada." });

  if (dep.status === "approved") {
    return ctx.answerCallbackQuery({ text: "Esta recarga já foi creditada na sua carteira!" });
  }

  if (!dep.mp_payment_id) {
    return ctx.answerCallbackQuery({ text: "Aguarde alguns segundos e tente novamente." });
  }

  const config = settingsRepo.getConfig();
  const mp = new MercadoPagoService(config.mpAccessToken);
  const status = await mp.getPaymentStatus(dep.mp_payment_id);

  if (status.approved) {
    await ctx.answerCallbackQuery({ text: "✅ Pagamento aprovado! Creditando saldo..." });
    const msgId = ctx.callbackQuery?.message?.message_id;
    return processSuccessfulDeposit(ctx, depId, msgId);
  }

  return ctx.answerCallbackQuery({
    text: "⏳ Pagamento ainda não detectado pelo banco. Conclua o PIX e aguarde alguns segundos!",
    show_alert: true,
  });
}

/**
 * Cancela um pedido de PIX pendente
 */
export async function handleCancelPix(ctx: Context, orderId: string) {
  activePollingMap.delete(orderId);
  try {
    await ctx.deleteMessage();
  } catch {}
  return handleCustomerStart(ctx);
}

/**
 * Cancela uma recarga de PIX pendente
 */
export async function handleCancelDeposit(ctx: Context, depId: string) {
  activePollingMap.delete(depId);
  try {
    await ctx.deleteMessage();
  } catch {}
  return handleWallet(ctx);
}
