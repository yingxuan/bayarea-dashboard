/**
 * In-Memory Cache for Market Data and News
 * Provides TTL-based caching with stale-while-revalidate support
 */

interface CacheEntry {
  value: any;
  updated_at: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Set cache entry with TTL (in seconds)
 */
export function setCache(key: string, value: any, ttl: number): void {
  cache.set(key, {
    value,
    updated_at: Date.now(),
    ttl,
  });
}

/**
 * Get cache entry
 * Returns null if not found or expired
 */
export function getCache(key: string): any | null {
  const entry = cache.get(key);
  
  if (!entry) {
    return null;
  }
  
  const age = Date.now() - entry.updated_at;
  const ttlMs = entry.ttl * 1000;
  
  if (age > ttlMs) {
    // Cache expired
    return null;
  }
  
  return entry.value;
}

/**
 * Get stale cache (even if expired)
 * Used for fallback when fresh data fetch fails
 */
export function getStaleCache(key: string): any | null {
  const entry = cache.get(key);
  
  if (!entry) {
    return null;
  }
  
  return entry.value;
}

/**
 * Clear all cache entries
 */
export function clearCache(): void {
  cache.clear();
}
