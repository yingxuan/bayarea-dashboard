/**
 * Shared utilities for Vercel serverless API functions
 * - CORS handling
 * - Cache management
 * - Error handling
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ttlMsToSeconds } from '../shared/config.js';

/**
 * In-memory cache store (shared across all API functions)
 */
export const cache = new Map<string, { data: any; timestamp: number }>();

/**
 * Set CORS headers for API responses
 */
export function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Handle OPTIONS preflight request
 */
export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Check if cache bypass is requested
 */
export function isCacheBypass(req: VercelRequest): boolean {
  return req.query.nocache === '1' || req.query.nocache === 'true';
}

/**
 * Calculate cache metadata (age and expiry)
 */
export function calculateCacheMetadata(
  cached: { data: any; timestamp: number } | undefined,
  cacheTtlMs: number
): { cacheAgeSeconds: number; cacheExpiresInSeconds: number } {
  const now = Date.now();
  let cacheAgeSeconds = 0;
  let cacheExpiresInSeconds = Math.floor(cacheTtlMs / 1000);

  if (cached) {
    cacheAgeSeconds = Math.floor((now - cached.timestamp) / 1000);
    const remainingMs = cacheTtlMs - (now - cached.timestamp);
    cacheExpiresInSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  }

  return { cacheAgeSeconds, cacheExpiresInSeconds };
}

/**
 * Check if cached data is still valid
 */
export function isCacheValid(
  cached: { data: any; timestamp: number } | undefined,
  cacheTtlMs: number,
  nocache: boolean
): boolean {
  if (nocache || !cached) return false;
  const now = Date.now();
  return now - cached.timestamp < cacheTtlMs;
}

/**
 * Get cached data if valid, otherwise return null
 */
export function getCachedData(
  cacheKey: string,
  cacheTtlMs: number,
  nocache: boolean
): { data: any; cacheAgeSeconds: number; cacheExpiresInSeconds: number } | null {
  const cached = cache.get(cacheKey);
  if (!isCacheValid(cached, cacheTtlMs, nocache)) {
    return null;
  }

  const { cacheAgeSeconds, cacheExpiresInSeconds } = calculateCacheMetadata(cached, cacheTtlMs);
  return {
    data: cached!.data,
    cacheAgeSeconds,
    cacheExpiresInSeconds,
  };
}

/**
 * Set data in cache
 */
export function setCache(cacheKey: string, data: any): void {
  cache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Get stale cache data (for error fallback)
 */
export function getStaleCache(cacheKey: string): { data: any } | null {
  const stale = cache.get(cacheKey);
  return stale ? { data: stale.data } : null;
}

/**
 * Normalize cached response to standard format
 * Handles migration from old cache format to new format
 */
export function normalizeCachedResponse(
  cachedData: any,
  defaultSource: { name: string; url: string },
  defaultTtlSeconds: number,
  legacyItemsKey?: string
): void {
  if (!cachedData.status) {
    cachedData.status = cachedData.items?.length > 0 ? 'ok' : (cachedData.error ? 'unavailable' : 'ok');
    cachedData.items = cachedData.items || cachedData[legacyItemsKey || 'items'] || [];
    cachedData.count = cachedData.count ?? cachedData.items.length;
    cachedData.asOf = cachedData.asOf || cachedData.fetched_at || new Date().toISOString();
    cachedData.source = cachedData.source || defaultSource;
    cachedData.ttlSeconds = cachedData.ttlSeconds || defaultTtlSeconds;
  }
}

/**
 * Normalize stale cache response to standard format
 */
export function normalizeStaleResponse(
  staleData: any,
  defaultSource: { name: string; url: string },
  defaultTtlSeconds: number,
  legacyItemsKey?: string
): void {
  if (!staleData.status) {
    staleData.status = staleData.items?.length > 0 ? 'stale' : 'unavailable';
    staleData.items = staleData.items || staleData[legacyItemsKey || 'items'] || [];
    staleData.count = staleData.count ?? staleData.items.length;
    staleData.asOf = staleData.asOf || staleData.fetched_at || new Date().toISOString();
    staleData.source = staleData.source || defaultSource;
    staleData.ttlSeconds = staleData.ttlSeconds || defaultTtlSeconds;
  } else {
    staleData.status = 'stale'; // Override to stale if we're using stale cache
  }
}

/**
 * Format updated_at timestamp (legacy field)
 */
export function formatUpdatedAt(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
