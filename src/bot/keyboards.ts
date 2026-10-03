import { InlineKeyboard } from "grammy";

export const keyboards = {
  /**
   * Menu principal da loja para clientes
   */
  customerMain(priceBrl: number, supportUsername?: string): InlineKeyboard {
    const kb = new InlineKeyboard();
    const formattedPrice = priceBrl.toFixed(2).replace(".", ",");

    // Botão de compra direta e chamativo
    kb.text(`⭐ Comprar Agora (R$ ${formattedPrice})`, "buy_now").row();

    // Botões de apoio
    if (supportUsername) {
      kb.url("💬 Suporte", `https://t.me/${supportUsername.replace(/^@/, "")}`);
    } else {
      kb.text("💬 Suporte", "nav_support");
    }

    kb.text("❓ Como Funciona", "nav_faq").row();
    return kb;
  },

  /**
   * Tela de pagamento PIX com botão nativo de 1-toque para copiar
   */
  pixCheckout(pixCode: string, orderId: string): InlineKeyboard {
    const kb = new InlineKeyboard();

    // Botão de copiar nativo do Telegram (copy_text)
    // Se o cliente estiver num app recente, copia no clique. Senão, fallback de callback
    if ((kb as any).copyText) {
      (kb as any).copyText("📋 Copiar Código PIX", pixCode).row();
    } else {
      kb.text("📋 Copiar Código PIX", `copy_pix_${orderId}`).row();
    }

    kb.text("🔄 Já Paguei / Verificar", `check_pix_${orderId}`)
      .text("❌ Cancelar", `cancel_pix_${orderId}`)
      .row();

    return kb;
  },

  /**
   * Painel de controle do Admin
   */
  adminMenu(): InlineKeyboard {
    return new InlineKeyboard()
      // Linha 1: Personalização básica
      .text("🏷️ Alterar Nome", "adm_set_name")
      .text("💵 Alterar Preço", "adm_set_price")
      .row()
      // Linha 2: Conexões de pagamento e API
      .text("💳 Token Mercado Pago", "adm_set_mp")
      .text("🔑 Chave da API", "adm_set_api")
      .row()
      // Linha 3: Suporte e Teste
      .text("💬 @ do Suporte", "adm_set_support")
      .text("🧪 Simular Entrega", "adm_simulate")
      .row()
      // Linha 4: Diagnóstico e Relatório
      .text("🩺 Diagnóstico", "adm_diag")
      .text("📊 Vendas & Lucro", "adm_stats")
      .row()
      // Linha 5: Broadcast e Visualização
      .text("📢 Enviar Aviso", "adm_broadcast")
      .text("🏪 Ver Minha Loja", "adm_preview")
      .row();
  },

  /**
   * Botão de cancelamento de prompt de digitação
   */
  cancelPrompt(): InlineKeyboard {
    return new InlineKeyboard().text("❌ Cancelar", "adm_cancel_prompt");
  },

  /**
   * Teclado do Wizard de boas-vindas
   */
  wizardStart(): InlineKeyboard {
    return new InlineKeyboard().text("🚀 Iniciar Configuração Agora", "wiz_start");
  },
};
