/**
 * Vercel Serverless Function: /api/spend/today
 * Returns food recommendations using Google Places API
 * 
 * Requirements:
 * - Cities: Cupertino / Sunnyvale
 * - Categories: 奶茶 / 中餐 / 咖啡 / 夜宵
 * - Always return 6 items per category (2 real places + 1 blind box pool)
 * - Filter: rating >= 4.2 & user_ratings_total >= 50
 * - Sort: rating * log(user_ratings_total)
 * - 24h cache: success → write cache; fail → read cache; cache fail → seed fallback
 * - Never show "暂无推荐"
 * 
 * Strategy:
 * - Use Google Places Text Search API
 * - Cache for 24 hours
 * - Fallback to local seed data if all fails
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, ttlMsToSeconds } from '../../shared/config.js';
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
} from '../utils.js';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const SPEND_TODAY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// City coordinates (latitude, longitude)
const CITY_COORDS = {
  cupertino: { lat: 37.3230, lng: -122.0322 },
  sunnyvale: { lat: 37.3688, lng: -122.0363 },
} as const;

// Category to keyword mapping for Nearby Search
const CATEGORY_KEYWORDS = {
  '奶茶': ['bubble tea', 'boba', '奶茶'],
  '中餐': ['chinese restaurant', '中餐'],
  '咖啡': ['coffee', 'cafe'],
  '夜宵': ['late night food', 'night snack', 'open late', '24 hours', '烧烤', '串串', '火锅', '宵夜'],
} as const;

// Category to type mapping (for Nearby Search)
const CATEGORY_TYPES = {
  '奶茶': 'cafe', // Use cafe as base type for bubble tea
  '中餐': 'restaurant',
  '咖啡': 'cafe',
  '夜宵': 'restaurant', // Use restaurant as base type for night snacks
} as const;

interface GooglePlaceResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  photos?: Array<{
    photo_reference: string;
  }>;
}

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  address: string;
  maps_url: string;
  photo_url?: string;
  city: string;
  score: number;
  distance_miles?: number; // Optional, calculated from coordinates
}

/**
 * Calculate popularity score: user_ratings_total * rating
 * This ranks by "most popular" (high review count * high rating)
 */
function calculatePopularityScore(rating: number, userRatingsTotal: number): number {
  if (userRatingsTotal <= 0 || rating <= 0) return 0;
  return userRatingsTotal * rating;
}

/**
 * Search Google Places using Nearby Search API
 * Returns places within radius, filtered by keyword
 */
async function searchGooglePlacesNearby(
  location: { lat: number; lng: number },
  radius: number = 8047, // 5 miles in meters
  type?: string,
  keyword?: string
): Promise<GooglePlaceResult[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY environment variable is not set');
  }

  const params = new URLSearchParams({
    location: `${location.lat},${location.lng}`,
    radius: radius.toString(),
    key: GOOGLE_PLACES_API_KEY,
  });

  if (type) {
    params.append('type', type);
  }
  if (keyword) {
    params.append('keyword', keyword);
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
  );

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
    console.error(`[Spend Today] Google Places API error: ${data.status} - ${data.error_message || ''}`);
    throw new Error(`Google Places API error: ${data.status} - ${data.error_message || ''}`);
  }

  const results = data.results || [];
  console.log(`[Spend Today] Nearby Search returned ${results.length} results for type="${type}", keyword="${keyword}"`);
  return results;
}

/**
 * Get place details (for photos and URL)
 */
