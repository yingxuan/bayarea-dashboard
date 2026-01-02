/**
 * Vercel Serverless Function: /api/food-recommendations
 * Returns food recommendations (奶茶/中餐/咖啡/甜品) from local seed data
 * 
 * Requirements:
 * - Cities: Cupertino / Sunnyvale / San Jose
 * - Categories: 奶茶 / 中餐 / 咖啡 / 甜品
 * - Always return 6 items
 * - Stable recommendations (not real-time search)
 * - Fallback: use yesterday's cache if needed
 * 
 * Strategy:
 * - Use local seed data (curated list of popular places)
 * - No external API calls (no Yelp, no Google CSE)
 * - Can be enhanced with Google Maps light scraping or Chinese platform mentions in future
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';
import { getFoodRecommendationsFromSeed, type FoodPlace } from '../shared/food-seed-data.js';
import {
  cache,
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  normalizeCachedResponse,
  normalizeStaleResponse,
  formatUpdatedAt,
} from './utils.js';

const FOOD_RECOMMENDATIONS_CACHE_TTL = CACHE_TTL.RESTAURANTS; // 12 hours

/**
 * Get food recommendations from local seed data
 * Returns stable 6 items, balanced across categories
 */
function getFoodRecommendations(): FoodPlace[] {
  return getFoodRecommendationsFromSeed();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'food-recommendations';
    
    // Check cache
    const cached = getCachedData(cacheKey, FOOD_RECOMMENDATIONS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, { name: 'Local Seed Data', url: 'https://maps.google.com' }, ttlMsToSeconds(FOOD_RECOMMENDATIONS_CACHE_TTL), 'food-recommendations');
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
      });
    }

    // Log cache bypass
    if (nocache) {
      console.log('[API /api/food-recommendations] Cache bypass requested via ?nocache=1');
    }

    // Get recommendations from local seed data
    const places = getFoodRecommendations();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(FOOD_RECOMMENDATIONS_CACHE_TTL);
    
    // Always return exactly 6 items from seed data
    const finalPlaces = places.slice(0, 6);
    
    const response: any = {
      // Standard response structure
      status: 'ok' as const,
      items: finalPlaces,
      count: finalPlaces.length,
      asOf: fetchedAtISO,
      source: { name: 'Local Seed Data', url: 'https://maps.google.com' },
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
    };

    // Update cache
    setCache(cacheKey, response);

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/food-recommendations] Error:', error);
    
    // Try to return stale cache (yesterday's data)
    const cacheKey = 'food-recommendations';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, { name: 'Local Seed Data', url: 'https://maps.google.com' }, ttlMsToSeconds(FOOD_RECOMMENDATIONS_CACHE_TTL), 'food-recommendations');
      
      // Ensure we have 6 items even from stale cache
      let items = staleData.items || [];
      if (!Array.isArray(items)) {
        items = [];
      }
      if (items.length < 6) {
        // If stale cache has less than 6, fallback to seed data
        items = getFoodRecommendations();
      }
      
      return res.status(200).json({
        ...staleData,
        items: items.slice(0, 6), // Ensure max 6
        count: Math.min(items.length, 6),
        cache_hit: true,
        stale: true,
      });
    }

    // Last resort: return seed data (should never fail, but just in case)
    const errorAtISO = new Date().toISOString();
    const fallbackPlaces = getFoodRecommendations();
    res.status(200).json({
      status: 'ok' as const,
      items: fallbackPlaces.slice(0, 6),
      count: Math.min(fallbackPlaces.length, 6),
      asOf: errorAtISO,
      source: { name: 'Local Seed Data', url: 'https://maps.google.com' },
      ttlSeconds: ttlMsToSeconds(FOOD_RECOMMENDATIONS_CACHE_TTL),
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: errorAtISO,
    });
  }
}
