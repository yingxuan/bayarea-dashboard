import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "cache.db");
const db = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);

  CREATE TABLE IF NOT EXISTS judgment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    score INTEGER,
    metadata TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_judgment_history_type_created 
  ON judgment_history(type, created_at);
`);

export interface CacheEntry {
  key: string;
  value: string;
  expires_at: number;
  created_at: number;
  updated_at: number;
}

export interface JudgmentEntry {
  id?: number;
  type: string;
  item_id: string;
  score?: number;
  metadata?: string;
  created_at: number;
}

class CacheManager {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /**
   * Get a value from cache
   * Returns null if key doesn't exist or is expired
   */
  get<T>(key: string): T | null {
    const now = Date.now();
    const stmt = this.db.prepare(
      "SELECT value FROM cache WHERE key = ? AND expires_at > ?"
    );
    const row = stmt.get(key, now) as { value: string } | undefined;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a value in cache with TTL in seconds
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const valueStr = JSON.stringify(value);

    const stmt = this.db.prepare(`
      INSERT INTO cache (key, value, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `);

    stmt.run(key, valueStr, expiresAt, now, now);
  }

  /**
   * Get stale cache (even if expired)
   * Useful as fallback when fresh data fetch fails
   */
  getStale<T>(key: string): T | null {
    const stmt = this.db.prepare("SELECT value FROM cache WHERE key = ?");
    const row = stmt.get(key) as { value: string } | undefined;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Delete a cache entry
   */
  delete(key: string): void {
    const stmt = this.db.prepare("DELETE FROM cache WHERE key = ?");
    stmt.run(key);
  }

  /**
   * Clean up expired cache entries
   */
  cleanExpired(): number {
    const now = Date.now();
    const stmt = this.db.prepare("DELETE FROM cache WHERE expires_at <= ?");
    const result = stmt.run(now);
    return result.changes;
  }

  /**
   * Record a judgment decision
   */
  recordJudgment(entry: Omit<JudgmentEntry, "id">): void {
    const stmt = this.db.prepare(`
      INSERT INTO judgment_history (type, item_id, score, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.type,
      entry.item_id,
      entry.score ?? null,
      entry.metadata ?? null,
      entry.created_at
    );
  }

  /**
   * Get judgment history for a type
   */
  getJudgmentHistory(
    type: string,
    limit: number = 100
  ): JudgmentEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM judgment_history
      WHERE type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(type, limit) as JudgmentEntry[];
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
export const cache = new CacheManager(db);

// Clean up expired entries every hour
setInterval(() => {
  const deleted = cache.cleanExpired();
  if (deleted > 0) {
    console.log(`[Cache] Cleaned up ${deleted} expired entries`);
  }
}, 60 * 60 * 1000);

export default cache;
