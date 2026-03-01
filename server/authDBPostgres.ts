/**
 * Auth DB implementation using Neon Postgres (Vercel production).
 * Used when VERCEL=1 and POSTGRES_URL or DATABASE_URL is set.
 */

import * as bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import type { UserPublic, UserHolding, UserSettings } from "./authDB.js";
import { validatePassword } from "./authDB.js";

const BCRYPT_COST = 12;
const RESET_TOKEN_EXPIRY_MINUTES = 30;

let sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
let schemaDone = false;

async function getSql() {
  if (!sql) {
    const conn =
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL_UNPOOLED;
    if (!conn) {
      throw new Error(
        "POSTGRES_URL or DATABASE_URL is required for auth on Vercel"
      );
    }
    const { neon } = await import("@neondatabase/serverless");
    sql = neon(conn) as typeof sql;
  }
  return sql;
}

async function ensureSchema() {
  if (schemaDone) return;
  const run = await getSql();
  await run`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      last_login_at BIGINT
    )
  `;
  await run`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  `;
  await run`
    CREATE TABLE IF NOT EXISTS user_holdings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticker TEXT NOT NULL,
      shares REAL NOT NULL,
      avg_cost REAL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      UNIQUE(user_id, ticker)
    )
  `;
  await run`
    CREATE INDEX IF NOT EXISTS idx_user_holdings_user_id ON user_holdings(user_id)
  `;
  await run`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      used_at BIGINT,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    )
  `;
  await run`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash)
  `;
  await run`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)
  `;
  await run`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ytd_baseline REAL,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    )
  `;
  schemaDone = true;
}

function rowToUserPublic(row: Record<string, unknown>): UserPublic {
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: row.display_name != null ? String(row.display_name) : null,
    created_at: Number(row.created_at),
  };
}

function rowToUserHolding(row: Record<string, unknown>): UserHolding {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    ticker: String(row.ticker),
    shares: Number(row.shares),
    avg_cost: row.avg_cost != null ? Number(row.avg_cost) : null,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

function rowToUserSettings(row: Record<string, unknown>): UserSettings {
  return {
    user_id: String(row.user_id),
    ytd_baseline: row.ytd_baseline != null ? Number(row.ytd_baseline) : null,
    updated_at: Number(row.updated_at),
  };
}

export async function createUser(
  email: string,
  password: string,
  displayName?: string
): Promise<UserPublic> {
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error);
  }
  await ensureSchema();
  const run = await getSql();
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await run`SELECT id FROM users WHERE email = ${normalizedEmail}`;
  if (Array.isArray(existing) && existing.length > 0) {
    throw new Error("该邮箱已被注册");
  }
  const id = nanoid();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const now = Math.floor(Date.now() / 1000);
  await run`
    INSERT INTO users (id, email, password_hash, display_name, created_at)
    VALUES (${id}, ${normalizedEmail}, ${passwordHash}, ${displayName ?? null}, ${now})
  `;
  await run`INSERT INTO user_settings (user_id) VALUES (${id})`;
  return {
    id,
    email: normalizedEmail,
    display_name: displayName ?? null,
    created_at: now,
  };
}

export async function verifyUser(
  email: string,
  password: string
): Promise<UserPublic | null> {
  await ensureSchema();
  const run = await getSql();
  const normalizedEmail = email.toLowerCase().trim();
  const rows = await run`
    SELECT id, email, password_hash, display_name, created_at
    FROM users WHERE email = ${normalizedEmail}
  `;
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  if (!row || !row.password_hash) return null;
  const valid = await bcrypt.compare(password, String(row.password_hash));
  if (!valid) return null;
  const now = Math.floor(Date.now() / 1000);
  await run`UPDATE users SET last_login_at = ${now} WHERE id = ${String(row.id)}`;
  return rowToUserPublic(row);
}

export async function getUserById(id: string): Promise<UserPublic | null> {
  await ensureSchema();
  const run = await getSql();
  const rows = await run`SELECT id, email, display_name, created_at FROM users WHERE id = ${id}`;
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  return row ? rowToUserPublic(row) : null;
}

export async function getUserByEmail(email: string): Promise<UserPublic | null> {
  await ensureSchema();
  const run = await getSql();
  const normalizedEmail = email.toLowerCase().trim();
  const rows = await run`SELECT id, email, display_name, created_at FROM users WHERE email = ${normalizedEmail}`;
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  return row ? rowToUserPublic(row) : null;
}