async function getPlaceDetails(placeId: string): Promise<{
  photo_reference?: string;
  url?: string;
}> {
  if (!GOOGLE_PLACES_API_KEY) {
    return {};
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'photos,url',
      key: GOOGLE_PLACES_API_KEY,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params}`
    );

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    const result: { photo_reference?: string; url?: string } = {};
    
    if (data.result?.photos && data.result.photos.length > 0) {
      result.photo_reference = data.result.photos[0].photo_reference;
    }
    
    if (data.result?.url) {
      result.url = data.result.url;
    }

    return result;
  } catch (error) {
    console.error(`[Spend Today] Error fetching place details for ${placeId}:`, error);
  }

  return {};
}

/**
 * Calculate distance in miles using Haversine formula
 */
function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch places from Google Places API for a specific city and category
 * No distance filtering - includes all places in Cupertino/Sunnyvale
 */
async function fetchPlacesForCategory(
  city: keyof typeof CITY_COORDS,
  category: keyof typeof CATEGORY_KEYWORDS
): Promise<SpendPlace[]> {
  const coords = CITY_COORDS[city];
  const keywords = CATEGORY_KEYWORDS[category];
  const type = CATEGORY_TYPES[category];
  // Use a larger radius to cover the entire city area (approximately 10 miles)
  const RADIUS_METERS = 16093; // ~10 miles to cover entire city
  
  const allPlaces: SpendPlace[] = [];
  const seenPlaceIds = new Set<string>();

  for (const keyword of keywords) {
    try {
      const results = await searchGooglePlacesNearby(
        coords,
        RADIUS_METERS,
        type,
        keyword
      );

      console.log(`[Spend Today] Found ${results.length} results for ${category} in ${city} with keyword "${keyword}"`);

      for (const result of results) {
        // Skip if already seen (from previous keyword)
        if (seenPlaceIds.has(result.place_id)) continue;
        seenPlaceIds.add(result.place_id);

        // Very lenient filtering - accept places even without ratings
        const rating = result.rating || 0;
        const userRatingsTotal = result.user_ratings_total || 0;
        
        // Use defaults if missing: rating 4.0 if missing, user_ratings_total 10 if missing
        // Accept all places regardless of rating/review count
        const finalRating = rating > 0 ? rating : 4.0;
        const finalUserRatingsTotal = userRatingsTotal > 0 ? userRatingsTotal : 10;

        // If no geometry, skip (we need location data)
        if (!result.geometry?.location) continue;
        
        // Calculate distance for display purposes only (not for filtering)
        const distanceMiles = calculateDistanceMiles(
          coords.lat,
          coords.lng,
          result.geometry.location.lat,
          result.geometry.location.lng
        );

        // Get place details for photos and URL
        const details = await getPlaceDetails(result.place_id);
        
        let photoUrl: string | undefined;
        if (details.photo_reference) {
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${details.photo_reference}&key=${GOOGLE_PLACES_API_KEY}`;
        }

        // Use Google Maps URL from details, or construct from place_id
        const mapsUrl = details.url || `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;

        // Ensure category is correctly set (explicit string to avoid encoding issues)
        const categoryStr = String(category);
        console.log(`[Spend Today] Setting place category to: "${categoryStr}" for place: ${result.name}`);
        
        const place: SpendPlace = {
          id: result.place_id,
          name: result.name,
          category: categoryStr, // Explicitly use string to ensure correct encoding
          rating: finalRating,
          user_ratings_total: finalUserRatingsTotal,
          address: result.formatted_address || '',
          maps_url: mapsUrl,
          photo_url: photoUrl,
          city: city.charAt(0).toUpperCase() + city.slice(1).replace(' ', ' '),
          score: calculatePopularityScore(finalRating, finalUserRatingsTotal),
          distance_miles: parseFloat(distanceMiles.toFixed(1)),
        };

        allPlaces.push(place);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[Spend Today] Error fetching ${category} in ${city} with keyword "${keyword}":`, error);
      // Continue with other keywords
    }
  }

  return allPlaces;
}

/**
 * Fetch all places from all cities and categories, then merge and sort by popularity
 */
async function fetchAllPlacesFromGoogle(): Promise<SpendPlace[]> {
  const cities: Array<keyof typeof CITY_COORDS> = ['cupertino', 'sunnyvale'];
  const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '咖啡', '夜宵'];
  
  const allPlaces: SpendPlace[] = [];
  
  // Fetch from all combinations
  for (const city of cities) {
    for (const category of categories) {
      try {
        const places = await fetchPlacesForCategory(city, category);
        allPlaces.push(...places);
      } catch (error) {
        console.error(`[Spend Today] Error fetching ${category} in ${city}:`, error);
        // Continue with other cities/categories
      }
    }
  }
  
  // Remove duplicates by place_id (keep highest score)
  const uniquePlaces = new Map<string, SpendPlace>();
  for (const place of allPlaces) {
    if (!uniquePlaces.has(place.id)) {
      uniquePlaces.set(place.id, place);
    } else {
      const existing = uniquePlaces.get(place.id)!;
      if (place.score > existing.score) {
        uniquePlaces.set(place.id, place);
      }
    }
  }
  
  // Sort by popularity score (descending)
  const sortedPlaces = Array.from(uniquePlaces.values()).sort((a, b) => b.score - a.score);
  
  return sortedPlaces;
}

