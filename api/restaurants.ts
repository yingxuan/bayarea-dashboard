/**
 * Vercel Serverless Function: /api/restaurants
 * Fetches real Chinese restaurants near Cupertino using Yelp Fusion API
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, API_URLS, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';
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

const YELP_API_KEY = process.env.YELP_API_KEY!;
const RESTAURANTS_CACHE_TTL = CACHE_TTL.RESTAURANTS;

interface Restaurant {
  id: string;
  name: string;
  rating: number;
  review_count: number;
  price_level: string;
  cuisine: string;
  address: string;
  distance_miles: number;
  photo_url: string;
  url: string; // Yelp business URL
}

async function fetchYelpRestaurants(): Promise<Restaurant[]> {
  if (!YELP_API_KEY) {
    throw new Error('YELP_API_KEY environment variable is not set');
  }

  // Search for Chinese restaurants near Cupertino (Monta Vista HS area)
  const params = new URLSearchParams({
    term: 'Chinese restaurant',
    latitude: '37.3230',  // Cupertino / Monta Vista HS
    longitude: '-122.0322',
    radius: '8000', // 5 miles in meters
    categories: 'chinese,dimsum,szechuan,cantonese,taiwanese',
    sort_by: 'rating',
    limit: '20',
  });

  const response = await fetch(`${API_URLS.YELP}?${params}`, {
    headers: {
      'Authorization': `Bearer ${YELP_API_KEY}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Yelp API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  return (data.businesses || []).map((business: any) => ({
    id: business.id,
    name: business.name,
    rating: business.rating,
    review_count: business.review_count,
    price_level: business.price || '$$',
    cuisine: business.categories?.[0]?.title || 'Chinese',
    address: business.location?.display_address?.join(', ') || '',
    distance_miles: parseFloat((business.distance / 1609.34).toFixed(1)), // meters to miles
    photo_url: business.image_url || '',
    url: business.url, // Yelp business page URL
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'restaurants';
    
    // Check cache
    const cached = getCachedData(cacheKey, RESTAURANTS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.YELP, ttlMsToSeconds(RESTAURANTS_CACHE_TTL), 'restaurants');
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
      console.log('[API /api/restaurants] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data
    const restaurants = await fetchYelpRestaurants();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(RESTAURANTS_CACHE_TTL);
    
    const response: any = {
      // Standard response structure
      status: 'ok' as const,
      items: restaurants.slice(0, 6), // Top 6 restaurants
      count: restaurants.slice(0, 6).length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.YELP,
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      // Legacy fields for backward compatibility
      restaurants: restaurants.slice(0, 6),
      updated_at: formatUpdatedAt(),
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
      age: 0,
      expiry: ttlSeconds,
    };

    // Update cache
    setCache(cacheKey, response);

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/restaurants] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'restaurants';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.YELP, ttlMsToSeconds(RESTAURANTS_CACHE_TTL), 'restaurants');
      return res.status(200).json({
        ...staleData,
        cache_hit: true,
        stale: true,
      });
    }

    // If YELP_API_KEY is missing, return empty array with helpful message
    if (error instanceof Error && error.message.includes('YELP_API_KEY')) {
      const errorAtISO = new Date().toISOString();
      return res.status(200).json({
        status: 'unavailable' as const,
        items: [],
        count: 0,
        asOf: errorAtISO,
        source: SOURCE_INFO.YELP,
        ttlSeconds: 0,
        error: 'YELP_API_KEY not configured',
        message: 'To enable restaurant data, add YELP_API_KEY to Vercel environment variables.',
        cache_hit: false,
        fetched_at: errorAtISO,
        // Legacy fields
        restaurants: [],
        updated_at: new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      });
    }

    const errorAtISO = new Date().toISOString();
    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: SOURCE_INFO.YELP,
      ttlSeconds: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: errorAtISO,
      // Legacy fields
      restaurants: [],
      updated_at: formatUpdatedAt(),
    });
  }
}
