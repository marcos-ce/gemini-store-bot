import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log("\n=======================================================");
  console.log("   🧙 WIZARD DE CONFIGURAÇÃO & DEPLOY PARA A DISCLOUD   ");
  console.log("=======================================================\n");
  console.log("Este assistente vai preparar tudo para você colocar o");
  console.log("bot no ar na Discloud em poucos segundos.\n");

  // 1. Perguntas básicas
  const botToken = (await rl.question("🔑 1. Cole o BOT_TOKEN do Telegram (do @BotFather):\n> ")).trim();
  if (!botToken) {
    console.error("❌ O BOT_TOKEN é obrigatório para ligar o bot!");
    rl.close();
    process.exit(1);
  }

  const adminId = (await rl.question("\n👤 2. Cole o seu ID numérico do Telegram (do @userinfobot):\n> ")).trim();
  if (!adminId) {
    console.error("❌ O ADMIN_ID é obrigatório para você gerenciar o bot!");
    rl.close();
    process.exit(1);
  }

  const supportUser = (await rl.question("\n💬 3. Seu @ de suporte no Telegram (opcional, ex: SeuUser):\n> "))
    .trim()
    .replace("@", "");

  rl.close();

  console.log("\n⚙️ 1/3. Gerando arquivo .env personalizado...");
  const envContent = [
    `BOT_TOKEN=${botToken}`,
    `ADMIN_ID=${adminId}`,
    `API_BASE_URL=https://api.hewhotries.tech/v1`,
    supportUser ? `SUPPORT_USERNAME=${supportUser}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(path.resolve(process.cwd(), ".env"), envContent + "\n", "utf-8");
  console.log("✅ Arquivo .env gerado com sucesso!");

  console.log("\n🔨 2/3. Compilando o projeto TypeScript...");
  try {
    execSync("npm run build", { stdio: "inherit" });
    console.log("✅ Compilação concluída com sucesso!");
  } catch (err) {
    console.error("❌ Falha na compilação do TypeScript.", err);
    process.exit(1);
  }

  console.log("\n📦 3/3. Gerando pacote discloud.zip pronto para upload...");
  const zipName = "discloud.zip";
  const zipPath = path.resolve(process.cwd(), zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  try {
    if (process.platform === "win32") {
      const psCommand = `powershell -Command "Compress-Archive -Path dist, package.json, package-lock.json, discloud.config, .env -DestinationPath ${zipName} -Force"`;
      execSync(psCommand, { stdio: "pipe" });
    } else {
      execSync(`zip -r ${zipName} dist package.json package-lock.json discloud.config .env`, { stdio: "pipe" });
    }
    console.log(`✅ Arquivo '${zipName}' gerado com sucesso!`);
  } catch (err) {
    console.warn("⚠️ Aviso: Não foi possível compactar automaticamente. Você pode compactar manualmente.");
  }

  console.log("\n🎉 ======================================================= 🎉");
  console.log("   TUDO PRONTO! AGORA É SÓ SUBIR NA DISCLOUD:");
  console.log("-------------------------------------------------------");
  console.log(`1. Acesse: https://discloud.com/app`);
  console.log(`2. Clique em 'Adicionar App' (ícone de Upload)`);
  console.log(`3. Selecione o arquivo gerado: '${zipName}'`);
  console.log(`4. Clique em Iniciar (Start)!`);
  console.log("-------------------------------------------------------");
  console.log("Quando ligar, digite /admin no seu bot no Telegram para");
  console.log("conectar seu Mercado Pago e sua API em 1 clique!");
  console.log("=======================================================\n");
}

main().catch(console.error);
