# 🤖 Gemini Store Bot — Loja Autônoma no Telegram

Bot de vendas automatizado e white-label para Telegram. Integrado nativamente com **Mercado Pago (PIX)** e fornecimento instantâneo de contas **Google 5TB + Gemini PRO 18 Meses**.

Zero painel web, zero banco de dados pesado, zero complicação. O comprador configura tudo pelo chat do Telegram em menos de 3 minutos.

---

## ⚡ Instalação Rápida em 1 Linha (VPS Linux / Ubuntu / Debian)

Cole o comando abaixo no terminal da sua VPS:

```bash
curl -sSL https://raw.githubusercontent.com/marcos-ce/gemini-store-bot/main/install.sh | bash
```

O script instala o Node.js, baixa o bot, compila, configura o PM2 para rodar 24h e inicia o bot sozinho!

---

## 🚀 Como Funciona a Configuração Inicial (Zero Código)

1. Crie seu bot no [@BotFather](https://t.me/BotFather) do Telegram para pegar o `BOT_TOKEN`.
2. Pegue seu ID de usuário no Telegram com o [@userinfobot](https://t.me/userinfobot) (`ADMIN_ID`).
3. Ligue o bot (via comando acima ou localmente).
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
* 📊 **Relatório Financeiro**: Total de vendas, faturamento bruto e lucro líquido no bolso.
* 📢 **Aviso aos Clientes**: Envia transmissão (broadcast) para todos os clientes cadastrados.

---

## ⚙️ Instalação Manual (Windows ou Linux)

```bash
# 1. Clone o repositório
git clone https://github.com/marcos-ce/gemini-store-bot.git
cd gemini-store-bot

# 2. Instale as dependências
npm install

# 3. Copie o arquivo de variáveis de ambiente
cp .env.example .env

# 4. Preencha BOT_TOKEN e ADMIN_ID no .env
# (abra com seu editor favorito, ex: nano .env ou bloco de notas)

# 5. Compile o projeto
npm run build

# 6. Inicie o bot
npm start
```

---

## 🔒 Segurança e Confiabilidade

* **Long Polling Nativo:** Não necessita abrir portas, configurar Nginx nem certificados SSL. Funciona em qualquer servidor ou computador mesmo atrás de roteadores/NAT.
* **Idempotência Estrita:** O ID do pagamento do Mercado Pago é enviado como `external_id` para o fornecedor, eliminando qualquer risco de cobrança duplicada.
* **Exclusão de Tokens:** Qualquer credencial ou chave enviada no chat é imediatamente excluída da conversa pelo bot por questões de segurança.
* **SQLite em Modo WAL:** Banco de dados ultrarrápido em arquivo único local, sem necessidade de servidores MySQL ou PostgreSQL externos.

---

## 📄 Licença
Distribuído sob licença MIT. Livre para uso comercial e revenda white-label.
