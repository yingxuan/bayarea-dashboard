import { kv } from "@vercel/kv";

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const fallbackCache = new Map<string, CacheEntry>();
const fallbackLocks = new Map<string, number>();
const hasKVEnv = Boolean(process.env.KV_REST_API_URL) && Boolean(process.env.KV_REST_API_TOKEN);

function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt <= Date.now();
}

export const isRedisAvailable = hasKVEnv;

export async function getJSON(key: string): Promise<string | null> {
  if (hasKVEnv) {
    const value = await kv.get<string>(key);
    return value ?? null;
  }
  const entry = fallbackCache.get(key);
  if (!entry) return null;
  if (isExpired(entry)) {
    fallbackCache.delete(key);
    return null;
  }
  return entry.value;
}

export async function setJSON(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (hasKVEnv) {
    await kv.set(key, value, { ex: ttlSeconds });
    const verify = await kv.get(key);
    const isString = typeof verify === "string";
    const len = isString ? verify.length : undefined;
    console.log("[fortune] kv_write_verify", {
      key,
      ok: !!verify,
      type: typeof verify,
      len: len ?? (verify ? JSON.stringify(verify).length : undefined),
    });
    return;
  }
  const expiresAt = Date.now() + ttlSeconds * 1000;
  fallbackCache.set(key, { value, expiresAt });
}

export async function acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
  if (hasKVEnv) {
    const result = await kv.set(lockKey, "1", { nx: true, ex: ttlSeconds });
    return result === "OK";
  }
  const existing = fallbackLocks.get(lockKey);
  if (existing && existing > Date.now()) {
    return false;
  }
  fallbackLocks.set(lockKey, Date.now() + ttlSeconds * 1000);
  return true;
}

export async function releaseLock(lockKey: string): Promise<void> {
  if (hasKVEnv) {
    await kv.del(lockKey);
    return;
  }
  fallbackLocks.delete(lockKey);
}

export async function deleteJSON(key: string): Promise<void> {
  if (hasKVEnv) {
    await kv.del(key);
    return;
  }
  fallbackCache.delete(key);
}
