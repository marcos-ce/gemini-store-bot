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
    balance_cents INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    mp_payment_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_mp ON orders(mp_payment_id);
  CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
`);

// Migração segura para tabelas já existentes
try {
  db.exec("ALTER TABLE users ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0;");
} catch {}

// ─── Interfaces ────────────────────────────────────────────────────────────
export interface StoreConfig {
  storeName: string;
  resellerApiKey: string;
  apiBaseUrl: string;
  mpAccessToken: string;
  salePriceBrl: number;
  supportUsername: string;
  isConfigured: boolean;
  walletEnabled: boolean;
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

export interface DepositRecord {
  id: string;
  user_id: number;
  amount_cents: number;
  mp_payment_id: string | null;
  status: string;
  created_at: string;
  approved_at: string | null;
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
    const walletEnabledVal = this.get("wallet_enabled", "1");
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
      walletEnabled: walletEnabledVal === "1",
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
    if (patch.walletEnabled !== undefined) this.set("wallet_enabled", patch.walletEnabled ? "1" : "0");
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

  getBalance(id: number): number {
    const row = db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(id) as { balance_cents: number } | undefined;
    return row?.balance_cents || 0;
  },

  addBalance(id: number, amountCents: number): number {
    db.prepare(`
      INSERT INTO users (id, balance_cents, last_seen)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET balance_cents = balance_cents + ?
    `).run(id, amountCents, amountCents);
    return this.getBalance(id);
  },

  debitBalance(id: number, amountCents: number): boolean {
    if (amountCents <= 0) return false;
    const res = db.prepare(
      "UPDATE users SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?"
    ).run(amountCents, id, amountCents);
    return Number(res.changes) > 0;
  },

  getAll(): Array<{ id: number; username: string | null; first_name: string | null; balance_cents?: number }> {
    return db.prepare("SELECT id, username, first_name, balance_cents FROM users ORDER BY last_seen DESC").all() as any[];
  },

  count(): number {
    const row = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
    return row?.c || 0;
  },
};

// ─── Repositório de Depósitos (Carteira) ───────────────────────────────────
export const depositRepo = {
  create(dep: { id: string; userId: number; amountCents: number; mpPaymentId?: string }): void {
    db.prepare(`
      INSERT INTO deposits (id, user_id, amount_cents, mp_payment_id, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(dep.id, dep.userId, dep.amountCents, dep.mpPaymentId || null);
  },

  getById(id: string): DepositRecord | undefined {
    return db.prepare("SELECT * FROM deposits WHERE id = ?").get(id) as unknown as DepositRecord | undefined;
  },

  markApproved(id: string): boolean {
    const res = db.prepare(
      "UPDATE deposits SET status = 'approved', approved_at = datetime('now') WHERE id = ? AND status = 'pending'"
    ).run(id);
    return Number(res.changes) > 0;
  },

  getRecentPending(minutes = 30): DepositRecord[] {
    return db.prepare(`
      SELECT * FROM deposits 
      WHERE status = 'pending' 
        AND mp_payment_id IS NOT NULL 
        AND created_at >= datetime('now', '-' || ? || ' minutes')
    `).all(minutes) as unknown as DepositRecord[];
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
    return db.prepare("SELECT * FROM orders WHERE mp_payment_id = ?").get(mpPaymentId) as unknown as OrderRecord | undefined;
  },

  getById(id: string): OrderRecord | undefined {
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as unknown as OrderRecord | undefined;
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

  getRecentPending(minutes = 30): OrderRecord[] {
    return db.prepare(`
      SELECT * FROM orders 
      WHERE status = 'pending' 
        AND mp_payment_id IS NOT NULL 
        AND created_at >= datetime('now', '-' || ? || ' minutes')
    `).all(minutes) as unknown as OrderRecord[];
  },
};
