import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

dotenv.config();

export interface EnvConfig {
  BOT_TOKEN: string;
  ADMIN_ID: number;
  API_BASE_URL: string;
  DATA_DIR: string;
  DB_PATH: string;
}

const botToken = process.env.BOT_TOKEN || "";
const adminId = parseInt(process.env.ADMIN_ID || "0", 10);
const apiBaseUrl = (process.env.API_BASE_URL || "https://api.bunaistore.shop/v1").replace(/\/+$/, "");

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const env: EnvConfig = {
  BOT_TOKEN: botToken,
  ADMIN_ID: adminId,
  API_BASE_URL: apiBaseUrl,
  DATA_DIR: dataDir,
  DB_PATH: path.join(dataDir, "store.sqlite"),
};
