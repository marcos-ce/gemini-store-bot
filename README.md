# 🤖 Gemini Store Bot — Loja Autônoma no Telegram

Bot de vendas automatizado e white-label para Telegram. Integrado nativamente com **Mercado Pago (PIX)** e fornecimento instantâneo de contas **Google 5TB + Gemini PRO 18 Meses**.

Zero painel web, zero banco de dados pesado, zero complicação. O comprador configura tudo pelo chat do Telegram em menos de 3 minutos.

---

## ☁️ Opção 1: Deploy Grátis na Nuvem (1 Clique — Sem VPS e Sem PC)

Se você não tem VPS nem quer deixar seu computador ligado, use uma das opções abaixo para rodar na nuvem em 30 segundos:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Fmarcos-ce%2Fgemini-store-bot)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/marcos-ce/gemini-store-bot)

1. Clique em um dos botões acima.
2. Preencha apenas o `BOT_TOKEN` e seu `ADMIN_ID`.
3. Clique em **Deploy**. Pronto! O bot já estará rodando 24 horas por dia na nuvem.

> 💡 **Dica de Persistência na Nuvem:** O bot armazena seus dados em `./data/store.sqlite`. Em plataformas como Render ou Railway, configure um **Disco Persistente (Volume)** montado em `/data` (ou aponte a variável `DATA_DIR=/data`) para garantir que suas configurações e saldos de clientes nunca sejam perdidos após reinicializações.

---

## ⚡ Opção 2: Instalação em 1 Linha (VPS Linux / Ubuntu / Debian)

Cole o comando abaixo no terminal da sua VPS:

```bash
curl -sSL https://raw.githubusercontent.com/marcos-ce/gemini-store-bot/main/install.sh | bash
```

O script instala o Node.js, baixa o bot, compila, configura o PM2 para rodar 24h e inicia o bot sozinho!

---

## 🪟 Opção 3: No Computador Windows (2 Cliques)

Se você usa Windows e quer rodar no seu próprio PC sem pagar hospedagem:

1. Baixe o projeto (ou dê `git clone https://github.com/marcos-ce/gemini-store-bot.git`).
2. Dê **dois cliques no arquivo `iniciar.bat`**.
3. O instalador verificará tudo, pedirá seu `BOT_TOKEN` e `ADMIN_ID` na primeira vez e iniciará o bot na hora!

---

## 📱 Opção 4: No Celular Android (Termux)

Se você quer deixar rodando 24h em um celular Android antigo:

1. Instale o app [Termux](https://f-droid.org/packages/com.termux/) no seu Android.
2. Abra o Termux e cole o comando:
```bash
curl -sSL https://raw.githubusercontent.com/marcos-ce/gemini-store-bot/main/termux.sh | bash
```

---

## 🚀 Como Funciona a Configuração Inicial (Zero Código)

1. Crie seu bot no [@BotFather](https://t.me/BotFather) do Telegram para pegar o `BOT_TOKEN`.
2. Pegue seu ID de usuário no Telegram com o [@userinfobot](https://t.me/userinfobot) (`ADMIN_ID`).
3. Ligue o bot usando qualquer uma das opções acima.
4. Abra a conversa com o seu bot no Telegram e envie `/start`.
5. O bot iniciará o **Assistente Interativo de Boas-Vindas**, perguntando:
   * **Nome da sua loja** (ex: *GG Store*)
   * **Access Token do Mercado Pago** (onde você recebe o PIX direto na sua conta)
   * **Chave de API do Fornecedor** (`gg_live_...`)
   * **Preço de venda** (ex: R$ 29,90)
   * **@ de suporte** (ex: `@seu_usuario`)
6. **Pronto!** Sua loja já estará vendendo no piloto automático.

---

## 🛡️ Painel do Dono no Telegram (`/admin`)

O administrador gerencia toda a loja diretamente pelo chat usando botões interativos:

* 🏷️ **Alterar Nome da Loja**
* 💵 **Alterar Preço de Venda** (com validação anti-prejuízo)
* 💳 **Atualizar Token do Mercado Pago** (com exclusão automática da mensagem para sigilo)
* 🔑 **Atualizar Chave da API de Fornecimento**
* 💬 **Alterar @ de Suporte**
* 🧪 **Simular Entrega Grátis (`/simular`)**: Testa a mensagem exata que o cliente recebe sem gastar nada.
* 🩺 **Autodiagnóstico (`/diagnostico`)**: Testa Telegram, Mercado Pago, Fornecedor e Banco de Dados na hora.
* 💾 **Backup do Banco (`/backup`)**: Baixa o arquivo `store.sqlite` direto no Telegram com 1 clique para cópia de segurança.
* 📊 **Relatório Financeiro**: Total de vendas, faturamento bruto e lucro líquido no bolso.
* 📢 **Aviso aos Clientes**: Envia transmissão (broadcast) para todos os clientes cadastrados com proteção contra rate-limit.

---

## 💡 Para Revendedores: Como Hospedar Múltiplos Bots na sua VPS (Modelo SaaS)

Se você quiser vender o bot com "hospedagem inclusa" para seus clientes:
Como o bot consome apenas ~35MB de RAM, você pode rodar dezenas deles na mesma VPS com PM2:

```bash
# Para cada cliente novo:
BOT_TOKEN="token_do_cliente" ADMIN_ID="id_dele" pm2 start dist/index.js --name "cliente-01"
```

O cliente não precisa saber de VPS nem de código: ele só envia `/start` no bot dele e já começa a vender!

---

## 🔒 Segurança e Confiabilidade

* **Long Polling Nativo:** Não necessita abrir portas, configurar Nginx nem certificados SSL. Funciona em qualquer servidor ou computador mesmo atrás de roteadores/NAT.
* **Reconciliação Automática:** Rotina de conciliação ativa no boot e a cada 60 segundos que detecta e entrega automaticamente pedidos pagos mesmo após reinicializações.
* **Idempotência Estrita:** O ID do pagamento do Mercado Pago é enviado como `external_id` para o fornecedor, eliminando qualquer risco de cobrança duplicada.
* **Exclusão de Tokens:** Qualquer credencial ou chave enviada no chat é imediatamente excluída da conversa pelo bot por questões de segurança.
* **SQLite em Modo WAL:** Banco de dados ultrarrápido em arquivo único local nativo do Node.js 22+, sem dependências C++ que possam falhar.

---

## 📄 Licença
Distribuído sob licença MIT. Livre para uso comercial e revenda white-label.
