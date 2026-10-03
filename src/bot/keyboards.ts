import { InlineKeyboard } from "grammy";

export const keyboards = {
  /**
   * Menu principal da loja para clientes
   */
  customerMain(priceBrl: number, supportUsername?: string, walletEnabled = true): InlineKeyboard {
    const kb = new InlineKeyboard();
    const formattedPrice = priceBrl.toFixed(2).replace(".", ",");

    // Botão de compra direta e chamativo
    kb.text(`⭐ Comprar Agora (R$ ${formattedPrice})`, "buy_now").row();

    // Opção de Carteira (se ativada pelo dono)
    if (walletEnabled) {
      kb.text("💰 Carteira", "nav_wallet").row();
    }

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
   * Menu da tela de FAQ / Como Funciona
   */
  faqMenu(): InlineKeyboard {
    return new InlineKeyboard()
      .text("⭐ Comprar Agora", "buy_now")
      .row()
      .text("↩️ Voltar para a Loja", "nav_home");
  },

  /**
   * Menu da tela de Suporte
   */
  supportMenu(supportUsername?: string): InlineKeyboard {
    const kb = new InlineKeyboard();
    if (supportUsername) {
      kb.url("💬 Falar com Atendente", `https://t.me/${supportUsername.replace(/^@/, "")}`).row();
    }
    kb.text("↩️ Voltar para a Loja", "nav_home");
    return kb;
  },

  /**
   * Teclado com botão único para voltar ao painel admin
   */
  adminBackOnly(): InlineKeyboard {
    return new InlineKeyboard().text("↩️ Voltar ao Painel", "adm_back_panel");
  },

  /**
   * Menu da Carteira do Cliente
   */
  walletMenu(balanceBrl: number): InlineKeyboard {
    return new InlineKeyboard()
      .text("➕ Recarregar R$ 15", "dep_qty_15")
      .text("➕ Recarregar R$ 30", "dep_qty_30")
      .row()
      .text("➕ Recarregar R$ 50", "dep_qty_50")
      .text("➕ Outro Valor", "dep_custom")
      .row()
      .text("↩️ Voltar para a Loja", "nav_home")
      .row();
  },

  /**
   * Escolha de pagamento na compra (Saldo ou PIX direto)
   */
  checkoutOptions(priceBrl: number, balanceBrl: number): InlineKeyboard {
    const kb = new InlineKeyboard();
    const priceFormatted = priceBrl.toFixed(2).replace(".", ",");

    if (balanceBrl >= priceBrl) {
      kb.text(`⚡ Comprar com Saldo da Carteira (1 Clique)`, "buy_wallet").row();
    }

    kb.text(`💳 Pagar via PIX Direto (R$ ${priceFormatted})`, "buy_pix_direct").row();
    kb.text("↩️ Cancelar / Voltar", "nav_home").row();
    return kb;
  },

  /**
   * Tela de pagamento PIX de Recarga de Carteira
   */
  depositCheckout(pixCode: string, depositId: string): InlineKeyboard {
    const kb = new InlineKeyboard();

    if ((kb as any).copyText) {
      (kb as any).copyText("📋 Copiar Código PIX", pixCode).row();
    } else {
      kb.text("📋 Copiar Código PIX", `copy_dep_${depositId}`).row();
    }

    kb.text("🔄 Já Paguei / Verificar", `check_dep_${depositId}`)
      .text("❌ Cancelar Recarga", `cancel_dep_${depositId}`)
      .row();

    return kb;
  },

  /**
   * Tela de pagamento PIX de Pedido com botão nativo de 1-toque para copiar
   */
  pixCheckout(pixCode: string, orderId: string): InlineKeyboard {
    const kb = new InlineKeyboard();

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
  adminMenu(walletEnabled = true): InlineKeyboard {
    return new InlineKeyboard()
      // Linha 1: Personalização básica
      .text("🏷️ Alterar Nome", "adm_set_name")
      .text("💵 Alterar Preço", "adm_set_price")
      .row()
      // Linha 2: Conexões de pagamento e API
      .text("💳 Token Mercado Pago", "adm_set_mp")
      .text("🔑 Chave da API", "adm_set_api")
      .row()
      // Linha 3: Textos e Suporte
      .text("📝 Textos da Loja", "adm_texts")
      .text("💬 @ do Suporte", "adm_set_support")
      .row()
      // Linha 4: Modo Carteira
      .text(walletEnabled ? "💰 Carteira: 🟢 Ativada" : "💰 Carteira: 🔴 Desativada", "adm_toggle_wallet")
      .text("🧪 Simular Entrega", "adm_simulate")
      .row()
      // Linha 5: Diagnóstico e Relatório
      .text("🩺 Diagnóstico", "adm_diag")
      .text("📊 Vendas & Lucro", "adm_stats")
      .row()
      // Linha 6: Broadcast e Backup
      .text("📢 Enviar Aviso", "adm_broadcast")
      .text("💾 Baixar Backup", "adm_backup")
      .row()
      // Linha 7: Visualização
      .text("🏪 Ver Minha Loja (Cliente)", "adm_preview")
      .row();
  },

  /**
   * Menu de personalização de textos da loja
   */
  messagesMenu(): InlineKeyboard {
    return new InlineKeyboard()
      .text("✏️ Descrição do Produto", "adm_set_desc")
      .text("✏️ Dúvidas & Regras (FAQ)", "adm_set_faq")
      .row()
      .text("✏️ Mensagem Pós-Entrega", "adm_set_delivery")
      .text("🔄 Restaurar Padrões", "adm_reset_texts")
      .row()
      .text("↩️ Voltar ao Painel", "adm_back_panel")
      .row();
  },

  /**
   * Botão de cancelamento de prompt de digitação
   */
  cancelPrompt(targetCallback = "adm_cancel_prompt"): InlineKeyboard {
    return new InlineKeyboard().text("❌ Cancelar", targetCallback);
  },

  /**
   * Teclado do Wizard de boas-vindas
   */
  wizardStart(): InlineKeyboard {
    return new InlineKeyboard().text("🚀 Iniciar Configuração Agora", "wiz_start");
  },
};