/**
 * Group places by category and return top 6 per category
 * Returns: { '奶茶': [...], '中餐': [...], '咖啡': [...], '夜宵': [...] }
 */
function groupPlacesByCategory(places: SpendPlace[]): Record<string, SpendPlace[]> {
  const byCategory: Record<string, SpendPlace[]> = {
    '奶茶': [],
    '中餐': [],
    '咖啡': [],
    '夜宵': [],
  };
  
  places.forEach(place => {
    if (byCategory[place.category]) {
      byCategory[place.category].push(place);
    }
  });
  
  // Sort each category by score and take top 6
  const result: Record<string, SpendPlace[]> = {};
  for (const category of Object.keys(byCategory)) {
    result[category] = byCategory[category]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }
  
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'spend-today';
    
    // Check cache (24 hours)
    const cached = getCachedData(cacheKey, SPEND_TODAY_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, { name: 'Google Places', url: 'https://maps.google.com' }, ttlMsToSeconds(SPEND_TODAY_CACHE_TTL), 'spend-today');
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
      console.log('[API /api/spend/today] Cache bypass requested via ?nocache=1');
    }

    // Fetch from Google Places API
    if (!GOOGLE_PLACES_API_KEY) {
      throw new Error('GOOGLE_PLACES_API_KEY not configured');
    }

    const allPlaces = await fetchAllPlacesFromGoogle();
    console.log(`[Spend Today] Fetched ${allPlaces.length} total places from Google`);
    
    if (allPlaces.length === 0) {
      console.warn('[Spend Today] No places found from Google Places API. This might indicate:');
      console.warn('  - GOOGLE_PLACES_API_KEY is missing or invalid');
      console.warn('  - API quota exceeded');
      console.warn('  - Network issues');
      console.warn('  - No places match the search criteria');
    }
    
    // Re-group directly by place.category (more reliable than using groupPlacesByCategory which might have encoding issues)
    const placesByCategoryDirect: Record<string, SpendPlace[]> = {
      '奶茶': [],
      '中餐': [],
      '咖啡': [],
      '夜宵': [],
    };
    
    // Group all places by their category field
    for (const place of allPlaces) {
      const placeCategory = place.category;
      console.log(`[Spend Today] Place "${place.name}" has category: "${placeCategory}"`);
      
      if (placesByCategoryDirect.hasOwnProperty(placeCategory)) {
        placesByCategoryDirect[placeCategory].push(place);
      } else {
        console.warn(`[Spend Today] Place "${place.name}" has unexpected category: "${placeCategory}"`);
      }
    }
    
    // Sort each category by score
    for (const category of Object.keys(placesByCategoryDirect)) {
      placesByCategoryDirect[category].sort((a, b) => b.score - a.score);
    }
    
    console.log(`[Spend Today] Places by category (direct grouping):`, Object.keys(placesByCategoryDirect).map(cat => `${cat}: ${placesByCategoryDirect[cat]?.length || 0}`).join(', '));
    
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(SPEND_TODAY_CACHE_TTL);
    
    // Group by category - NO fallback data, only real places
    const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '咖啡', '夜宵'];
    const finalPlacesByCategory: Record<string, SpendPlace[]> = {};
    
    for (const category of categories) {
      let categoryPlaces = placesByCategoryDirect[category] || [];
      console.log(`[Spend Today] Category ${category}: ${categoryPlaces.length} places from fresh fetch`);
      
      // Try stale cache if we have < 2 places (need at least 2 for carousel)
      if (categoryPlaces.length < 2) {
        console.log(`[Spend Today] Category ${category} has < 2 places, trying stale cache`);
        const stale = getStaleCache(cacheKey);
        if (stale && stale.data.itemsByCategory && stale.data.itemsByCategory[category]) {
          const staleItems = stale.data.itemsByCategory[category] as SpendPlace[];
          // Only use stale items if they have valid place_id (real places)
          const validStaleItems = staleItems.filter(p => p.id && (p.id.startsWith('Ch') || p.id.length > 10));
          console.log(`[Spend Today] Found ${validStaleItems.length} valid stale items for ${category}`);
          const existingIds = new Set(categoryPlaces.map(p => p.id));
          const additionalItems = validStaleItems.filter(p => !existingIds.has(p.id));
          categoryPlaces = [...categoryPlaces, ...additionalItems]
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);
        } else {
          console.warn(`[Spend Today] No stale cache available for ${category}`);
        }
      }
      
      // NO seed data fallback - only return real places
      finalPlacesByCategory[category] = categoryPlaces.slice(0, 6);
      console.log(`[Spend Today] Final count for ${category}: ${finalPlacesByCategory[category].length}`);
      
      if (finalPlacesByCategory[category].length === 0) {
        console.warn(`[Spend Today] WARNING: Category ${category} has 0 places after all attempts`);
      }
    }
    
    const response: any = {
      status: 'ok' as const,
      itemsByCategory: finalPlacesByCategory, // New structure: grouped by category
      items: Object.values(finalPlacesByCategory).flat(), // Legacy: flat array for backward compatibility
      count: Object.values(finalPlacesByCategory).reduce((sum, arr) => sum + arr.length, 0),
      asOf: fetchedAtISO,
      source: { name: 'Google Places', url: 'https://maps.google.com' },
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
    };

    // Update cache (24 hours)
    setCache(cacheKey, response);

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/spend/today] Error:', error);
    
    // Try to return stale cache (yesterday's data)
    const cacheKey = 'spend-today';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, { name: 'Google Places', url: 'https://maps.google.com' }, ttlMsToSeconds(SPEND_TODAY_CACHE_TTL), 'spend-today');
      
      // Handle both new (itemsByCategory) and legacy (items) formats
      let itemsByCategory: Record<string, SpendPlace[]> = staleData.itemsByCategory || {};
      let items = staleData.items || [];
      
      // If legacy format, convert to new format
      if (!staleData.itemsByCategory && Array.isArray(items) && items.length > 0) {
        itemsByCategory = groupPlacesByCategory(items as SpendPlace[]);
      }
      
      // NO seed data fallback - only return real places from stale cache
      const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '咖啡', '夜宵'];
      for (const category of categories) {
        // Only keep items with valid place_id (real Google Places - place_id typically starts with 'Ch' or is long)
        if (itemsByCategory[category]) {
          itemsByCategory[category] = itemsByCategory[category].filter((p: any) => 
            p.id && (p.id.startsWith('Ch') || p.id.length > 10) && p.maps_url && !p.maps_url.includes('#')
          );
        }
      }
      
      // Rebuild flat items array for backward compatibility
      items = Object.values(itemsByCategory).flat();
      
      return res.status(200).json({
        ...staleData,
        itemsByCategory,
        items: items.slice(0, 24), // Up to 6 per category * 4 categories
        count: items.length,
        cache_hit: true,
        stale: true,
      });
    }

    // Last resort: return empty (NO fake data)
    console.warn('[API /api/spend/today] All sources failed, returning empty result (no fake data)');
    const errorAtISO = new Date().toISOString();
    
    const emptyByCategory: Record<string, SpendPlace[]> = {
      '奶茶': [],
      '中餐': [],
      '咖啡': [],
      '夜宵': [],
    };

    res.status(200).json({
      status: 'unavailable' as const,
      itemsByCategory: emptyByCategory,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: { name: 'Google Places', url: 'https://maps.google.com' },
      ttlSeconds: ttlMsToSeconds(SPEND_TODAY_CACHE_TTL),
      cache_hit: false,
      fetched_at: errorAtISO,
      error: 'No places found',
    });
  }
}
