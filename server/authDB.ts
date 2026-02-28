/**
 * Authentication Database Module
 * Manages users, holdings, and settings tables
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import * as bcrypt from "bcrypt";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel ? '/tmp/cache.db' : path.join(__dirname, "..", "cache.db");
const db = new Database(dbPath);

// Initialize auth tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    last_login_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  -- User holdings table
  CREATE TABLE IF NOT EXISTS user_holdings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    shares REAL NOT NULL,
    avg_cost REAL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, ticker)
  );

  CREATE INDEX IF NOT EXISTS idx_user_holdings_user_id ON user_holdings(user_id);

  -- Password reset tokens table
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

  -- User settings table
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ytd_baseline REAL,
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// Types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
  last_login_at: number | null;
}

export interface UserPublic {
  id: string;
  email: string;
  display_name: string | null;
  created_at: number;
}

export interface UserHolding {
  id: string;
  user_id: string;
  ticker: string;
  shares: number;
  avg_cost: number | null;
  created_at: number;
  updated_at: number;
}

export interface UserSettings {
  user_id: string;
  ytd_baseline: number | null;
  updated_at: number;
}

// Password validation
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const BCRYPT_COST = 12;

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `密码至少需要 ${PASSWORD_MIN_LENGTH} 位` };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return { valid: false, error: "密码必须包含大小写字母和数字" };
  }
  return { valid: true };
}

// User operations
export async function createUser(
  email: string,
  password: string,
  displayName?: string
): Promise<UserPublic> {
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error);
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if user exists
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    throw new Error("该邮箱已被注册");
  }

  const id = nanoid();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, normalizedEmail, passwordHash, displayName || null, now);

  // Initialize user settings
  db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(id);

  return {
    id,
    email: normalizedEmail,
    display_name: displayName || null,
    created_at: now,
  };
}

export async function verifyUser(
  email: string,
  password: string
): Promise<UserPublic | null> {
  const normalizedEmail = email.toLowerCase().trim();

  const user = db.prepare(`
    SELECT id, email, password_hash, display_name, created_at
    FROM users WHERE email = ?
  `).get(normalizedEmail) as User | undefined;

  if (!user) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return null;
  }

  // Update last login
  const now = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, user.id);

  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    created_at: user.created_at,
  };
}

export function getUserById(id: string): UserPublic | null {
  const user = db.prepare(`
    SELECT id, email, display_name, created_at
    FROM users WHERE id = ?
  `).get(id) as UserPublic | undefined;

  return user || null;
}

export function getUserByEmail(email: string): UserPublic | null {
  const normalizedEmail = email.toLowerCase().trim();
  const user = db.prepare(`
    SELECT id, email, display_name, created_at
    FROM users WHERE email = ?
  `).get(normalizedEmail) as UserPublic | undefined;

  return user || null;
}

// Holdings operations
export function getUserHoldings(userId: string): UserHolding[] {
  const holdings = db.prepare(`
    SELECT id, user_id, ticker, shares, avg_cost, created_at, updated_at
    FROM user_holdings WHERE user_id = ?
    ORDER BY ticker ASC
  `).all(userId) as UserHolding[];

  return holdings;
}

export function upsertHolding(
  userId: string,
  ticker: string,
  shares: number,
  avgCost?: number
): UserHolding {
  const normalizedTicker = ticker.toUpperCase().trim();
  const now = Math.floor(Date.now() / 1000);
  const id = nanoid();

  const stmt = db.prepare(`
    INSERT INTO user_holdings (id, user_id, ticker, shares, avg_cost, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, ticker) DO UPDATE SET
      shares = excluded.shares,
      avg_cost = excluded.avg_cost,
      updated_at = excluded.updated_at
  `);

  stmt.run(id, userId, normalizedTicker, shares, avgCost ?? null, now, now);

  // Return the holding (either inserted or updated)
  const holding = db.prepare(`
    SELECT id, user_id, ticker, shares, avg_cost, created_at, updated_at
    FROM user_holdings WHERE user_id = ? AND ticker = ?
  `).get(userId, normalizedTicker) as UserHolding;

  return holding;
}

export function deleteHolding(userId: string, ticker: string): boolean {
  const normalizedTicker = ticker.toUpperCase().trim();
  const result = db.prepare(`
    DELETE FROM user_holdings WHERE user_id = ? AND ticker = ?
  `).run(userId, normalizedTicker);

  return result.changes > 0;
}

export function replaceAllHoldings(
  userId: string,
  holdings: Array<{ ticker: string; shares: number; avgCost?: number }>
): UserHolding[] {
  const now = Math.floor(Date.now() / 1000);

  // Use transaction for atomicity
  const transaction = db.transaction(() => {
    // Delete all existing holdings
    db.prepare("DELETE FROM user_holdings WHERE user_id = ?").run(userId);

    // Insert new holdings
    const insertStmt = db.prepare(`
      INSERT INTO user_holdings (id, user_id, ticker, shares, avg_cost, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const h of holdings) {
      if (h.shares > 0) {
        insertStmt.run(
          nanoid(),
          userId,
          h.ticker.toUpperCase().trim(),
          h.shares,
          h.avgCost ?? null,
          now,
          now
        );
      }
    }
  });

  transaction();

  return getUserHoldings(userId);
}

// Settings operations
export function getUserSettings(userId: string): UserSettings | null {
  const settings = db.prepare(`
    SELECT user_id, ytd_baseline, updated_at
    FROM user_settings WHERE user_id = ?
  `).get(userId) as UserSettings | undefined;

  return settings || null;
}

export function updateUserSettings(
  userId: string,
  updates: { ytdBaseline?: number | null }
): UserSettings {
  const now = Math.floor(Date.now() / 1000);

  // Ensure settings row exists
  db.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)
  `).run(userId);

  if (updates.ytdBaseline !== undefined) {
    db.prepare(`
      UPDATE user_settings SET ytd_baseline = ?, updated_at = ? WHERE user_id = ?
    `).run(updates.ytdBaseline, now, userId);
  }

  return getUserSettings(userId)!;
}

// Password reset operations
const RESET_TOKEN_EXPIRY_MINUTES = 30;

/**
 * Create a password reset token for a user (identified by email).
 * Invalidates any existing unused tokens for the same user.
 * Returns the raw token (to be sent via email) or null if email not found.
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail) as { id: string } | undefined;
  if (!user) return null;

  const rawToken = nanoid(32);
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + RESET_TOKEN_EXPIRY_MINUTES * 60;

  const transaction = db.transaction(() => {
    // Invalidate existing unused tokens for this user
    db.prepare(
      "UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL"
    ).run(now, user.id);

    db.prepare(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, user.id, tokenHash, expiresAt, now);
  });

  transaction();
  return rawToken;
}

/**
 * Verify a password reset token is valid (exists, not expired, not used).
 * Returns the user_id if valid, null otherwise.
 */
