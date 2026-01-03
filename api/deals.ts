/**
 * Vercel Serverless Function: /api/deals
 * Returns deals (currently disabled - Reddit API removed)
 * 
 * Note: Reddit API has been removed. This endpoint now returns empty data or stale cache.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, ttlMsToSeconds } from '../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  getStaleCache,
  normalizeCachedResponse,
  normalizeStaleResponse,
  formatUpdatedAt,
} from './utils.js';

const DEALS_CACHE_TTL = CACHE_TTL.DEALS;

interface Deal {
  id: string;
  title: string;
  url: string;
  external_url?: string;
  store: string;
  score: number;
  comments: number;
  time_ago: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  // Debug: Add Cache-Control: no-store to prevent edge/CDN caching during debugging
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (handleOptions(req, res)) {
    return;
  }
  
  // Get build version fingerprint for debugging
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA 
    ? process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7)
    : process.env.VERCEL_DEPLOYMENT_ID || 'local';

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'deals';
    
    // Check cache
    const cached = getCachedData(cacheKey, DEALS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, { name: 'Cached Data', url: '' }, ttlMsToSeconds(DEALS_CACHE_TTL), 'deals');
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
        build: buildId, // Build fingerprint for debugging
      });
    }

    // Log cache bypass
    if (nocache) {
      console.log('[API /api/deals] Cache bypass requested via ?nocache=1');
    }

    // Reddit API has been removed - try to return stale cache if available
    console.log('[API /api/deals] Reddit API removed, checking for stale cache');
    const stale = getStaleCache(cacheKey);
    
    if (stale && stale.data && stale.data.items && stale.data.items.length > 0) {
      console.log('[API /api/deals] Returning stale cache (Reddit API disabled)');
      const staleData = stale.data;
      normalizeStaleResponse(staleData, { name: 'Cached Data', url: '' }, ttlMsToSeconds(DEALS_CACHE_TTL), 'deals');
      return res.status(200).json({
        ...staleData,
        cache_hit: true,
        stale: true,
        note: 'Reddit API has been removed. Showing cached data.',
        build: buildId, // Build fingerprint for debugging
      });
    }

    // No cache available - return empty response
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(DEALS_CACHE_TTL);
    
    const response: any = {
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: fetchedAtISO,
      source: { name: 'Disabled', url: '' },
      ttlSeconds: 0,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      note: 'Reddit API has been removed. No data available.',
      build: buildId, // Build fingerprint for debugging
      // Legacy fields for backward compatibility
      deals: [],
      updated_at: formatUpdatedAt(),
      cache_mode: 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: 0,
      age: 0,
      expiry: 0,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/deals] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'deals';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, { name: 'Cached Data', url: '' }, ttlMsToSeconds(DEALS_CACHE_TTL), 'deals');
      return res.status(200).json({
        ...staleData,
        cache_hit: true,
        stale: true,
        note: 'Reddit API has been removed. Showing cached data.',
        build: buildId, // Build fingerprint for debugging
      });
    }

    const errorAtISO = new Date().toISOString();
    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: { name: 'Disabled', url: '' },
      ttlSeconds: 0,
      error: 'Reddit API has been removed',
      cache_hit: false,
      fetched_at: errorAtISO,
      note: 'Reddit API has been removed. No data available.',
      build: buildId, // Build fingerprint for debugging
      // Legacy fields
      deals: [],
      updated_at: formatUpdatedAt(),
    });
  }
}
