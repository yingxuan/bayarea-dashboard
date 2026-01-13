import { Redis } from "@upstash/redis";

const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : null;

console.log(`[fortune] redis_enabled=${Boolean(redis)}`);

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const fallbackCache = new Map<string, CacheEntry>();
const fallbackLocks = new Map<string, number>();

function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt <= Date.now();
}

export const isRedisAvailable = Boolean(redis);

export async function getJSON(key: string): Promise<string | null> {
  if (redis) {
    console.log(`[fortune] redis_enabled=${Boolean(redis)} cacheKey=${key}`);
    return redis.get(key);
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
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds });
    return;
  }
  const expiresAt = Date.now() + ttlSeconds * 1000;
  fallbackCache.set(key, { value, expiresAt });
}

export async function acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
  if (redis) {
    const result = await redis.set(lockKey, "1", { nx: true, ex: ttlSeconds });
    return result === "OK";
  }
  const existing = fallbackLocks.get(lockKey);
  if (existing && existing > Date.now()) {
    return false;
  }
  fallbackLocks.set(lockKey, Date.now() + ttlSeconds * 1000);
  return true;
}