export async function getUserHoldings(userId: string): Promise<UserHolding[]> {
  await ensureSchema();
  const run = await getSql();
  const rows = await run`
    SELECT id, user_id, ticker, shares, avg_cost, created_at, updated_at
    FROM user_holdings WHERE user_id = ${userId} ORDER BY ticker ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) =>
    rowToUserHolding(r as Record<string, unknown>)
  );
}

export async function upsertHolding(
  userId: string,
  ticker: string,
  shares: number,
  avgCost?: number
): Promise<UserHolding> {
  await ensureSchema();
  const run = await getSql();
  const normalizedTicker = ticker.toUpperCase().trim();
  const now = Math.floor(Date.now() / 1000);
  const id = nanoid();
  await run`
    INSERT INTO user_holdings (id, user_id, ticker, shares, avg_cost, created_at, updated_at)
    VALUES (${id}, ${userId}, ${normalizedTicker}, ${shares}, ${avgCost ?? null}, ${now}, ${now})
    ON CONFLICT (user_id, ticker) DO UPDATE SET
      shares = EXCLUDED.shares,
      avg_cost = EXCLUDED.avg_cost,
      updated_at = EXCLUDED.updated_at
  `;
  const rows = await run`
    SELECT id, user_id, ticker, shares, avg_cost, created_at, updated_at
    FROM user_holdings WHERE user_id = ${userId} AND ticker = ${normalizedTicker}
  `;
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  if (!row) throw new Error("upsertHolding: row not found");
  return rowToUserHolding(row);
}

export async function deleteHolding(
  userId: string,
  ticker: string
): Promise<boolean> {
  await ensureSchema();
  const run = await getSql();
  const normalizedTicker = ticker.toUpperCase().trim();
  const rows = await run`
    DELETE FROM user_holdings WHERE user_id = ${userId} AND ticker = ${normalizedTicker}
    RETURNING id
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function replaceAllHoldings(
  userId: string,
  holdings: Array<{ ticker: string; shares: number; avgCost?: number }>
): Promise<UserHolding[]> {
  await ensureSchema();
  const run = await getSql();
  const now = Math.floor(Date.now() / 1000);
  await run`DELETE FROM user_holdings WHERE user_id = ${userId}`;
  for (const h of holdings) {
    if (h.shares > 0) {
      await run`
        INSERT INTO user_holdings (id, user_id, ticker, shares, avg_cost, created_at, updated_at)
        VALUES (${nanoid()}, ${userId}, ${h.ticker.toUpperCase().trim()}, ${h.shares}, ${h.avgCost ?? null}, ${now}, ${now})
      `;
    }
  }
  return getUserHoldings(userId);
}

export async function getUserSettings(
  userId: string
): Promise<UserSettings | null> {
  await ensureSchema();
  const run = await getSql();
  const rows = await run`
    SELECT user_id, ytd_baseline, updated_at FROM user_settings WHERE user_id = ${userId}
  `;
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  return row ? rowToUserSettings(row) : null;
}

export async function updateUserSettings(
  userId: string,
  updates: { ytdBaseline?: number | null }
): Promise<UserSettings> {
  await ensureSchema();
  const run = await getSql();
  const now = Math.floor(Date.now() / 1000);
  await run`
    INSERT INTO user_settings (user_id, updated_at) VALUES (${userId}, ${now})
    ON CONFLICT (user_id) DO NOTHING
  `;
  if (updates.ytdBaseline !== undefined) {
    await run`
      UPDATE user_settings SET ytd_baseline = ${updates.ytdBaseline}, updated_at = ${now} WHERE user_id = ${userId}
    `;
  }
  const out = await getUserSettings(userId);
  if (!out) throw new Error("updateUserSettings: settings not found");
  return out;
}

export async function createPasswordResetToken(
  email: string
): Promise<string | null> {
  await ensureSchema();
  const run = await getSql();
  const normalizedEmail = email.toLowerCase().trim();
  const userRows = await run`SELECT id FROM users WHERE email = ${normalizedEmail}`;
  const user = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as Record<string, unknown>) : null;
  if (!user) return null;
  const userId = String(user.id);
  const rawToken = nanoid(32);
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + RESET_TOKEN_EXPIRY_MINUTES * 60;
  await run`
    UPDATE password_reset_tokens SET used_at = ${now} WHERE user_id = ${userId} AND used_at IS NULL
  `;
  await run`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (${id}, ${userId}, ${tokenHash}, ${expiresAt}, ${now})
  `;
  return rawToken;
}

export async function verifyPasswordResetToken(
  rawToken: string
): Promise<string | null> {
  await ensureSchema();
  const run = await getSql();
  const now = Math.floor(Date.now() / 1000);
  const rows = await run`
    SELECT id, user_id, token_hash, expires_at
    FROM password_reset_tokens
    WHERE used_at IS NULL AND expires_at > ${now}
    ORDER BY created_at DESC
  `;
  const list = Array.isArray(rows) ? rows : [];
  for (const t of list) {
    const r = t as Record<string, unknown>;
    const match = await bcrypt.compare(rawToken, String(r.token_hash));
    if (match) return String(r.user_id);
  }
  return null;
}

export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return { success: false, error: passwordValidation.error };
  }
  await ensureSchema();
  const run = await getSql();
  const now = Math.floor(Date.now() / 1000);
  const rows = await run`
    SELECT id, user_id, token_hash
    FROM password_reset_tokens
    WHERE used_at IS NULL AND expires_at > ${now}
    ORDER BY created_at DESC
  `;
  const list = Array.isArray(rows) ? rows : [];
  let matchedToken: { id: string; user_id: string } | null = null;
  for (const t of list) {
    const r = t as Record<string, unknown>;
    const match = await bcrypt.compare(rawToken, String(r.token_hash));
    if (match) {
      matchedToken = { id: String(r.id), user_id: String(r.user_id) };
      break;
    }
  }
  if (!matchedToken) {
    return { success: false, error: "重置链接无效或已过期" };
  }
  const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await run`UPDATE users SET password_hash = ${newHash} WHERE id = ${matchedToken.user_id}`;
  await run`UPDATE password_reset_tokens SET used_at = ${now} WHERE id = ${matchedToken.id}`;
  return { success: true };
}
