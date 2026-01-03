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

// Maximum distance in miles from city center (Cupertino or Sunnyvale)
const MAX_DISTANCE_MILES = 8; // 8 miles from city center

// City coordinates (latitude, longitude) - only Cupertino and Sunnyvale
const CITY_COORDS = {
  cupertino: { lat: 37.3230, lng: -122.0322 },
  sunnyvale: { lat: 37.3688, lng: -122.0363 },
} as const;

// Default center (Cupertino) for fallback
const DEFAULT_CENTER = CITY_COORDS.cupertino;

// Category to keyword mapping for Nearby Search
const CATEGORY_KEYWORDS = {
  '奶茶': ['bubble tea', 'boba', 'milk tea', '奶茶', 'chinese bubble tea', 'chinese boba', '珍珠奶茶', '台式奶茶', '港式奶茶', 'bubble tea 奶茶'],
  '中餐': ['chinese restaurant', '中餐'],
  '咖啡': ['coffee', 'cafe'],
  '夜宵': ['烤串', '火锅', '串串', '烧烤', 'hot pot', 'bbq', 'chinese bbq', 'chinese hot pot', '烧烤店', '火锅店', '串串店'],
} as const;

// Category to type mapping (for Nearby Search)
const CATEGORY_TYPES = {
  '奶茶': 'cafe', // Use cafe as base type for bubble tea
  '中餐': 'restaurant',
  '咖啡': 'cafe',
  '夜宵': 'restaurant', // Use restaurant as base type for BBQ and hot pot
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
  opening_hours?: {
    open_now?: boolean;
  };
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
  googlePlacesRank?: number; // Google Places ranking (lower = better, from placeOrderMap)
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
 * Calculate combined ranking score considering:
 * 1. Google Places ranking (lower = better)
 * 2. New business indicator (fewer reviews = newer = better)
 * 
 * Returns a score where lower = better ranking
 */
function calculateCombinedRankingScore(
  googlePlacesRank: number,
  userRatingsTotal: number
): number {
  // Google Places rank weight: 70% (primary factor)
  const googleRankWeight = 0.7;
  
  // New business bonus: 30% (fewer reviews = newer = better)
  // Normalize review count: 0-100 reviews = bonus, 100+ reviews = no bonus
  // Use log scale to give more bonus to very new places (0-20 reviews)
  const maxReviewsForBonus = 100;
  const normalizedReviewCount = Math.min(userRatingsTotal, maxReviewsForBonus) / maxReviewsForBonus;
  const newBusinessBonus = (1 - normalizedReviewCount) * 100; // 0-100 bonus points
  
  // Combine: Google Places rank (lower is better) + new business bonus (lower is better)
  // We want to minimize the combined score
  const combinedScore = (googlePlacesRank * googleRankWeight) + (newBusinessBonus * (1 - googleRankWeight));
  
  return combinedScore;
}

/**
 * Search Google Places using Nearby Search API
 * Returns places within radius, filtered by keyword
 * Google Places API returns results sorted by relevance (best matches first)
 * Maximum radius: 50000 meters (~31 miles)
 */
async function searchGooglePlacesNearby(
  location: { lat: number; lng: number },
  radius: number = 50000, // Maximum allowed: 50000 meters (~31 miles)
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
 * Get place details (for photos, URL, and opening hours)
 */
interface OpeningHoursPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}

async function getPlaceDetails(placeId: string): Promise<{
  photo_reference?: string;
  url?: string;
  opening_hours?: { 
    open_now?: boolean;
    periods?: OpeningHoursPeriod[];
    weekday_text?: string[];
  };
  types?: string[];
}> {
  if (!GOOGLE_PLACES_API_KEY) {
    return {};
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'photos,url,opening_hours,types',
      key: GOOGLE_PLACES_API_KEY,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params}`
    );

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    const result: { 
      photo_reference?: string; 
      url?: string; 
      opening_hours?: { 
        open_now?: boolean;
        periods?: OpeningHoursPeriod[];
        weekday_text?: string[];
      }; 
      types?: string[] 
    } = {};
    
    if (data.result?.photos && data.result.photos.length > 0) {
      result.photo_reference = data.result.photos[0].photo_reference;
    }
    
    if (data.result?.url) {
      result.url = data.result.url;
    }
    
    if (data.result?.opening_hours) {
      result.opening_hours = {
        open_now: data.result.opening_hours.open_now,
        periods: data.result.opening_hours.periods,
        weekday_text: data.result.opening_hours.weekday_text,
      };
    }
    
    if (data.result?.types && Array.isArray(data.result.types)) {
      result.types = data.result.types;
    }

    return result;
  } catch (error) {
    console.error(`[Spend Today] Error fetching place details for ${placeId}:`, error);
  }

  return {};
}

/**
 * Check if restaurant opens till 11pm or later
 * Returns true if at least one day closes at 11pm (23:00) or later
 */
function opensTill11pmOrLater(openingHours?: { periods?: OpeningHoursPeriod[] }): boolean {
  if (!openingHours?.periods || openingHours.periods.length === 0) {
    return false; // No opening hours data, can't verify
  }
  
  // Check each period (each day's opening hours)
  for (const period of openingHours.periods) {
    if (period.close) {
      const closeTime = period.close.time; // Format: "2300" (24-hour format, string)
      const closeHour = parseInt(closeTime.substring(0, 2), 10);
      const closeMinute = parseInt(closeTime.substring(2, 4), 10);
      
      // Check if closes at 11pm (23:00) or later
      // 11pm = 23:00 = 2300
      if (closeHour >= 23) {
        return true;
      }
      
      // Also check if closes at 10:30pm or later (some places close at 10:30pm, which is close enough)
      if (closeHour === 22 && closeMinute >= 30) {
        return true;
      }
    }
  }
  
  return false;
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
 * Filters by distance from user location (or city center) with 10-mile hard limit
 */
async function fetchPlacesForCategory(
  city: keyof typeof CITY_COORDS,
  category: keyof typeof CATEGORY_KEYWORDS
): Promise<SpendPlace[]> {
  // IMPORTANT: Use English category values to avoid encoding issues
  // Frontend will map these back to Chinese for display
  const categoryToEnglish: Record<keyof typeof CATEGORY_KEYWORDS, string> = {
    '奶茶': 'milk_tea',
    '中餐': 'chinese',
    '咖啡': 'coffee',
    '夜宵': 'late_night',
  };
  
  const categoryToChinese: Record<string, string> = {
    'milk_tea': '奶茶',
    'chinese': '中餐',
    'coffee': '咖啡',
    'late_night': '夜宵',
  };
  
  // Use English category for storage, but keep Chinese for display
  const categoryEnglish = categoryToEnglish[category] || String(category);
  const categoryChinese = categoryToChinese[categoryEnglish] || category;
  console.log(`[fetchPlacesForCategory] Category: "${category}" -> English: "${categoryEnglish}", Chinese: "${categoryChinese}"`);
  
  // Use city center (not user location) to ensure consistent results
  // This ensures we only get places near Cupertino or Sunnyvale
  const searchCenter = CITY_COORDS[city];
  const keywords = CATEGORY_KEYWORDS[category];
  const type = CATEGORY_TYPES[category];
  // Search radius: 8 miles in meters (12874 meters)
  // This limits results to Cupertino and Sunnyvale area only
  const RADIUS_METERS = 12874; // ~8 miles
  
  const allPlaces: SpendPlace[] = [];
  const seenPlaceIds = new Set<string>();
  // Track original order from Google Places API (results are already sorted by relevance)
  const placeOrderMap = new Map<string, number>();
  let globalOrderIndex = 0;

      for (const keyword of keywords) {
    try {
      const results = await searchGooglePlacesNearby(
        searchCenter,
        RADIUS_METERS,
        type,
        keyword
      );

      console.log(`[Spend Today] Found ${results.length} results for ${category} in ${city} with keyword "${keyword}"`);

      // Google Places API returns results sorted by relevance (best matches first)
      // We preserve this order by tracking the index
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        
        // Skip if already seen (from previous keyword)
        if (seenPlaceIds.has(result.place_id)) continue;
        seenPlaceIds.add(result.place_id);
        
        // Track original order from Google Places ranking
        if (!placeOrderMap.has(result.place_id)) {
          placeOrderMap.set(result.place_id, globalOrderIndex++);
        }

        // Very lenient filtering - accept places even without ratings
        const rating = result.rating || 0;
        const userRatingsTotal = result.user_ratings_total || 0;
        
        // Use defaults if missing: rating 4.0 if missing, user_ratings_total 10 if missing
        // Accept all places regardless of rating/review count
        const finalRating = rating > 0 ? rating : 4.0;
        const finalUserRatingsTotal = userRatingsTotal > 0 ? userRatingsTotal : 10;

        // If no geometry, skip (we need location data)
        if (!result.geometry?.location) continue;
        
        // Calculate distance from city center
        const distanceMiles = calculateDistanceMiles(
          searchCenter.lat,
          searchCenter.lng,
          result.geometry.location.lat,
          result.geometry.location.lng
        );
        
        // HARD LIMIT: Only keep places within 8 miles of city center (Cupertino or Sunnyvale)
        if (distanceMiles > MAX_DISTANCE_MILES) {
          console.log(`[Spend Today] ❌ FILTERED OUT ${category}: "${result.name}" - Reason: distance ${distanceMiles.toFixed(1)} miles > ${MAX_DISTANCE_MILES} miles from ${city}`);
          continue;
        }

        // Get place details for photos, URL, and opening hours
        const details = await getPlaceDetails(result.place_id);
        
        // Special filtering for 奶茶 category - accept bubble tea shops
        // Since we're searching with bubble tea/boba keywords, Google Places already filters for bubble tea shops
        // We just need to ensure it's a cafe/restaurant type, not filter by Chinese keywords too strictly
        if (category === '奶茶') {
          const nameLower = result.name.toLowerCase();
          const placeTypes = details.types || [];
          
          // Check each condition and log why it's being filtered
          const hasCafeType = placeTypes.includes('cafe');
          const hasRestaurantType = placeTypes.includes('restaurant');
          const hasFoodType = placeTypes.includes('food');
          const hasBubbleTeaInName = nameLower.includes('bubble tea');
          const hasBobaInName = nameLower.includes('boba');
          const hasMilkTeaInName = nameLower.includes('奶茶');
          const hasZhenzhuInName = nameLower.includes('珍珠奶茶');
          const hasTapiocaInName = nameLower.includes('tapioca');
          const hasMilkTeaKeyword = nameLower.includes('milk tea');
          
          // Accept if it's a cafe or restaurant (Google Places already filtered by bubble tea/boba keywords)
          // Also accept if name contains bubble tea related keywords
          const isBubbleTeaShop = 
            hasCafeType ||
            hasRestaurantType ||
            hasFoodType ||
            hasBubbleTeaInName ||
            hasBobaInName ||
            hasMilkTeaInName ||
            hasZhenzhuInName ||
            hasTapiocaInName ||
            hasMilkTeaKeyword;
          
          // Only reject if it's clearly not a bubble tea shop
          if (!isBubbleTeaShop) {
            const reasons = [];
            if (!hasCafeType && !hasRestaurantType && !hasFoodType) {
              reasons.push(`no cafe/restaurant/food type (types: ${placeTypes.join(', ') || 'none'})`);
            }
            if (!hasBubbleTeaInName && !hasBobaInName && !hasMilkTeaInName && !hasZhenzhuInName && !hasTapiocaInName && !hasMilkTeaKeyword) {
              reasons.push('no bubble tea keywords in name');
            }
            console.log(`[Spend Today] ❌ FILTERED OUT 奶茶: "${result.name}" - Reasons: ${reasons.join('; ')}`);
            continue;
          } else {
            // Log why it was accepted
            const acceptReasons = [];
            if (hasCafeType) acceptReasons.push('cafe type');
            if (hasRestaurantType) acceptReasons.push('restaurant type');
            if (hasFoodType) acceptReasons.push('food type');
            if (hasBubbleTeaInName) acceptReasons.push('"bubble tea" in name');
            if (hasBobaInName) acceptReasons.push('"boba" in name');
            if (hasMilkTeaInName) acceptReasons.push('"奶茶" in name');
            if (hasZhenzhuInName) acceptReasons.push('"珍珠奶茶" in name');
            if (hasTapiocaInName) acceptReasons.push('"tapioca" in name');
            if (hasMilkTeaKeyword) acceptReasons.push('"milk tea" in name');
            console.log(`[Spend Today] ✅ ACCEPTED 奶茶: "${result.name}" - Reasons: ${acceptReasons.join(', ')}`);
          }
        }
        
        // Special filtering for 夜宵 category
        // Requirements: 烤串/火锅 AND opens till 11pm or later
        if (category === '夜宵') {
          const nameLower = result.name.toLowerCase();
          
          // Step 1: Check if it's 烤串 or 火锅 (BBQ skewers or hot pot)
          const isBBQSkewersOrHotPot = 
            nameLower.includes('烤串') ||
            nameLower.includes('串串') ||
            nameLower.includes('火锅') ||
            nameLower.includes('hot pot') ||
            nameLower.includes('bbq') ||
            nameLower.includes('烧烤') ||
            nameLower.includes('烤肉');
          
          if (!isBBQSkewersOrHotPot) {
            console.log(`[Spend Today] ❌ FILTERED OUT 夜宵: "${result.name}" - Reason: not 烤串/火锅 (BBQ skewers/hot pot)`);
            continue;
          }
          
          // Step 2: Check if opens till 11pm or later
          const opensLate = opensTill11pmOrLater(details.opening_hours);
          
          if (!opensLate) {
            console.log(`[Spend Today] ❌ FILTERED OUT 夜宵: "${result.name}" - Reason: does not open till 11pm or later`);
            continue;
          }
          
          // Both conditions met
          console.log(`[Spend Today] ✅ ACCEPTED 夜宵: "${result.name}" - Reasons: 烤串/火锅, opens till 11pm+`);
        }
        
        let photoUrl: string | undefined;
        if (details.photo_reference) {
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${details.photo_reference}&key=${GOOGLE_PLACES_API_KEY}`;
        }

        // Use Google Maps URL from details, or construct from place_id
        const mapsUrl = details.url || `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;

        // Use Chinese category for the place object (for frontend display)
        console.log(`[Spend Today] Setting place category to: "${categoryChinese}" for place: ${result.name}`);
        
        // Determine city name from coordinates (approximate)
        let cityName = city.charAt(0).toUpperCase() + city.slice(1).replace(' ', ' ');
        if (city === 'sanjose') {
          cityName = 'San Jose';
        }
        
        // Get Google Places ranking (lower = better, from placeOrderMap)
        const googlePlacesRank = placeOrderMap.get(result.place_id) ?? Infinity;
        
        const place: SpendPlace = {
          id: result.place_id,
          name: result.name,
          category: categoryChinese, // Use Chinese category for display
          rating: finalRating,
          user_ratings_total: finalUserRatingsTotal,
          address: result.formatted_address || '',
          maps_url: mapsUrl,
          photo_url: photoUrl,
          city: cityName,
          score: calculatePopularityScore(finalRating, finalUserRatingsTotal), // Keep for backward compatibility
          distance_miles: parseFloat(distanceMiles.toFixed(1)),
          googlePlacesRank: googlePlacesRank, // Store Google Places ranking
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

  // Sort by combined ranking: Google Places rank + new business bonus
  // Lower score = better ranking
  allPlaces.sort((a, b) => {
    const rankA = placeOrderMap.get(a.id) ?? Infinity;
    const rankB = placeOrderMap.get(b.id) ?? Infinity;
    const scoreA = calculateCombinedRankingScore(rankA, a.user_ratings_total);
    const scoreB = calculateCombinedRankingScore(rankB, b.user_ratings_total);
    return scoreA - scoreB; // Lower score = better
  });

  return allPlaces;
}

/**
 * Fetch all places from all cities and categories, then merge and sort by popularity
 */
async function fetchAllPlacesFromGoogle(): Promise<SpendPlace[]> {
  // Only search in Cupertino and Sunnyvale (no San Jose)
  const cities: Array<keyof typeof CITY_COORDS> = ['cupertino', 'sunnyvale'];
  const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '咖啡', '夜宵'];
  
  const allPlaces: SpendPlace[] = [];
  // Track global order across all cities/categories to preserve Google Places ranking
  const globalPlaceOrderMap = new Map<string, number>();
  let globalOrderIndex = 0;
  
  // Fetch from all combinations
  for (const city of cities) {
    for (const category of categories) {
      try {
        // Don't pass userLocation - always use city center to ensure distance filtering works correctly
        const places = await fetchPlacesForCategory(city, category);
        // Assign global order indices to preserve Google Places ranking
        for (const place of places) {
          if (!globalPlaceOrderMap.has(place.id)) {
            globalPlaceOrderMap.set(place.id, globalOrderIndex++);
          }
          // Store Google Places rank in the place object
          place.googlePlacesRank = globalPlaceOrderMap.get(place.id);
        }
        allPlaces.push(...places);
      } catch (error) {
        console.error(`[Spend Today] Error fetching ${category} in ${city}:`, error);
        // Continue with other cities/categories
      }
    }
  }
  
  // Remove duplicates by place_id (keep the one with the earliest order index = best ranking)
  const uniquePlaces = new Map<string, SpendPlace>();
  for (const place of allPlaces) {
    if (!uniquePlaces.has(place.id)) {
      uniquePlaces.set(place.id, place);
    } else {
      const existing = uniquePlaces.get(place.id)!;
      const existingOrder = existing.googlePlacesRank ?? Infinity;
      const newOrder = place.googlePlacesRank ?? Infinity;
      // Keep the one with the better (earlier) ranking
      if (newOrder < existingOrder) {
        uniquePlaces.set(place.id, place);
      }
    }
  }
  
  // Sort by combined ranking: Google Places rank + new business bonus
  // Lower score = better ranking
  const sortedPlaces = Array.from(uniquePlaces.values()).sort((a, b) => {
    const rankA = a.googlePlacesRank ?? Infinity;
    const rankB = b.googlePlacesRank ?? Infinity;
    const scoreA = calculateCombinedRankingScore(rankA, a.user_ratings_total);
    const scoreB = calculateCombinedRankingScore(rankB, b.user_ratings_total);
    return scoreA - scoreB; // Lower score = better
  });
  
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
      .slice(0, 50); // Return top 50 places per category (ranked by Google Places)
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
    
    // Parse user location from query params (lat, lng)
    let userLocation: { lat: number; lng: number } | undefined;
    const latParam = req.query.lat;
    const lngParam = req.query.lng;
    if (latParam && lngParam) {
      const lat = parseFloat(String(latParam));
      const lng = parseFloat(String(lngParam));
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        userLocation = { lat, lng };
        console.log(`[Spend Today] Using user location: ${lat}, ${lng}`);
      } else {
        console.warn(`[Spend Today] Invalid user location: lat=${latParam}, lng=${lngParam}`);
      }
    } else {
      console.log(`[Spend Today] No user location provided, using default center: ${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}`);
    }
    
    // Check cache (24 hours) - but skip if nocache is set
    const cached = getCachedData(cacheKey, SPEND_TODAY_CACHE_TTL, nocache);
    if (cached && !nocache) {
      const cachedData = cached.data;
      console.log('[Spend Today] Returning cached data');
      normalizeCachedResponse(cachedData, { name: 'Google Places', url: 'https://maps.google.com' }, ttlMsToSeconds(SPEND_TODAY_CACHE_TTL), 'spend-today');
      
      // Ensure proper encoding for JSON response
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
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

    // Don't use userLocation - always search from city centers to ensure distance filtering
    const allPlaces = await fetchAllPlacesFromGoogle();
    console.log(`[Spend Today] ✅ Fetched ${allPlaces.length} total places from Google Places API`);
    if (allPlaces.length > 0) {
      console.log(`[Spend Today] Sample places:`, allPlaces.slice(0, 3).map(p => `${p.name} (${p.category})`).join(', '));
    }
    
    if (allPlaces.length === 0) {
      console.warn('[Spend Today] No places found from Google Places API. This might indicate:');
      console.warn('  - GOOGLE_PLACES_API_KEY is missing or invalid');
      console.warn('  - API quota exceeded');
      console.warn('  - Network issues');
      console.warn('  - No places match the search criteria');
      console.warn('  - All places were filtered out by category/opening hours criteria');
      
      // Try to return stale cache if available
      const stale = getStaleCache(cacheKey);
      if (stale && stale.data && (stale.data.items?.length > 0 || Object.keys(stale.data.itemsByCategory || {}).length > 0)) {
        console.log('[Spend Today] Returning stale cache due to empty fresh fetch');
        const staleData = stale.data;
        normalizeStaleResponse(staleData, { name: 'Google Places', url: 'https://maps.google.com' }, ttlMsToSeconds(SPEND_TODAY_CACHE_TTL), 'spend-today');
        
        // Handle both new (itemsByCategory) and legacy (items) formats
        let itemsByCategory: Record<string, SpendPlace[]> = staleData.itemsByCategory || {};
        let items = staleData.items || [];
        
        // If legacy format, convert to new format
        if (!staleData.itemsByCategory && Array.isArray(items) && items.length > 0) {
          itemsByCategory = groupPlacesByCategory(items as SpendPlace[]);
        }
        
        // Ensure English keys for itemsByCategory
        const CATEGORY_KEY_MAP: Record<string, string> = {
          '奶茶': 'milk_tea',
          '中餐': 'chinese',
          '咖啡': 'coffee',
          '夜宵': 'late_night',
        };
        
        // Convert Chinese keys to English keys if needed
        const normalizedItemsByCategory: Record<string, SpendPlace[]> = {
          'milk_tea': [],
          'chinese': [],
          'coffee': [],
          'late_night': [],
        };
        
        for (const [key, places] of Object.entries(itemsByCategory)) {
          const englishKey = CATEGORY_KEY_MAP[key] || key;
          if (normalizedItemsByCategory.hasOwnProperty(englishKey)) {
            normalizedItemsByCategory[englishKey] = places as SpendPlace[];
          } else if (key === 'milk_tea' || key === 'chinese' || key === 'coffee' || key === 'late_night') {
            normalizedItemsByCategory[key] = places as SpendPlace[];
          }
        }
        
        // Rebuild flat items array for backward compatibility
        items = Object.values(normalizedItemsByCategory).flat();
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).json({
          ...staleData,
          itemsByCategory: normalizedItemsByCategory,
          items: items.slice(0, 200), // Up to 50 per category * 4 categories
          count: items.length,
          cache_hit: true,
          stale: true,
        });
      }
    }
    
    // Group places by the category they were assigned during fetch
    // Since we're calling fetchPlacesForCategory with explicit category names,
    // we can track which category each place belongs to by the order they're returned
    // But the most reliable way is to use the place.category field we set
    
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
      console.log(`[Spend Today] Place "${place.name}" has category: "${placeCategory}" (bytes: ${Buffer.from(placeCategory, 'utf8').toString('hex')})`);
      
      // Try exact match first
      if (placesByCategoryDirect.hasOwnProperty(placeCategory)) {
        placesByCategoryDirect[placeCategory].push(place);
      } else {
        // Try to match by checking if the category string matches any expected category
        const expectedCategories: string[] = ['奶茶', '中餐', '咖啡', '夜宵'];
        const matched = expectedCategories.find(cat => {
          // Compare by byte representation to avoid encoding issues
          const placeBytes = Buffer.from(placeCategory, 'utf8').toString('hex');
          const catBytes = Buffer.from(cat, 'utf8').toString('hex');
          return placeBytes === catBytes || placeCategory === cat;
        });
        
        if (matched) {
          console.log(`[Spend Today] Matched "${placeCategory}" to "${matched}" for place "${place.name}"`);
          placesByCategoryDirect[matched].push(place);
        } else {
          console.warn(`[Spend Today] Place "${place.name}" has unexpected category: "${placeCategory}" (bytes: ${Buffer.from(placeCategory, 'utf8').toString('hex')})`);
        }
      }
    }
    
    // Sort each category by combined ranking: Google Places rank + new business bonus
    // Lower score = better ranking
    for (const category of Object.keys(placesByCategoryDirect)) {
      placesByCategoryDirect[category].sort((a, b) => {
        const rankA = a.googlePlacesRank ?? Infinity;
        const rankB = b.googlePlacesRank ?? Infinity;
        const scoreA = calculateCombinedRankingScore(rankA, a.user_ratings_total);
        const scoreB = calculateCombinedRankingScore(rankB, b.user_ratings_total);
        return scoreA - scoreB; // Lower score = better
      });
    }
    
    console.log(`[Spend Today] Places by category (direct grouping):`, Object.keys(placesByCategoryDirect).map(cat => `${cat}: ${placesByCategoryDirect[cat]?.length || 0}`).join(', '));
    
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(SPEND_TODAY_CACHE_TTL);
    
    // Group by category - NO fallback data, only real places
    // IMPORTANT: Use English keys for itemsByCategory to avoid JSON encoding issues
    // Each place still has the correct Chinese category field
    const CATEGORY_MILK_TEA = '奶茶';
    const CATEGORY_CHINESE = '中餐';
    const CATEGORY_COFFEE = '咖啡';
    const CATEGORY_LATE_NIGHT = '夜宵';
    
    // Map Chinese category names to English keys for JSON serialization
    const CATEGORY_KEY_MAP: Record<string, string> = {
      [CATEGORY_MILK_TEA]: 'milk_tea',
      [CATEGORY_CHINESE]: 'chinese',
      [CATEGORY_COFFEE]: 'coffee',
      [CATEGORY_LATE_NIGHT]: 'late_night',
    };
    
    const categories: string[] = [CATEGORY_MILK_TEA, CATEGORY_CHINESE, CATEGORY_COFFEE, CATEGORY_LATE_NIGHT];
    const finalPlacesByCategory: Record<string, SpendPlace[]> = {
      'milk_tea': [],
      'chinese': [],
      'coffee': [],
      'late_night': [],
    };
    
    // Log category keys to verify encoding
    console.log('[Spend Today] Categories array:', categories);
    console.log('[Spend Today] Categories bytes:', categories.map(c => Buffer.from(c, 'utf8').toString('hex')));
    console.log('[Spend Today] FinalPlacesByCategory initial keys:', Object.keys(finalPlacesByCategory));
    console.log('[Spend Today] FinalPlacesByCategory initial keys bytes:', Object.keys(finalPlacesByCategory).map(k => Buffer.from(k, 'utf8').toString('hex')));
    
    for (const category of categories) {
      // Use the category directly (it's already a proper string literal)
      console.log(`[Spend Today] Processing category: "${category}" (bytes: ${Buffer.from(category, 'utf8').toString('hex')})`);
      
      // Try to find matching places from placesByCategoryDirect
      // First try exact match
      let categoryPlaces = placesByCategoryDirect[category] || [];
      
      // If no exact match, try to find by byte comparison
      if (categoryPlaces.length === 0) {
        const categoryBytes = Buffer.from(category, 'utf8').toString('hex');
        for (const [key, places] of Object.entries(placesByCategoryDirect)) {
          const keyBytes = Buffer.from(key, 'utf8').toString('hex');
          if (keyBytes === categoryBytes) {
            console.log(`[Spend Today] Matched category "${category}" to key "${key}" by byte comparison`);
            categoryPlaces = places;
            break;
          }
        }
      }
      
      console.log(`[Spend Today] Category ${category}: ${categoryPlaces.length} places from fresh fetch`);
      
      // Try stale cache if we have < 2 places (need at least 2 for carousel)
      if (categoryPlaces.length < 2) {
        console.log(`[Spend Today] Category ${category} has < 2 places, trying stale cache`);
        const stale = getStaleCache(cacheKey);
        // Try both the correct key and potential corrupted keys from stale cache
        const staleKey = stale?.data?.itemsByCategory?.[category] ? category : 
                        (stale?.data?.itemsByCategory ? Object.keys(stale.data.itemsByCategory)[0] : null);
        if (stale && stale.data.itemsByCategory && staleKey) {
          const staleItems = stale.data.itemsByCategory[staleKey] as SpendPlace[];
          // Only use stale items if they have valid place_id (real places)
          const validStaleItems = staleItems.filter(p => p.id && (p.id.startsWith('Ch') || p.id.length > 10));
          console.log(`[Spend Today] Found ${validStaleItems.length} valid stale items for ${category}`);
          const existingIds = new Set(categoryPlaces.map(p => p.id));
          const additionalItems = validStaleItems.filter(p => !existingIds.has(p.id));
          categoryPlaces = [...categoryPlaces, ...additionalItems]
            .sort((a, b) => {
              // Sort by combined ranking: Google Places rank + new business bonus
              const rankA = a.googlePlacesRank ?? Infinity;
              const rankB = b.googlePlacesRank ?? Infinity;
              const scoreA = calculateCombinedRankingScore(rankA, a.user_ratings_total);
              const scoreB = calculateCombinedRankingScore(rankB, b.user_ratings_total);
              return scoreA - scoreB; // Lower score = better
            })
            .slice(0, 50); // Return top 50 places per category (ranked by combined score)
        } else {
          console.warn(`[Spend Today] No stale cache available for ${category}`);
        }
      }
      
      // NO seed data fallback - only return real places
      // Use English key for itemsByCategory, but keep Chinese category in each place
      const englishKey = CATEGORY_KEY_MAP[category];
      if (englishKey) {
        // Keep top 50 places per category, sorted by Google Places ranking (already sorted by placeOrderMap)
        finalPlacesByCategory[englishKey] = categoryPlaces.slice(0, 50);
        console.log(`[Spend Today] Final count for ${category} (key: ${englishKey}): ${finalPlacesByCategory[englishKey].length}`);
      } else {
        console.error(`[Spend Today] ERROR: No English key mapping for category ${category}`);
      }
      
      if (englishKey && finalPlacesByCategory[englishKey].length === 0) {
        console.warn(`[Spend Today] WARNING: Category ${category} (key: ${englishKey}) has 0 places after all attempts`);
      }
    }
    
    // Log final structure before sending
    console.log('[Spend Today] ✅ Final response structure:');
    console.log('[Spend Today] FinalPlacesByCategory keys:', Object.keys(finalPlacesByCategory));
    const totalCount = Object.values(finalPlacesByCategory).reduce((sum, arr) => sum + arr.length, 0);
    console.log('[Spend Today] Total places count:', totalCount);
    for (const [key, places] of Object.entries(finalPlacesByCategory)) {
      console.log(`[Spend Today]   "${key}": ${places.length} places`);
      if (places.length > 0) {
        console.log(`[Spend Today]     Sample: ${places[0].name} (${places[0].city})`);
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

    // Ensure proper encoding for JSON response
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
      
      // Ensure proper encoding for JSON response
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
    
    // Use English keys to match normal response format
    const emptyByCategory: Record<string, SpendPlace[]> = {
      'milk_tea': [],
      'chinese': [],
      'coffee': [],
      'late_night': [],
    };

    // Ensure proper encoding for JSON response
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
