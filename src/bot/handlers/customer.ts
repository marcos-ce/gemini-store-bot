import { Context, InputFile } from "grammy";
import { env } from "../../config/env.js";
import { settingsRepo, orderRepo, userRepo } from "../../db/database.js";
import { MasterApiClient } from "../../services/apiClient.js";
import { MercadoPagoService } from "../../services/mercadopago.js";
import { keyboards } from "../keyboards.js";
import { startWizard } from "./wizard.js";

// Rastreamento de polling em memória para evitar loops duplicados
const activePollingMap = new Set<string>();

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

  return ctx.reply(welcomeText, {
    parse_mode: "HTML",
    reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername),
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

  return ctx.reply(faqText, {
    parse_mode: "HTML",
    reply_markup: keyboards.customerMain(config.salePriceBrl, config.supportUsername),
  });
}

/**
 * Inicia o Checkout PIX
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

  const waitMsg = await ctx.reply("⏳ <i>Gerando seu QR Code PIX exclusivo...</i>", {
    parse_mode: "HTML",
  });

  // 2. Pre-flight check: Verificar se a API tem saldo antes de cobrar o cliente
  const client = new MasterApiClient(config.apiBaseUrl, config.resellerApiKey);
  const accountCheck = await client.getAccount();

  if (!accountCheck.ok || !accountCheck.user || accountCheck.user.balance_brl < 15.0) {
    // Alerta o dono da loja imediatamente no privado
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
      { parse_mode: "HTML" }
    );
  }

  // 3. Cria a cobrança PIX no Mercado Pago do dono da loja
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
      `❌ Falha ao emitir PIX: ${pixResult.error || "Tente novamente mais tarde."}`
    );
  }

  const payment = pixResult.payment;

  // 4. Salva o pedido no SQLite local
  orderRepo.create({
    id: orderId,
    userId: ctx.from.id,
    userName: ctx.from.username || ctx.from.first_name,
    mpPaymentId: payment.id,
    productName: "Google 5TB - Gemini PRO 18 MESES",
    priceCents: Math.round(config.salePriceBrl * 100),
    costCents: 1500,
  });

  // Apaga a mensagem de "gerando"
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

  // 5. Envia com foto do QR Code se disponível, ou mensagem normal
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

  // 6. Inicia o Polling automático de verificação a cada 3 segundos em background
  startPaymentPolling(ctx, orderId, payment.id, sentMessageId);
}

/**
 * Loop de verificação de pagamento automático em background
 */
function startPaymentPolling(ctx: Context, orderId: string, mpPaymentId: string, messageId: number) {
  if (activePollingMap.has(orderId)) return;
  activePollingMap.add(orderId);

  const startTime = Date.now();
  const maxDurationMs = 15 * 60 * 1000; // 15 minutos
  const intervalMs = 3500;

  const interval = setInterval(async () => {
    // Se passou do tempo de expiração
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

  // 1. Emite o pedido na API mestra (com idempotência via external_id)
  const deliveryResult = await client.createOrder(mpPaymentId, "gemini-link-pro-18months");

  if (!deliveryResult.ok || !deliveryResult.order?.delivered_value) {
    orderRepo.markFailed(orderId, deliveryResult.error || "Erro de emissão");

    // Alerta o dono da loja imediatamente
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
      { parse_mode: "HTML" }
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

  // 2. Mensagem formatada com spoiler para o cliente
  const successText =
    `🎉 <b>PAGAMENTO CONFIRMADO COM SUCESSO!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produto:</b> Google 5TB - Gemini PRO 18 MESES\n` +
    `🆔 <b>Pedido:</b> <code>${orderId}</code>\n\n` +
    `🔑 <b>SEU LINK DE ATIVAÇÃO EXCLUSIVO:</b>\n` +
    `<tg-spoiler>${link}</tg-spoiler>\n\n` +
    `${customInstructions}\n\n` +
    `💬 Precisa de ajuda? Nosso suporte está à disposição: @${config.supportUsername || "Admin"}`;

  try {
    await ctx.api.sendMessage(order.user_id, successText, { parse_mode: "HTML" });
  } catch {}

  // 3. Notificação detalhada para o Dono da Loja
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
 * Trata o botão "Já paguei / Verificar"
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
    return processSuccessfulDelivery(ctx, orderId, order.mp_payment_id);
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
  return ctx.reply("❌ Pedido cancelado. Quando quiser comprar novamente, basta clicar no botão abaixo:", {
    reply_markup: keyboards.customerMain(settingsRepo.getConfig().salePriceBrl, settingsRepo.getConfig().supportUsername),
  });
}