export async function verifyPasswordResetToken(rawToken: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);

  const tokens = db.prepare(
    "SELECT id, user_id, token_hash, expires_at FROM password_reset_tokens WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC"
  ).all(now) as Array<{ id: string; user_id: string; token_hash: string; expires_at: number }>;

  for (const t of tokens) {
    const match = await bcrypt.compare(rawToken, t.token_hash);
    if (match) return t.user_id;
  }

  return null;
}

/**
 * Reset a user's password using a valid reset token.
 * Marks the token as used.
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return { success: false, error: passwordValidation.error };
  }

  const now = Math.floor(Date.now() / 1000);

  const tokens = db.prepare(
    "SELECT id, user_id, token_hash FROM password_reset_tokens WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC"
  ).all(now) as Array<{ id: string; user_id: string; token_hash: string }>;

  let matchedToken: { id: string; user_id: string } | null = null;
  for (const t of tokens) {
    const match = await bcrypt.compare(rawToken, t.token_hash);
    if (match) {
      matchedToken = { id: t.id, user_id: t.user_id };
      break;
    }
  }

  if (!matchedToken) {
    return { success: false, error: "重置链接无效或已过期" };
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  const transaction = db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, matchedToken!.user_id);
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(now, matchedToken!.id);
  });

  transaction();
  return { success: true };
}

// Export database for direct access if needed
export { db as authDb };
