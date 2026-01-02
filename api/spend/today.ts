/**
 * Vercel Serverless Function: /api/spend/today
 * Returns food recommendations using Google Places API
 * 
 * Requirements:
 * - Cities: Cupertino / Sunnyvale / San Jose
 * - Categories: 奶茶 / 中餐 / 咖啡 / 甜品
 * - Always return 6 items (2奶茶, 2中餐, 1咖啡, 1甜品)
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
import { getFoodRecommendationsFromSeed, type FoodPlace } from '../../shared/food-seed-data.js';
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
  'san jose': { lat: 37.3382, lng: -121.8863 },
} as const;

// Category to search query mapping
const CATEGORY_QUERIES = {
  '奶茶': ['bubble tea', 'boba'],
  '中餐': ['chinese restaurant'],
  '咖啡': ['coffee'],
  '甜品': ['dessert', 'bakery'],
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
 * Calculate score for sorting: rating * log(user_ratings_total)
 */
function calculateScore(rating: number, userRatingsTotal: number): number {
  if (userRatingsTotal <= 0) return 0;
  return rating * Math.log(userRatingsTotal);
}

/**
 * Search Google Places using Text Search API
 */
async function searchGooglePlaces(
  query: string,
  location: { lat: number; lng: number },
  radius: number = 8047 // 5 miles in meters
): Promise<GooglePlaceResult[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY environment variable is not set');
  }

  const params = new URLSearchParams({
    query: query,
    location: `${location.lat},${location.lng}`,
    radius: radius.toString(),
    key: GOOGLE_PLACES_API_KEY,
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
  );

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
    throw new Error(`Google Places API error: ${data.status} - ${data.error_message || ''}`);
  }

  return data.results || [];
}

/**
 * Get place details (for photo reference)
 */
async function getPlaceDetails(placeId: string): Promise<{ photo_reference?: string }> {
  if (!GOOGLE_PLACES_API_KEY) {
    return {};
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'photo',
      key: GOOGLE_PLACES_API_KEY,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params}`
    );

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    if (data.result?.photos && data.result.photos.length > 0) {
      return { photo_reference: data.result.photos[0].photo_reference };
    }
  } catch (error) {
    console.error(`[Spend Today] Error fetching place details for ${placeId}:`, error);
  }

  return {};
}

/**
 * Fetch places from Google Places API for a specific city and category
 */
async function fetchPlacesForCategory(
  city: keyof typeof CITY_COORDS,
  category: keyof typeof CATEGORY_QUERIES
): Promise<SpendPlace[]> {
  const coords = CITY_COORDS[city];
  const queries = CATEGORY_QUERIES[category];
  const allPlaces: SpendPlace[] = [];

  for (const query of queries) {
    try {
      const results = await searchGooglePlaces(
        `${query} ${city}`,
        coords
      );

      for (const result of results) {
        const rating = result.rating || 0;
        const userRatingsTotal = result.user_ratings_total || 0;

        // Filter: rating >= 4.2 & user_ratings_total >= 50
        // If fields missing, be lenient but prioritize those with data
        if (rating > 0 && rating < 4.2) continue;
        if (userRatingsTotal > 0 && userRatingsTotal < 50) continue;
        // If both missing, skip (we want quality data)
        if (rating === 0 && userRatingsTotal === 0) continue;

        // Get photo if available
        let photoUrl: string | undefined;
        if (result.photos && result.photos.length > 0) {
          const photoRef = result.photos[0].photo_reference;
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
        }

        // Calculate distance using Haversine formula (accurate distance between two lat/lng points)
        let distanceMiles = 0;
        if (result.geometry?.location) {
          const R = 3959; // Earth radius in miles
          const dLat = (result.geometry.location.lat - coords.lat) * Math.PI / 180;
          const dLng = (result.geometry.location.lng - coords.lng) * Math.PI / 180;
          const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(coords.lat * Math.PI / 180) * Math.cos(result.geometry.location.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distanceMiles = R * c;
        }

        const place: SpendPlace = {
          id: result.place_id,
          name: result.name,
          category: category,
          rating: rating || 4.0, // Default if missing
          user_ratings_total: userRatingsTotal || 50, // Default if missing
          address: result.formatted_address || '',
          maps_url: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
          photo_url: photoUrl,
          city: city.charAt(0).toUpperCase() + city.slice(1).replace(' ', ' '),
          score: calculateScore(rating || 4.0, userRatingsTotal || 50),
          distance_miles: distanceMiles > 0 ? parseFloat(distanceMiles.toFixed(1)) : undefined,
        };

        allPlaces.push(place);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[Spend Today] Error fetching ${category} in ${city}:`, error);
      // Continue with other queries
    }
  }

  return allPlaces;
}

/**
 * Fetch all places from all cities and categories, then merge and sort
 */
async function fetchAllPlacesFromGoogle(): Promise<SpendPlace[]> {
  const cities: Array<keyof typeof CITY_COORDS> = ['cupertino', 'sunnyvale', 'san jose'];
  const categories: Array<keyof typeof CATEGORY_QUERIES> = ['奶茶', '中餐', '咖啡', '甜品'];
  
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
  
  // Remove duplicates by place_id
  const uniquePlaces = new Map<string, SpendPlace>();
  for (const place of allPlaces) {
    if (!uniquePlaces.has(place.id)) {
      uniquePlaces.set(place.id, place);
    } else {
      // If duplicate, keep the one with higher score
      const existing = uniquePlaces.get(place.id)!;
      if (place.score > existing.score) {
        uniquePlaces.set(place.id, place);
      }
    }
  }
  
  // Sort by score (descending)
  const sortedPlaces = Array.from(uniquePlaces.values()).sort((a, b) => b.score - a.score);
  
  return sortedPlaces;
}

