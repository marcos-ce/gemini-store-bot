import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env.js";

export const db = new DatabaseSync(env.DB_PATH);

// Otimizações de desempenho e concorrência do SQLite
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

// ─── Criação das Tabelas ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    mp_payment_id TEXT UNIQUE,
    product_name TEXT NOT NULL DEFAULT 'Google 5TB - Gemini PRO 18 MESES',
    price_cents INTEGER NOT NULL,
    cost_cents INTEGER NOT NULL DEFAULT 1500,
    delivered_value TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    delivered_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_mp ON orders(mp_payment_id);
`);

// ─── Interfaces ────────────────────────────────────────────────────────────
export interface StoreConfig {
  storeName: string;
  resellerApiKey: string;
  apiBaseUrl: string;
  mpAccessToken: string;
  salePriceBrl: number;
  supportUsername: string;
  isConfigured: boolean;
  activePromptKey?: string; // Para fluxo de digitação no chat do Admin
}

export interface OrderRecord {
  id: string;
  user_id: number;
  user_name: string | null;
  mp_payment_id: string | null;
  product_name: string;
  price_cents: number;
  cost_cents: number;
  delivered_value: string | null;
  status: string;
  created_at: string;
  delivered_at: string | null;
}

// ─── Repositório de Configurações ──────────────────────────────────────────
export const settingsRepo = {
  get(key: string, defaultValue = ""): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  },

  set(key: string, value: string): void {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value);
  },

  delete(key: string): void {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  },

  getConfig(): StoreConfig {
    const storeName = this.get("store_name", process.env.STORE_NAME || "Gemini Store");
    const resellerApiKey = this.get("reseller_api_key", process.env.RESELLER_API_KEY || "");
    const apiBaseUrl = this.get("api_base_url", env.API_BASE_URL);
    const mpAccessToken = this.get("mp_access_token", process.env.MP_ACCESS_TOKEN || "");
    const salePriceStr = this.get("sale_price_brl", process.env.SALE_PRICE_BRL || "29.90");
    const supportUsername = this.get("support_username", process.env.SUPPORT_USERNAME || "");
    const isConfiguredVal = this.get("is_configured", "0");
    const activePromptKey = this.get("active_admin_prompt", "");

    const isConfigured = isConfiguredVal === "1" || (resellerApiKey.length > 5 && mpAccessToken.length > 5);

    return {
      storeName,
      resellerApiKey,
      apiBaseUrl,
      mpAccessToken,
      salePriceBrl: parseFloat(salePriceStr) || 29.90,
      supportUsername,
      isConfigured,
      activePromptKey: activePromptKey || undefined,
    };
  },

  updateConfig(patch: Partial<StoreConfig>): void {
    if (patch.storeName !== undefined) this.set("store_name", patch.storeName);
    if (patch.resellerApiKey !== undefined) this.set("reseller_api_key", patch.resellerApiKey);
    if (patch.apiBaseUrl !== undefined) this.set("api_base_url", patch.apiBaseUrl);
    if (patch.mpAccessToken !== undefined) this.set("mp_access_token", patch.mpAccessToken);
    if (patch.salePriceBrl !== undefined) this.set("sale_price_brl", patch.salePriceBrl.toFixed(2));
    if (patch.supportUsername !== undefined) this.set("support_username", patch.supportUsername.replace(/^@/, ""));
    if (patch.isConfigured !== undefined) this.set("is_configured", patch.isConfigured ? "1" : "0");
    if (patch.activePromptKey !== undefined) {
      if (patch.activePromptKey) this.set("active_admin_prompt", patch.activePromptKey);
      else this.delete("active_admin_prompt");
    }
  },
};

// ─── Repositório de Usuários ───────────────────────────────────────────────
export const userRepo = {
  touch(id: number, username?: string, firstName?: string): void {
    db.prepare(`
      INSERT INTO users (id, username, first_name, last_seen)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET 
        username = coalesce(excluded.username, users.username),
        first_name = coalesce(excluded.first_name, users.first_name),
        last_seen = datetime('now')
    `).run(id, username || null, firstName || null);
  },

  getAll(): Array<{ id: number; username: string | null; first_name: string | null }> {
    return db.prepare("SELECT id, username, first_name FROM users ORDER BY last_seen DESC").all() as any[];
  },

  count(): number {
    const row = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
    return row?.c || 0;
  },
};

// ─── Repositório de Pedidos ────────────────────────────────────────────────
export const orderRepo = {
  create(order: {
    id: string;
    userId: number;
    userName?: string;
    mpPaymentId?: string;
    productName: string;
    priceCents: number;
    costCents: number;
  }): void {
    db.prepare(`
      INSERT INTO orders (id, user_id, user_name, mp_payment_id, product_name, price_cents, cost_cents, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      order.id,
      order.userId,
      order.userName || null,
      order.mpPaymentId || null,
      order.productName,
      order.priceCents,
      order.costCents
    );
  },

  getByMpPaymentId(mpPaymentId: string): OrderRecord | undefined {
    return db.prepare("SELECT * FROM orders WHERE mp_payment_id = ?").get(mpPaymentId) as OrderRecord | undefined;
  },

  getById(id: string): OrderRecord | undefined {
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRecord | undefined;
  },

  markDelivered(id: string, deliveredValue: string): void {
    db.prepare(`
      UPDATE orders 
      SET status = 'delivered', delivered_value = ?, delivered_at = datetime('now')
      WHERE id = ?
    `).run(deliveredValue, id);
  },

  markFailed(id: string, reason: string): void {
    db.prepare(`
      UPDATE orders 
      SET status = 'failed', delivered_value = ? 
      WHERE id = ?
    `).run(reason, id);
  },

  getStats(): { totalSales: number; totalGrossBrl: number; totalCostBrl: number; totalProfitBrl: number } {
    const row = db.prepare(`
      SELECT 
        COUNT(*) as totalSales,
        COALESCE(SUM(price_cents), 0) as totalGrossCents,
        COALESCE(SUM(cost_cents), 0) as totalCostCents
      FROM orders 
      WHERE status = 'delivered'
    `).get() as { totalSales: number; totalGrossCents: number; totalCostCents: number };

    const totalGrossBrl = (row.totalGrossCents || 0) / 100;
    const totalCostBrl = (row.totalCostCents || 0) / 100;
    const totalProfitBrl = totalGrossBrl - totalCostBrl;

    return {
      totalSales: row.totalSales || 0,
      totalGrossBrl,
      totalCostBrl,
      totalProfitBrl,
    };
  },

  getRecent(limit = 10): OrderRecord[] {
    return db.prepare("SELECT * FROM orders WHERE status = 'delivered' ORDER BY delivered_at DESC LIMIT ?").all(limit) as unknown as OrderRecord[];
  },
};