/**
 * Select balanced 6 items: 2奶茶, 2中餐, 1咖啡, 1甜品
 */
function selectBalancedPlaces(places: SpendPlace[]): SpendPlace[] {
  const byCategory: Record<string, SpendPlace[]> = {
    '奶茶': [],
    '中餐': [],
    '咖啡': [],
    '甜品': [],
  };
  
  places.forEach(place => {
    if (byCategory[place.category]) {
      byCategory[place.category].push(place);
    }
  });
  
  const selected: SpendPlace[] = [];
  
  // 奶茶 - 取 top 2
  selected.push(...byCategory['奶茶'].sort((a, b) => b.score - a.score).slice(0, 2));
  
  // 中餐 - 取 top 2
  selected.push(...byCategory['中餐'].sort((a, b) => b.score - a.score).slice(0, 2));
  
  // 咖啡 - 取 top 1
  selected.push(...byCategory['咖啡'].sort((a, b) => b.score - a.score).slice(0, 1));
  
  // 甜品 - 取 top 1
  selected.push(...byCategory['甜品'].sort((a, b) => b.score - a.score).slice(0, 1));
  
  // If we don't have enough, fill from all categories
  if (selected.length < 6) {
    const remaining = places
      .filter(p => !selected.find(s => s.id === p.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6 - selected.length);
    selected.push(...remaining);
  }
  
  return selected.slice(0, 6);
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
    const balancedPlaces = selectBalancedPlaces(allPlaces);
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(SPEND_TODAY_CACHE_TTL);
    
    // Ensure we have 6 items
    let finalPlaces = balancedPlaces;
    if (finalPlaces.length < 6) {
      // Try to get stale cache to fill remaining slots
      const stale = getStaleCache(cacheKey);
      if (stale && stale.data.items && Array.isArray(stale.data.items)) {
        const staleItems = stale.data.items as SpendPlace[];
        const existingIds = new Set(finalPlaces.map(p => p.id));
        const additionalItems = staleItems.filter(p => !existingIds.has(p.id));
        finalPlaces = [...finalPlaces, ...additionalItems]
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);
      }
    }
    
    // If still less than 6, use seed data as fallback
    if (finalPlaces.length < 6) {
      console.warn(`[API /api/spend/today] Only found ${finalPlaces.length} places from Google, using seed data as fallback`);
      const seedPlaces = getFoodRecommendationsFromSeed();
      const existingIds = new Set(finalPlaces.map(p => p.id));
      const seedItems = seedPlaces
        .filter(p => !existingIds.has(p.id))
        .map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          rating: p.rating,
          user_ratings_total: p.review_count,
          address: p.address,
          maps_url: p.url,
          photo_url: p.photo_url,
          city: p.city,
          score: p.score,
        }));
      finalPlaces = [...finalPlaces, ...seedItems].slice(0, 6);
    }
    
    const response: any = {
      status: 'ok' as const,
      items: finalPlaces,
      count: finalPlaces.length,
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
      
      let items = staleData.items || [];
      if (!Array.isArray(items)) {
        items = [];
      }
      if (items.length < 6) {
        // If stale cache has less than 6, fallback to seed data
        const seedPlaces = getFoodRecommendationsFromSeed();
        const existingIds = new Set(items.map((i: any) => i.id));
        const seedItems = seedPlaces
          .filter(p => !existingIds.has(p.id))
          .map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            rating: p.rating,
            user_ratings_total: p.review_count,
            address: p.address,
            maps_url: p.url,
            photo_url: p.photo_url,
            city: p.city,
            score: p.score,
            distance_miles: p.distance_miles, // Include distance from seed data
          }));
        items = [...items, ...seedItems].slice(0, 6);
      }
      
      return res.status(200).json({
        ...staleData,
        items: items.slice(0, 6),
        count: Math.min(items.length, 6),
        cache_hit: true,
        stale: true,
      });
    }

    // Last resort: return seed data (should never fail)
    console.warn('[API /api/spend/today] All sources failed, using seed data as last resort');
    const errorAtISO = new Date().toISOString();
    const seedPlaces = getFoodRecommendationsFromSeed();
    const fallbackItems = seedPlaces.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      rating: p.rating,
      user_ratings_total: p.review_count,
      address: p.address,
      maps_url: p.url,
      photo_url: p.photo_url,
      city: p.city,
      score: p.score,
      distance_miles: p.distance_miles,
    }));
    
    res.status(200).json({
      status: 'ok' as const,
      items: fallbackItems.slice(0, 6),
      count: Math.min(fallbackItems.length, 6),
      asOf: errorAtISO,
      source: { name: 'Local Seed Data', url: 'https://maps.google.com' },
      ttlSeconds: ttlMsToSeconds(SPEND_TODAY_CACHE_TTL),
      cache_hit: false,
      fetched_at: errorAtISO,
      fallback: 'seed',
    });
  }
}
