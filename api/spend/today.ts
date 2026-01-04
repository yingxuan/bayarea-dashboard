/**
 * Vercel Serverless Function: /api/spend/today
 * Returns food recommendations using Google Places API (New)
 * 
 * Requirements:
 * - Cities: Cupertino / Sunnyvale
 * - Categories: 奶茶 / 中餐 / 新店打卡 / 夜宵
 * - Always return >= 3 items per category (live or cache/seed)
 * - Sort: "popular" = userRatingCount desc, then rating desc
 * - 24h cache: success → write cache; fail → read cache; cache fail → seed fallback
 * - Never show empty UI (items always >= 3 per category)
 * 
 * Strategy:
 * - Use Google Places API (New) - places:searchNearby (POST)
 * - Cache for 24 hours
 * - Fallback to stale cache if API fails
 * - Fallback to local seed data if all fails
 * - All errors (legacy/billing/quota/key restrictions) trigger fallback
 * 
 * Runtime: Node.js (required for process.env access)
 */

// Ensure Node.js runtime (not Edge runtime) for environment variable access
export const runtime = 'nodejs';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, ttlMsToSeconds } from '../../shared/config.js';
import { getFoodRecommendationsFromSeed, FOOD_SEED_DATA, type FoodPlace } from '../../shared/food-seed-data.js';
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
const SPEND_TODAY_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours (increased from 24h for better cost control - food places don't need real-time freshness)

// Debug: Log environment variable status (without exposing the key)
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV) {
  console.log('[Spend Today] GOOGLE_PLACES_API_KEY status:', GOOGLE_PLACES_API_KEY ? `Set (length: ${GOOGLE_PLACES_API_KEY.length})` : 'Not set');
  console.log('[Spend Today] Available env vars with GOOGLE:', Object.keys(process.env).filter(k => k.includes('GOOGLE')).join(', ') || 'None');
}

// Maximum distance in miles from city center (Cupertino or Sunnyvale)
const MAX_DISTANCE_MILES = 15; // 15 miles from city center

// City coordinates (latitude, longitude) - for "新店打卡" we need 5 cities
const CITY_COORDS = {
  cupertino: { lat: 37.3230, lng: -122.0322 },
  sunnyvale: { lat: 37.3688, lng: -122.0363 },
  sanjose: { lat: 37.3382, lng: -121.8863 },
  milpitas: { lat: 37.4283, lng: -121.9066 },
  fremont: { lat: 37.5483, lng: -121.9886 },
} as const;

// Default center (Cupertino) for fallback
const DEFAULT_CENTER = CITY_COORDS.cupertino;

// Category to keyword mapping for Nearby Search
// COST OPTIMIZATION: Reduced to primary keywords only (fewer API calls)
const CATEGORY_KEYWORDS = {
  '奶茶': ['bubble tea', 'boba'], // Reduced from 10 to 2 keywords
  '中餐': ['chinese restaurant'], // Reduced from 2 to 1 keyword
  '新店打卡': ['chinese restaurant', 'bubble tea'], // New category: Chinese restaurants + bubble tea
  '夜宵': ['hot pot', 'bbq'], // Reduced from 10 to 2 keywords
} as const;

// Category to type mapping (for Nearby Search)
const CATEGORY_TYPES = {
  '奶茶': 'cafe', // Use cafe as base type for bubble tea
  '中餐': 'restaurant',
  '新店打卡': 'restaurant', // Will search for both restaurant (Chinese) and cafe (bubble tea)
  '夜宵': 'restaurant', // Use restaurant as base type for BBQ and hot pot
} as const;

// New Places API (New) response types
interface NewPlacesPlace {
  id: string;
  displayName?: {
    text: string;
    languageCode: string;
  };
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  photos?: Array<{
    name: string;
    widthPx?: number;
    heightPx?: number;
  }>;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  types?: string[];
  googleMapsUri?: string;
}

interface NewPlacesSearchNearbyResponse {
  places?: NewPlacesPlace[];
}

// Legacy interface for backward compatibility (used internally)
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
  google_maps_uri?: string;
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
 * Calculate "newness score" for "新店打卡" category
 * Based on userRatingCount (newer places tend to have fewer ratings)
 * Higher score = newer/more likely to be new
 * 
 * Formula: newScore = (50 - min(userRatingCount, 50))
 * If rating >= 4.2: newScore += 10
 */
function calculateNewnessScore(rating: number, userRatingCount: number): number {
  // Base score: (50 - min(userRatingCount, 50))
  // This gives 0-50 points based on review count (lower count = higher score)
  let score = 50 - Math.min(userRatingCount, 50);
  
  // Bonus for high rating (avoid low-quality new places)
  if (rating >= 4.2) {
    score += 10;
  }
  
  return score;
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
 * Search Google Places using Places API (New) - searchNearby
 * Returns places within radius, filtered by keyword
 * Uses POST method with proper headers
 */
async function searchGooglePlacesNearby(
  location: { lat: number; lng: number },
  radius: number = 50000, // Maximum allowed: 50000 meters (~31 miles)
  type?: string,
  keyword?: string,
  debugMode: boolean = false,
  enableDebugLog: boolean = false // Only enable detailed debug logs for 新店打卡
): Promise<GooglePlaceResult[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn('[Spend Today] GOOGLE_PLACES_API_KEY not set in searchPlacesByKeyword, returning empty results');
    return [];
  }

  try {
    // For keyword-based searches, use searchText instead of searchNearby
    // searchNearby is better for type-based searches, searchText for keyword searches
    let url: string;
    let requestBody: any;
    
    if (keyword) {
      // Use searchText for keyword searches
      url = 'https://places.googleapis.com/v1/places:searchText';
      requestBody = {
        textQuery: keyword,
        maxResultCount: enableDebugLog ? 20 : 8, // Google Places API (New) limit: 1-20
        locationBias: {
          circle: {
            center: {
              latitude: location.lat,
              longitude: location.lng,
            },
            radius: radius,
          },
        },
      };
      
      // Only include includedType if type is provided
      if (type) {
        requestBody.includedType = type;
      }
      
      // Only include rankPreference if in debug mode
      if (enableDebugLog) {
        requestBody.rankPreference = 'DISTANCE';
      }
    } else {
      // Use searchNearby for type-based searches
      url = 'https://places.googleapis.com/v1/places:searchNearby';
      requestBody = {
        maxResultCount: enableDebugLog ? 20 : 6, // Google Places API (New) limit: 1-20
        locationRestriction: {
          circle: {
            center: {
              latitude: location.lat,
              longitude: location.lng,
            },
            radius: radius,
          },
        },
      };
      
      // Only include includedTypes if type is provided
      // Note: Google Places API searchNearby requires includedTypes (array of strings)
      if (type) {
        requestBody.includedTypes = [type];
      } else {
        // If no type provided, searchNearby requires at least one type
        // Default to restaurant if no type specified
        requestBody.includedTypes = ['restaurant'];
      }
      
      // Only include rankPreference if in debug mode
      if (enableDebugLog) {
        requestBody.rankPreference = 'DISTANCE';
      }
    }
    
    // COST OPTIMIZATION: Minimal field mask - only fields actually used in UI
    // For 新店打卡: places.id, places.displayName, places.formattedAddress, places.googleMapsUri,
    //               places.rating, places.userRatingCount, places.location, places.photos (max 1)
    // DO NOT request: reviews, openingHours, editorialSummary, priceLevel, businessStatus
    // STEP 1: Log request details BEFORE API call (only for 新店打卡)
    if (enableDebugLog) {
      const requestSummary = {
        city: `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
        keyword: keyword || 'none',
        includedTypes: type ? [type] : undefined,
        radiusMeters: radius,
        maxResultCount: requestBody.maxResultCount,
        fieldMask: 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.photos,places.googleMapsUri',
        endpoint: url.includes('searchText') ? 'searchText' : 'searchNearby',
        requestBody: JSON.stringify(requestBody),
      };
      // Debug: request summary (only in debug mode)
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.photos,places.googleMapsUri',
      },
      body: JSON.stringify(requestBody),
    });

    // Log HTTP status only on error

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Spend Today] Places API HTTP error: ${response.status} ${response.statusText}`);
      console.error(`[Spend Today] Request URL: ${url}`);
      console.error(`[Spend Today] Request body:`, JSON.stringify(requestBody, null, 2));
      console.error(`[Spend Today] Error response: ${errorText}`);
      throw new Error(`Places API (New) error: ${response.status} ${response.statusText}`);
    }

    const data: NewPlacesSearchNearbyResponse = await response.json();
    
    // Check for API-level errors
    if ((data as any).error) {
      const error = (data as any).error;
      const errorMessage = error.message || JSON.stringify(error);
      const errorCode = error.code || error.status || 'UNKNOWN';
      
      console.error(`[Spend Today] Places API error: ${errorCode} - ${errorMessage}`);
      
      // Always throw for API errors to trigger fallback
      // This includes: legacy API, billing, quota, key restrictions, etc.
      const apiError = new Error(`Places API (New) error: ${errorCode} - ${errorMessage}`);
      (apiError as any).code = errorCode;
      throw apiError;
    }

    const places = data.places || [];
    const rawPlacesCount = places.length;
    
    // STEP 1: Log raw API response count BEFORE filtering (only in debug mode)
    if (enableDebugLog && debugMode) {
      console.log(`[Spend Today] Raw API Response: ${rawPlacesCount} places`);
    }
    
    // STEP 2: Filter and track drop reasons
    let filteredPlaces = places;
    const dropCounters = {
      drop_noRatingCount: 0,
      drop_ratingTooLow: 0,
      drop_notChinese: 0,
      drop_notBoba: 0,
      drop_dedup: 0,
      drop_missingFields: 0,
      drop_keywordMismatch: 0,
    };
    
    // In debug bypass mode, skip all filtering
    if (debugMode) {
      filteredPlaces = places;
    } else {
      // No need to filter by keyword if we used searchText (it already filters)
      // But we can still do a light filter for searchNearby results if needed
      if (keyword && !url.includes('searchText')) {
        // Only filter if we used searchNearby (shouldn't happen now, but keep as safety)
        const keywordLower = keyword.toLowerCase();
        filteredPlaces = places.filter(place => {
          const name = place.displayName?.text?.toLowerCase() || '';
          const address = place.formattedAddress?.toLowerCase() || '';
          const matches = name.includes(keywordLower) || address.includes(keywordLower);
          if (!matches) dropCounters.drop_keywordMismatch++;
          return matches;
        });
      }
    }
    
    // Log filtered count only in debug mode and if there are drops
    if (enableDebugLog && debugMode) {
      const filteredCount = filteredPlaces.length;
      const totalDropped = Object.values(dropCounters).reduce((a, b) => a + b, 0);
      if (totalDropped > 0) {
        console.log(`[Spend Today] Filtered: ${filteredCount}/${rawPlacesCount} places`, dropCounters);
      }
    }
    
    // Convert new API format to legacy format for backward compatibility
    const legacyResults: GooglePlaceResult[] = filteredPlaces.map(place => ({
      place_id: place.id,
      name: place.displayName?.text || '',
      rating: place.rating,
      user_ratings_total: place.userRatingCount,
      formatted_address: place.formattedAddress,
      geometry: place.location ? {
        location: {
          lat: place.location.latitude,
          lng: place.location.longitude,
        },
      } : undefined,
      // COST OPTIMIZATION: Only take first photo (photos are expensive)
      photos: place.photos && place.photos.length > 0 ? [{
        photo_reference: place.photos[0].name, // New API uses name instead of photo_reference
      }] : undefined,
      google_maps_uri: place.googleMapsUri,
    }));

    return legacyResults;
  } catch (error: any) {
    // Log detailed error information
    console.error(`[Spend Today] Error in searchGooglePlacesNearby:`, error);
    if (error.message) {
      console.error(`[Spend Today] Error message: ${error.message}`);
    }
    throw error; // Re-throw to trigger fallback
  }
}

/**
 * Get place details using Places API (New) - GET /places/{placeId}
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
    // Use new Places API (New) - GET /places/{placeId}
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'photos', // COST OPTIMIZATION: Only request photos if needed (but we'll avoid this call)
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Spend Today] Places API (New) details error: ${response.status} ${response.statusText}`);
      console.error(`[Spend Today] Error response: ${errorText}`);
      return {};
    }

    const place: NewPlacesPlace = await response.json();
    
    // Check for API-level errors
    if ((place as any).error) {
      const error = (place as any).error;
      console.error(`[Spend Today] Places API (New) details error: ${error.code || 'UNKNOWN'} - ${error.message || JSON.stringify(error)}`);
      return {};
    }
    
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
    
    // Convert new API format to legacy format
    if (place.photos && place.photos.length > 0) {
      result.photo_reference = place.photos[0].name; // New API uses name instead of photo_reference
    }
    
    if (place.googleMapsUri) {
      result.url = place.googleMapsUri;
    }
    
    if (place.regularOpeningHours) {
      result.opening_hours = {
        open_now: place.regularOpeningHours.openNow,
        weekday_text: place.regularOpeningHours.weekdayDescriptions,
        // Note: New API doesn't provide periods in the same format, so we'll skip it
        // periods: undefined,
      };
    }
    
    if (place.types && Array.isArray(place.types)) {
      result.types = place.types;
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
 * STEP 3: Explain why a place was dropped for 夜宵 (for debug mode)
 */
function explainDropNightSnack(
  place: GooglePlaceResult,
  rating: number,
  userRatingsTotal: number | undefined,
  distanceMiles: number,
  hasKeywordMatch: boolean
): string[] {
  const reasons: string[] = [];
  
  if (!place.geometry?.location) {
    reasons.push('drop_missingFields (no location)');
  }
  if (distanceMiles > MAX_DISTANCE_MILES) {
    reasons.push(`drop_distanceTooFar (${distanceMiles.toFixed(1)}mi > ${MAX_DISTANCE_MILES}mi)`);
  }
  if (!hasKeywordMatch) {
    reasons.push('drop_keywordMismatch (name/address does not match 夜宵 keywords: 烤串/串串/火锅/hot pot/bbq/烧烤/烤肉)');
  }
  
  return reasons;
}

/**
 * Fetch places from Google Places API for a specific city and category
 * Filters by distance from user location (or city center) with 15-mile hard limit
 */
async function fetchPlacesForCategory(
  city: keyof typeof CITY_COORDS,
  category: keyof typeof CATEGORY_KEYWORDS,
  debugMode: boolean = false
): Promise<SpendPlace[]> {
  // IMPORTANT: Use English category values to avoid encoding issues
  // Frontend will map these back to Chinese for display
  const categoryToEnglish: Record<keyof typeof CATEGORY_KEYWORDS, string> = {
    '奶茶': 'milk_tea',
    '中餐': 'chinese',
    '新店打卡': 'new_places',
    '夜宵': 'late_night',
  };
  
  const categoryToChinese: Record<string, string> = {
    'milk_tea': '奶茶',
    'chinese': '中餐',
    'new_places': '新店打卡',
    'late_night': '夜宵',
  };
  
  // Use English category for storage, but keep Chinese for display
  const categoryEnglish = categoryToEnglish[category] || String(category);
  const categoryChinese = categoryToChinese[categoryEnglish] || category;
  // Debug log removed for non-新店打卡 categories
  
  // Use city center (not user location) to ensure consistent results
  // This ensures we only get places near Cupertino or Sunnyvale
  const searchCenter = CITY_COORDS[city];
  const keywords = CATEGORY_KEYWORDS[category];
  const type = CATEGORY_TYPES[category];
  // Search radius: 15 miles in meters (24140 meters)
  // This limits results to Cupertino and Sunnyvale area only
  const RADIUS_METERS = 24140; // ~15 miles
  
  const allPlaces: SpendPlace[] = [];
  const seenPlaceIds = new Set<string>();
  // Track original order from Google Places API (results are already sorted by relevance)
  const placeOrderMap = new Map<string, number>();
  let globalOrderIndex = 0;
  
  // STEP 0: Debug snapshot for 夜宵
  const debugSnapshot: any = category === '夜宵' && debugMode ? {
    key: 'night_snack',
    city: city,
    requests: [] as any[],
    responses: [] as any[],
    pipeline: {
      afterKeywordFilterCount: 0,
      afterDistanceFilterCount: 0,
      afterRatingFilterCount: 0,
      afterDedupCount: 0,
      finalCount: 0,
    },
    drops: {
      drop_keywordMismatch: 0,
      drop_distanceTooFar: 0,
      drop_ratingTooLow: 0,
      drop_missingFields: 0,
      drop_dedup: 0,
      drop_other: 0,
    },
    samples: {
      rawTop20: [] as any[],
      filteredTop20: [] as any[],
    },
    cache: { cacheHit: false, cacheAgeSec: 0, cacheWrite: false },
  } : null;

      for (const keyword of keywords) {
    try {
      // STEP 0: Log request details for 夜宵 debug
      const requestInfo = category === '夜宵' && debugMode ? {
        endpoint: 'places:searchText', // searchGooglePlacesNearby uses searchText when keyword is provided
        includedTypes: type ? [type] : undefined,
        keyword,
        radiusMeters: RADIUS_METERS,
        maxResultCount: 8, // Default in searchGooglePlacesNearby
        rankPreference: 'RELEVANCE',
        centerLatLng: { lat: searchCenter.lat, lng: searchCenter.lng },
      } : null;
      
      if (requestInfo && debugSnapshot) {
        debugSnapshot.requests.push(requestInfo);
      }
      
      const results = await searchGooglePlacesNearby(
        searchCenter,
        RADIUS_METERS,
        type,
        keyword,
        false, // debugMode
        category === '夜宵' && debugMode // enableDebugLog for 夜宵
      ).catch((error: any) => {
        // Log error but don't throw - continue with other keywords
        console.error(`[Spend Today] Error searching for keyword "${keyword}":`, error);
        
        // STEP 0: Log error in debug snapshot
        if (requestInfo && debugSnapshot) {
          debugSnapshot.responses.push({
            httpStatus: error.response?.status || 500,
            errorMessage: error.message || String(error),
            rawPlacesCount: 0,
          });
        }
        
        return [];
      });
      
      // STEP 0: Log response for 夜宵 debug
      if (requestInfo && debugSnapshot) {
        debugSnapshot.responses.push({
          httpStatus: 200,
          errorMessage: null,
          rawPlacesCount: results.length,
        });
        
        // Store raw top 20
        const rawTop20 = results.slice(0, 20).map(r => ({
          placeId: r.place_id,
          name: r.name,
          rating: r.rating,
          userRatingCount: r.user_ratings_total,
          address: r.formatted_address,
        }));
        debugSnapshot.samples.rawTop20.push(...rawTop20);
      }

      // Google Places API returns results sorted by relevance (best matches first)
      // We preserve this order by tracking the index
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        
        // Skip if already seen (from previous keyword)
        if (seenPlaceIds.has(result.place_id)) {
          if (debugSnapshot) {
            debugSnapshot.drops.drop_dedup++;
          }
          continue;
        }
        seenPlaceIds.add(result.place_id);
        
        if (debugSnapshot) {
          debugSnapshot.pipeline.afterDedupCount++;
        }
        
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
        if (!result.geometry?.location) {
          if (debugSnapshot) {
            debugSnapshot.drops.drop_missingFields++;
          }
          continue;
        }
        
        // Calculate distance from city center
        const distanceMiles = calculateDistanceMiles(
          searchCenter.lat,
          searchCenter.lng,
          result.geometry.location.lat,
          result.geometry.location.lng
        );
        
        // HARD LIMIT: Only keep places within 15 miles of city center (Cupertino or Sunnyvale)
        if (distanceMiles > MAX_DISTANCE_MILES) {
          if (debugSnapshot) {
            debugSnapshot.drops.drop_distanceTooFar++;
          }
          continue;
        }
        
        if (debugSnapshot) {
          debugSnapshot.pipeline.afterDistanceFilterCount++;
        }

        // COST OPTIMIZATION: Use data from searchNearby directly, NO getPlaceDetails call
        // This saves 1 API call per place (huge cost reduction!)
        
        // Special filtering for 奶茶 category - accept bubble tea shops
        // Filter by name only (no types check to avoid getPlaceDetails call)
        if (category === '奶茶') {
          const nameLower = result.name.toLowerCase();
          const addressLower = (result.formatted_address || '').toLowerCase();
          
          // Check if name or address contains bubble tea related keywords
          const hasBubbleTeaInName = nameLower.includes('bubble tea') || nameLower.includes('boba') || 
                                     nameLower.includes('奶茶') || nameLower.includes('珍珠奶茶') ||
                                     nameLower.includes('tapioca') || nameLower.includes('milk tea');
          const hasBubbleTeaInAddress = addressLower.includes('bubble tea') || addressLower.includes('boba');
          
          if (!hasBubbleTeaInName && !hasBubbleTeaInAddress) {
            continue;
          }
        }
        
        // Special filtering for 夜宵 category
        // COST OPTIMIZATION: Remove opening hours check (requires getPlaceDetails)
        // Filter by name only - accept if name contains 烤串/火锅 keywords
        if (category === '夜宵') {
          const nameLower = result.name.toLowerCase();
          const addressLower = (result.formatted_address || '').toLowerCase();
          
          const isBBQSkewersOrHotPot = 
            nameLower.includes('烤串') ||
            nameLower.includes('串串') ||
            nameLower.includes('火锅') ||
            nameLower.includes('hot pot') ||
            nameLower.includes('bbq') ||
            nameLower.includes('烧烤') ||
            nameLower.includes('烤肉') ||
            addressLower.includes('hot pot') ||
            addressLower.includes('bbq');
          
          // STEP 3: Check for known store (Hankow Cuisine) and use explainDrop (debug only)
          const isKnownStore = debugMode && nameLower.includes('hankow');
          
          if (isKnownStore && debugSnapshot) {
            const dropReasons = explainDropNightSnack(
              result,
              rating,
              userRatingsTotal,
              distanceMiles,
              isBBQSkewersOrHotPot
            );
            // Only log if actually dropped
            if (dropReasons.length > 0) {
              // Only log if actually dropped (debug mode)
              if (debugMode && dropReasons.length > 0) {
                console.log(`[Spend Today] 夜宵 - Hankow Cuisine dropped:`, dropReasons);
              }
            }
          }
          
          if (!isBBQSkewersOrHotPot) {
            if (debugSnapshot) {
              debugSnapshot.drops.drop_keywordMismatch++;
            }
            continue;
          }
          
          if (debugSnapshot) {
            debugSnapshot.pipeline.afterKeywordFilterCount++;
          }
        }
        
        // COST OPTIMIZATION: Get photo from searchNearby result (already in fieldMask)
        // Use first photo only, small size (200px - UI displays at ~176px width, so 200px is sufficient)
        let photoUrl: string | undefined;
        if (result.photos && result.photos.length > 0 && result.photos[0].photo_reference) {
          const photoRef = result.photos[0].photo_reference;
          // New API uses photo name (format: places/{place_id}/photos/{photo_id})
          if (photoRef.startsWith('places/')) {
            photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=200&key=${GOOGLE_PLACES_API_KEY}`;
          } else {
            // Fallback to legacy format
            photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=200&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
          }
        }

        // COST OPTIMIZATION: Construct Google Maps URL from place_id (no API call needed)
        const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;

        // Determine city name from coordinates (approximate)
        let cityName = city.charAt(0).toUpperCase() + city.slice(1).replace(' ', ' ');
        // Note: city is 'cupertino' | 'sunnyvale', so 'sanjose' check is not needed
        
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

      // COST OPTIMIZATION: Reduced delay (fewer keywords = less rate limiting needed)
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // Continue with other keywords
    }
  }

  // Sort by "popular" ranking: userRatingCount desc, then rating desc
  // This matches the requirement: "popular" = 先按 userRatingCount desc，再按 rating desc
  allPlaces.sort((a, b) => {
    // First sort by user_ratings_total (descending)
    if (b.user_ratings_total !== a.user_ratings_total) {
      return b.user_ratings_total - a.user_ratings_total;
    }
    // Then sort by rating (descending)
    if (b.rating !== a.rating) {
      return b.rating - a.rating;
    }
    // Finally use combined ranking score as tiebreaker
    const rankA = placeOrderMap.get(a.id) ?? Infinity;
    const rankB = placeOrderMap.get(b.id) ?? Infinity;
    const scoreA = calculateCombinedRankingScore(rankA, a.user_ratings_total);
    const scoreB = calculateCombinedRankingScore(rankB, b.user_ratings_total);
    return scoreA - scoreB; // Lower score = better
  });
  
  // STEP 0: Finalize debug snapshot for 夜宵
  if (debugSnapshot) {
    debugSnapshot.pipeline.finalCount = allPlaces.length;
    debugSnapshot.samples.filteredTop20 = allPlaces.slice(0, 20).map(p => ({
      placeId: p.id,
      name: p.name,
      rating: p.rating,
      userRatingCount: p.user_ratings_total,
      address: p.address,
    }));
    
    // Attach debug snapshot to return value
    (allPlaces as any).__debugSnapshot = debugSnapshot;
  }

  return allPlaces;
}

/**
 * Fetch all places from all cities and categories, then merge and sort by popularity
 */
/**
 * STEP 3: Explain why a place was dropped (for debug mode)
 */
function explainDrop(
  place: GooglePlaceResult,
  rating: number,
  userRatingsTotal: number | undefined,
  distanceMiles: number,
  tierThreshold: number
): { dropped: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (rating < 4.0) {
    reasons.push(`drop_ratingTooLow (${rating} < 4.0)`);
  }
  if (userRatingsTotal !== undefined && userRatingsTotal > tierThreshold) {
    reasons.push(`drop_userRatingCountTooHigh (${userRatingsTotal} > ${tierThreshold})`);
  }
  if (!place.geometry?.location) {
    reasons.push('drop_missingFields (no location)');
  }
  if (distanceMiles > MAX_DISTANCE_MILES) {
    reasons.push(`drop_distanceTooFar (${distanceMiles.toFixed(1)}mi > ${MAX_DISTANCE_MILES}mi)`);
  }
  
  return {
    dropped: reasons.length > 0,
    reasons,
  };
}

/**
 * STEP 4: Calculate Chinese/Bubble Tea relevance score (0-100)
 * Used as a boost, not a hard filter
 */
function calculateRelevanceScore(
  nameLower: string,
  addressLower: string,
  isForChinese: boolean
): number {
  let score = 0;
  
  if (isForChinese) {
    // Chinese restaurant keywords
    const chineseKeywords = ['chinese', '中餐', '川菜', '粤菜', '火锅', 'sichuan', 'cantonese', 'hot pot', 'x-pot', 'x pot', 'the x'];
    for (const keyword of chineseKeywords) {
      if (nameLower.includes(keyword)) score += 20;
      if (addressLower.includes(keyword)) score += 10;
    }
  } else {
    // Bubble tea keywords
    const bobaKeywords = ['bubble tea', 'boba', '奶茶', 'tapioca', 'milk tea'];
    for (const keyword of bobaKeywords) {
      if (nameLower.includes(keyword)) score += 20;
      if (addressLower.includes(keyword)) score += 10;
    }
  }
  
  return Math.min(100, score);
}

/**
 * STEP 5: Process results with tiered thresholds (30/80/150)
 * STEP 4: Chinese/Bubble Tea check is now a SCORE BOOST, not a hard filter
 * STEP 3: Use explainDrop for X-Pot debugging
 */
async function processResultsWithTieredThresholds(
  results: GooglePlaceResult[],
  seenPlaceIds: Set<string>,
  existingPlaces: SpendPlace[],
  searchCenter: { lat: number; lng: number },
  cityName: string,
  isForChinese: boolean,
  debugMode: boolean,
  debugInfo: any,
  dropCounters: {
    drop_dedup: number;
    drop_ratingTooLow: number;
    drop_userRatingCountTooHigh: number;
    drop_missingFields: number;
    drop_distanceTooFar: number;
  }
): Promise<SpendPlace[]> {
  const newPlaces: SpendPlace[] = [];
  
  // STEP 5: Tiered thresholds
  const TIERS = [
    { threshold: 30, ratingMin: 4.0 },
    { threshold: 80, ratingMin: 4.0 },
    { threshold: 150, ratingMin: 3.8 },
  ];
  
  for (const tier of TIERS) {
    if (existingPlaces.length + newPlaces.length >= 3) {
      break; // Stop once we have >= 3
    }
    
    const tierPlaces: SpendPlace[] = [];
    const tierDropCounters = {
      drop_dedup: 0,
      drop_ratingTooLow: 0,
      drop_userRatingCountTooHigh: 0,
      drop_missingFields: 0,
      drop_distanceTooFar: 0,
    };
    
    for (const result of results) {
      if (seenPlaceIds.has(result.place_id)) {
        tierDropCounters.drop_dedup++;
        continue;
      }
      
      const rating = result.rating || 0;
      const userRatingsTotal = result.user_ratings_total;
      
      // STEP 5: Apply tier threshold
      if (rating < tier.ratingMin) {
        tierDropCounters.drop_ratingTooLow++;
        continue;
      }
      if (userRatingsTotal !== undefined && userRatingsTotal > tier.threshold) {
        tierDropCounters.drop_userRatingCountTooHigh++;
        continue;
      }
      
      if (!result.geometry?.location) {
        tierDropCounters.drop_missingFields++;
        continue;
      }
      
      const distanceMiles = calculateDistanceMiles(
        searchCenter.lat,
        searchCenter.lng,
        result.geometry.location.lat,
        result.geometry.location.lng
      );
      
      if (distanceMiles > MAX_DISTANCE_MILES) {
        tierDropCounters.drop_distanceTooFar++;
        continue;
      }
      
      // STEP 3: Check for X-Pot and use explainDrop (debug only)
      const nameLower = result.name.toLowerCase();
      const addressLower = (result.formatted_address || '').toLowerCase();
      const isKnownStore = debugMode && (nameLower.includes('x-pot') || nameLower.includes('x pot') || 
                        (nameLower.includes('the x') && addressLower.includes('cupertino')));
      
      if (isKnownStore) {
        const dropExplanation = explainDrop(result, rating, userRatingsTotal, distanceMiles, tier.threshold);
        
        if (dropExplanation.dropped) {
          // Only log if dropped
          console.log(`[Spend Today] 新店打卡 - X-Pot dropped (tier ${tier.threshold}):`, dropExplanation.reasons);
          continue; // Skip if dropped at this tier
        }
        
        if (!debugInfo.knownStoreCheck) {
          debugInfo.knownStoreCheck = {
            found: true,
            inRawResults: true,
            place: {
              id: result.place_id,
              name: result.name,
              rating,
              userRatingCount: userRatingsTotal,
              address: result.formatted_address,
            },
            dropExplanation,
            willBeAdded: !dropExplanation.dropped,
          };
        }
      }
      
      // STEP 4: Calculate relevance score (boost, not filter)
      const relevanceScore = calculateRelevanceScore(nameLower, addressLower, isForChinese);
      
      // Get photo
      let photoUrl: string | undefined;
      if (result.photos && result.photos.length > 0 && result.photos[0].photo_reference) {
        const photoRef = result.photos[0].photo_reference;
        if (photoRef.startsWith('places/')) {
          photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=200&key=${GOOGLE_PLACES_API_KEY}`;
        } else {
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=200&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
        }
      }
      
      const mapsUrl = result.google_maps_uri || `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;
      const finalUserRatingsTotal = userRatingsTotal || 0;
      const newnessScore = calculateNewnessScore(rating, finalUserRatingsTotal);
      
      // STEP 4: Add relevance boost to newness score
      const finalScore = newnessScore + (relevanceScore * 0.1); // 10% boost from relevance
      
      seenPlaceIds.add(result.place_id);
      tierPlaces.push({
        id: result.place_id,
        name: result.name,
        category: '新店打卡',
        rating: rating,
        user_ratings_total: finalUserRatingsTotal,
        address: result.formatted_address || '',
        maps_url: mapsUrl,
        photo_url: photoUrl,
        city: cityName,
        score: finalScore,
        distance_miles: parseFloat(distanceMiles.toFixed(1)),
      });
    }
    
    // Update drop counters
    Object.keys(tierDropCounters).forEach(key => {
      const typedKey = key as keyof typeof tierDropCounters;
      dropCounters[typedKey] = (dropCounters[typedKey] || 0) + tierDropCounters[typedKey];
    });
    
    newPlaces.push(...tierPlaces);
    if (debugMode && tierPlaces.length > 0) {
      // Only log if places were added (debug mode)
      if (debugMode && tierPlaces.length > 0) {
        console.log(`[Spend Today] 新店打卡 - Tier ${tier.threshold}: +${tierPlaces.length}`);
      }
    }
  }
  
  return newPlaces;
}

/**
 * Fetch "新店打卡" places from 5 cities (Chinese restaurants + bubble tea)
 * Uses newness scoring based on userRatingCount
 * 
 * Search strategy:
 * - STEP 6: Prefer searchNearby for discovery, searchText only as fallback
 * - Chinese restaurants: includedTypes=["restaurant"]
 * - Bubble tea: includedTypes=["cafe", "restaurant"]
 * - STEP 4: Chinese/Bubble Tea check is now a SCORE BOOST, not a hard filter
 * - STEP 5: Tiered thresholds: tier1 (<=30), tier2 (<=80), tier3 (<=150)
 */
async function fetchNewPlaces(debugMode: boolean = false): Promise<SpendPlace[]> {
  const NEW_PLACES_CITIES: Array<keyof typeof CITY_COORDS> = ['cupertino', 'sunnyvale', 'sanjose', 'milpitas', 'fremont'];
  const RADIUS_METERS = 24140; // ~15 miles
  
  // Chinese restaurant keywords
  const CHINESE_KEYWORDS = ['Chinese', 'Chinese restaurant', '中餐', '川菜', '粤菜', '火锅', 'Sichuan', 'Cantonese'];
  // Bubble tea keywords
  const BUBBLE_TEA_KEYWORDS = ['bubble tea', 'boba', '奶茶'];
  
  const allPlaces: SpendPlace[] = [];
  const seenPlaceIds = new Set<string>();
  let apiCallsMade = 0;
  
  // Debug mode: collect debug info
  const debugInfo: any = {
    requests: [],
    rawPlacesByRequest: [] as any[],
    filteredPlacesByRequest: [] as any[],
    dropCountersByRequest: [] as any[],
    knownStoreCheck: null as any,
  };
  
  // STEP 6: Prefer searchNearby for discovery (no keywords, broader coverage)
  // Then use searchText with keywords only if results < 3
  for (const city of NEW_PLACES_CITIES) {
    const searchCenter = CITY_COORDS[city];
    // Format city name properly
    const cityNameMap: Record<string, string> = {
      'cupertino': 'Cupertino',
      'sunnyvale': 'Sunnyvale',
      'sanjose': 'San Jose',
      'milpitas': 'Milpitas',
      'fremont': 'Fremont',
    };
    const cityName = cityNameMap[city] || city.charAt(0).toUpperCase() + city.slice(1);
    
    // STEP 6: First try searchNearby (broader discovery, no keyword filter)
    const dropCounters = {
      drop_dedup: 0,
      drop_ratingTooLow: 0,
      drop_userRatingCountTooHigh: 0,
      drop_missingFields: 0,
      drop_distanceTooFar: 0,
    };
    
    try {
      const nearbyResults = await searchGooglePlacesNearby(
        searchCenter,
        RADIUS_METERS,
        'restaurant',
        undefined, // No keyword - use searchNearby
        false, // debugMode
        true // enableDebugLog
      );
      apiCallsMade++;
      if (debugMode) {
        console.log(`[Spend Today] 新店打卡 - Nearby search (${city}): ${nearbyResults.length} results`);
      }
      
      // STEP 1: Log raw places in debug mode
      if (debugMode) {
        const rawPlacesSummary = nearbyResults.slice(0, 20).map(r => ({
          id: r.place_id,
          displayName: r.name,
          rating: r.rating,
          userRatingCount: r.user_ratings_total,
          shortFormattedAddress: r.formatted_address,
        }));
        debugInfo.rawPlacesByRequest.push({
          request: { city, method: 'searchNearby', includedTypes: ['restaurant'], radiusMeters: RADIUS_METERS },
          rawPlacesCount: nearbyResults.length,
          rawPlaces: rawPlacesSummary,
        });
      }
      
      // Process nearby results with tiered thresholds (STEP 5)
      const tierResults = await processResultsWithTieredThresholds(
        nearbyResults,
        seenPlaceIds,
        allPlaces,
        searchCenter,
        cityName,
        true, // isForChinese
        debugMode,
        debugInfo,
        dropCounters
      );
      
      if (tierResults.length > 0) {
        allPlaces.push(...tierResults);
      }
      
      // STEP 2: Log filtered count and drop reasons
      if (debugMode) {
        debugInfo.filteredPlacesByRequest.push({
          request: { city, method: 'searchNearby' },
          rawPlacesCount: nearbyResults.length,
          filteredCount: tierResults.length,
          dropCounters: { ...dropCounters },
        });
      }
    } catch (error) {
      console.error(`[Spend Today] 🔍 新店打卡 - STEP 6 - Nearby search error (${city}):`, error);
    }
    
    // STEP 6: Fallback to searchText with keywords only if we still need more results
    if (allPlaces.length < 3) {
      // Search for Chinese restaurants with keywords (fallback)
      for (const keyword of CHINESE_KEYWORDS.slice(0, 3)) { // Limit to first 3 to reduce calls
        try {
        // STEP 1: Log request details (debug mode)
        const requestInfo = {
          city,
          center: { lat: searchCenter.lat, lng: searchCenter.lng },
          radiusMeters: RADIUS_METERS,
          includedTypes: ['restaurant'],
          keyword,
          maxResultCount: 8,
          rankPreference: 'RELEVANCE', // searchText uses relevance by default
        };
        
        if (debugMode) {
          debugInfo.requests.push(requestInfo);
        }
        
        const chineseResults = await searchGooglePlacesNearby(
          searchCenter,
          RADIUS_METERS,
          'restaurant',
          keyword,
          false, // debugMode
          true // enableDebugLog - only for 新店打卡
        );
        apiCallsMade++;
        
        // STEP 1: Log raw places (first 20) in debug mode
        if (debugMode) {
          const rawPlacesSummary = chineseResults.slice(0, 20).map(r => ({
            id: r.place_id,
            displayName: r.name,
            rating: r.rating,
            userRatingCount: r.user_ratings_total,
            shortFormattedAddress: r.formatted_address,
          }));
          debugInfo.rawPlacesByRequest.push({
            request: requestInfo,
            rawPlacesCount: chineseResults.length,
            rawPlaces: rawPlacesSummary,
          });
        }
        
        // STEP 2: Use tiered thresholds processing (STEP 5) for fallback searchText results
        const fallbackDropCounters = {
          drop_dedup: 0,
          drop_ratingTooLow: 0,
          drop_userRatingCountTooHigh: 0,
          drop_missingFields: 0,
          drop_distanceTooFar: 0,
        };
        
        const fallbackResults = await processResultsWithTieredThresholds(
          chineseResults,
          seenPlaceIds,
          allPlaces,
          searchCenter,
          cityName,
          true, // isForChinese
          debugMode,
          debugInfo,
          fallbackDropCounters
        );
        
        if (fallbackResults.length > 0) {
          allPlaces.push(...fallbackResults);
        }
        
        // STEP 2: Log filtered count and drop reasons
        if (debugMode) {
          debugInfo.filteredPlacesByRequest.push({
            request: requestInfo,
            rawPlacesCount: chineseResults.length,
            filteredCount: fallbackResults.length,
            dropCounters: fallbackDropCounters,
          });
        }
        
        // Small delay between keywords to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[Spend Today] Error fetching Chinese restaurants for ${city} with keyword "${keyword}":`, error);
      }
    }
    
    // Search for bubble tea with multiple keywords and types
    for (const keyword of BUBBLE_TEA_KEYWORDS) {
      // Try both cafe and restaurant types
      for (const type of ['cafe', 'restaurant']) {
        try {
          const bubbleTeaResults = await searchGooglePlacesNearby(
            searchCenter,
            RADIUS_METERS,
            type,
            keyword,
            false, // debugMode
            true // enableDebugLog - only for 新店打卡
          );
          apiCallsMade++;
          
          // STEP 2: Track filtering with detailed drop counters
          const dropCounters = {
            drop_dedup: 0,
            drop_ratingTooLow: 0,
            drop_userRatingCountTooHigh: 0,
            drop_missingFields: 0,
            drop_distanceTooFar: 0,
            drop_notBoba: 0,
          };
          
          const beforeAddCount = allPlaces.length;
          for (const result of bubbleTeaResults) {
            if (seenPlaceIds.has(result.place_id)) {
              dropCounters.drop_dedup++;
              continue;
            }
            seenPlaceIds.add(result.place_id);
            
            const rating = result.rating || 0;
            const userRatingsTotal = result.user_ratings_total;
            
            // Primary filter: rating >= 4.0 and userRatingCount <= 50
            // Treat missing userRatingCount as large but do NOT drop everything (allow if rating is good)
            if (rating < 4.0) {
              dropCounters.drop_ratingTooLow++;
              continue;
            }
            // Only filter by userRatingCount if it exists and is > 50
            if (userRatingsTotal !== undefined && userRatingsTotal > 50) {
              dropCounters.drop_userRatingCountTooHigh++;
              continue;
            }
            
            if (!result.geometry?.location) {
              dropCounters.drop_missingFields++;
              continue;
            }
            
            const distanceMiles = calculateDistanceMiles(
              searchCenter.lat,
              searchCenter.lng,
              result.geometry.location.lat,
              result.geometry.location.lng
            );
            
            if (distanceMiles > MAX_DISTANCE_MILES) {
              dropCounters.drop_distanceTooFar++;
              continue;
            }
            
            // Check if it's a bubble tea shop
            const nameLower = result.name.toLowerCase();
            const addressLower = (result.formatted_address || '').toLowerCase();
            const isBubbleTea = nameLower.includes('bubble tea') || nameLower.includes('boba') || 
                               nameLower.includes('奶茶') || nameLower.includes('tapioca') ||
                               addressLower.includes('bubble tea') || addressLower.includes('boba');
            
            if (!isBubbleTea) {
              dropCounters.drop_notBoba++;
              continue;
            }
            
            // Get photo (max 1)
            let photoUrl: string | undefined;
            if (result.photos && result.photos.length > 0 && result.photos[0].photo_reference) {
              const photoRef = result.photos[0].photo_reference;
              if (photoRef.startsWith('places/')) {
                photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=200&key=${GOOGLE_PLACES_API_KEY}`;
              } else {
                photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=200&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
              }
            }
            
            // Use googleMapsUri if available, otherwise construct from place_id
            const mapsUrl = result.google_maps_uri || `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;
            // Use 0 for userRatingCount if missing (for scoring purposes)
            const finalUserRatingsTotal = userRatingsTotal || 0;
            const newnessScore = calculateNewnessScore(rating, finalUserRatingsTotal);
            
            allPlaces.push({
              id: result.place_id,
              name: result.name,
              category: '新店打卡',
              rating: rating,
              user_ratings_total: finalUserRatingsTotal,
              address: result.formatted_address || '',
              maps_url: mapsUrl,
              photo_url: photoUrl,
              city: cityName,
              score: newnessScore,
              distance_miles: parseFloat(distanceMiles.toFixed(1)),
            });
          }
          
        // STEP 2: Log filtered count (debug only)
        if (debugMode) {
          const addedCount = allPlaces.length - beforeAddCount;
          const totalFiltered = Object.values(dropCounters).reduce((a, b) => a + b, 0);
          if (totalFiltered > 0) {
            // Only log if filtered (debug mode)
            if (debugMode && totalFiltered > 0) {
              console.log(`[Spend Today] 新店打卡 - Bubble tea filtered: ${addedCount}/${bubbleTeaResults.length}`);
            }
          }
        }
          
          // Small delay between searches to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[Spend Today] Error fetching bubble tea for ${city} with keyword "${keyword}" and type "${type}":`, error);
        }
      }
    }
    
    // Small delay between cities to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Sort by newness score (descending) - higher score = newer
  allPlaces.sort((a, b) => b.score - a.score);
  
  if (debugMode) {
    console.log(`[Spend Today] 新店打卡 - Initial: ${allPlaces.length} places (${apiCallsMade} calls)`);
  }
  
  // STEP 5: Tiered thresholds are now handled in processResultsWithTieredThresholds
  // Old relaxed search code removed - no longer needed
    if (debugMode) {
      // Only log in debug mode
      if (debugMode) {
        console.log(`[Spend Today] 新店打卡 - Relaxing threshold: ${allPlaces.length} places`);
      }
    }
    
    // Re-search with relaxed threshold (userRatingCount <= 100)
    const relaxedPlaces: SpendPlace[] = [];
    const relaxedSeenPlaceIds = new Set<string>(seenPlaceIds); // Keep existing places to avoid duplicates
    
    for (const city of NEW_PLACES_CITIES) {
      const searchCenter = CITY_COORDS[city];
      const cityNameMap: Record<string, string> = {
        'cupertino': 'Cupertino',
        'sunnyvale': 'Sunnyvale',
        'sanjose': 'San Jose',
        'milpitas': 'Milpitas',
        'fremont': 'Fremont',
      };
      const cityName = cityNameMap[city] || city.charAt(0).toUpperCase() + city.slice(1);
      
      // Re-search Chinese restaurants with relaxed threshold
      for (const keyword of CHINESE_KEYWORDS.slice(0, 3)) { // Limit to first 3 keywords to avoid too many calls
        try {
          const chineseResults = await searchGooglePlacesNearby(
            searchCenter,
            RADIUS_METERS,
            'restaurant',
            keyword,
            false, // debugMode
            true // enableDebugLog - only for 新店打卡
          );
          apiCallsMade++;
          
          // STEP 5: If rawPlacesCount>0 but filteredCount==0, relax filters
          
          for (const result of chineseResults) {
            if (relaxedSeenPlaceIds.has(result.place_id)) continue;
            relaxedSeenPlaceIds.add(result.place_id);
            
            const rating = result.rating || 0;
            const userRatingsTotal = result.user_ratings_total || 0;
            
            // Relaxed filter: rating >= 3.8 (relaxed from 4.0) and userRatingCount <= 100
            if (rating < 3.8 || userRatingsTotal > 100) continue;
            
            if (!result.geometry?.location) continue;
            
            const distanceMiles = calculateDistanceMiles(
              searchCenter.lat,
              searchCenter.lng,
              result.geometry.location.lat,
              result.geometry.location.lng
            );
            
            if (distanceMiles > MAX_DISTANCE_MILES) continue;
            
            // Check if it's a Chinese restaurant
            const nameLower = result.name.toLowerCase();
            const addressLower = (result.formatted_address || '').toLowerCase();
            const isChinese = nameLower.includes('chinese') || nameLower.includes('中餐') || 
                             nameLower.includes('川菜') || nameLower.includes('粤菜') ||
                             nameLower.includes('火锅') || nameLower.includes('sichuan') ||
                             nameLower.includes('cantonese') || addressLower.includes('chinese');
            
            if (!isChinese) continue;
            
            // Get photo
            let photoUrl: string | undefined;
            if (result.photos && result.photos.length > 0 && result.photos[0].photo_reference) {
              const photoRef = result.photos[0].photo_reference;
              if (photoRef.startsWith('places/')) {
                photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=200&key=${GOOGLE_PLACES_API_KEY}`;
              } else {
                photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=200&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
              }
            }
            
            const mapsUrl = result.google_maps_uri || `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;
            // Use 0 for userRatingCount if missing (for scoring purposes)
            const finalUserRatingsTotal = userRatingsTotal || 0;
            const newnessScore = calculateNewnessScore(rating, finalUserRatingsTotal);
            
            relaxedPlaces.push({
              id: result.place_id,
              name: result.name,
              category: '新店打卡',
              rating: rating,
              user_ratings_total: finalUserRatingsTotal,
              address: result.formatted_address || '',
              maps_url: mapsUrl,
              photo_url: photoUrl,
              city: cityName,
              score: newnessScore,
              distance_miles: parseFloat(distanceMiles.toFixed(1)),
            });
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[Spend Today] Error in relaxed search for Chinese restaurants (${city}, ${keyword}):`, error);
        }
      }
      
      // Re-search bubble tea with relaxed threshold
      for (const keyword of BUBBLE_TEA_KEYWORDS.slice(0, 2)) { // Limit to first 2 keywords
        for (const type of ['cafe', 'restaurant']) {
          try {
            const bubbleTeaResults = await searchGooglePlacesNearby(
              searchCenter,
              RADIUS_METERS,
              type,
              keyword,
              false, // debugMode
              true // enableDebugLog - only for 新店打卡
            );
            apiCallsMade++;
            
            // STEP 5: If rawPlacesCount>0 but filteredCount==0, relax filters
            
            for (const result of bubbleTeaResults) {
              if (relaxedSeenPlaceIds.has(result.place_id)) continue;
              relaxedSeenPlaceIds.add(result.place_id);
              
              const rating = result.rating || 0;
              const userRatingsTotal = result.user_ratings_total || 0;
              
              // Relaxed filter: rating >= 3.8 (relaxed from 4.0) and userRatingCount <= 100
              // Treat missing userRatingCount as large but do NOT drop everything
              if (rating < 3.8) continue;
              if (userRatingsTotal !== undefined && userRatingsTotal > 100) continue;
              
              if (!result.geometry?.location) continue;
              
              const distanceMiles = calculateDistanceMiles(
                searchCenter.lat,
                searchCenter.lng,
                result.geometry.location.lat,
                result.geometry.location.lng
              );
              
              if (distanceMiles > MAX_DISTANCE_MILES) continue;
              
              const nameLower = result.name.toLowerCase();
              const addressLower = (result.formatted_address || '').toLowerCase();
              const isBubbleTea = nameLower.includes('bubble tea') || nameLower.includes('boba') || 
                                 nameLower.includes('奶茶') || nameLower.includes('tapioca') ||
                                 addressLower.includes('bubble tea') || addressLower.includes('boba');
              
              if (!isBubbleTea) continue;
              
              let photoUrl: string | undefined;
              if (result.photos && result.photos.length > 0 && result.photos[0].photo_reference) {
                const photoRef = result.photos[0].photo_reference;
                if (photoRef.startsWith('places/')) {
                  photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=200&key=${GOOGLE_PLACES_API_KEY}`;
                } else {
                  photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=200&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
                }
              }
              
              const mapsUrl = result.google_maps_uri || `https://www.google.com/maps/place/?q=place_id:${result.place_id}`;
              // Use 0 for userRatingCount if missing (for scoring purposes)
              const finalUserRatingsTotal = userRatingsTotal || 0;
              const newnessScore = calculateNewnessScore(rating, finalUserRatingsTotal);
              
              relaxedPlaces.push({
                id: result.place_id,
                name: result.name,
                category: '新店打卡',
                rating: rating,
                user_ratings_total: finalUserRatingsTotal,
                address: result.formatted_address || '',
                maps_url: mapsUrl,
                photo_url: photoUrl,
                city: cityName,
                score: newnessScore,
                distance_miles: parseFloat(distanceMiles.toFixed(1)),
              });
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`[Spend Today] Error in relaxed search for bubble tea (${city}, ${keyword}, ${type}):`, error);
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Merge relaxed results (avoid duplicates)
    const existingIds = new Set(allPlaces.map(p => p.id));
    const newRelaxedPlaces = relaxedPlaces.filter(p => !existingIds.has(p.id));
    allPlaces.push(...newRelaxedPlaces);
    
    // Re-sort by newness score
    allPlaces.sort((a, b) => b.score - a.score);
    
    if (debugMode && newRelaxedPlaces.length > 0) {
      console.log(`[Spend Today] 新店打卡 - Relaxed search: +${newRelaxedPlaces.length} places`);
    }
  }
  
  if (debugMode) {
    // Only log summary in debug mode
    if (debugMode) {
      console.log(`[Spend Today] 新店打卡 - Final: ${allPlaces.length} places (${apiCallsMade} calls)`);
    }
  }
  
  // Debug mode: if known store not found, run wide net query
  if (debugMode && (!debugInfo.knownStoreCheck || !debugInfo.knownStoreCheck.found)) {
    try {
      // Wide net query: center near X-Pot, larger radius, no keyword filter
      const wideNetCenter = { lat: 37.3226, lng: -122.0405 }; // Near X-Pot Cupertino
      // Use searchNearby directly (not searchText) for wide net query
      const wideNetUrl = 'https://places.googleapis.com/v1/places:searchNearby';
      const wideNetRequestBody = {
        includedTypes: ['restaurant'],
        maxResultCount: 20, // Google Places API (New) limit: 1-20
        locationRestriction: {
          circle: {
            center: {
              latitude: wideNetCenter.lat,
              longitude: wideNetCenter.lng,
            },
            radius: 12000, // 12km radius
          },
        },
        rankPreference: 'DISTANCE', // Use DISTANCE to surface nearby places
      };
      
      const wideNetResponse = await fetch(wideNetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.photos,places.googleMapsUri',
        },
        body: JSON.stringify(wideNetRequestBody),
      });
      
      if (!wideNetResponse.ok) {
        const errorText = await wideNetResponse.text();
        console.error(`[Spend Today] 🔍 新店打卡 - STEP 2 - Wide net HTTP error: ${wideNetResponse.status}`, errorText);
        throw new Error(`Wide net query failed: ${wideNetResponse.status}`);
      }
      
      const wideNetData: NewPlacesSearchNearbyResponse = await wideNetResponse.json();
      const wideNetPlaces = wideNetData.places || [];
      
      // Convert to GooglePlaceResult format
      const wideNetResults: GooglePlaceResult[] = wideNetPlaces.map(place => ({
        place_id: place.id,
        name: place.displayName?.text || '',
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        formatted_address: place.formattedAddress,
        geometry: place.location ? {
          location: {
            lat: place.location.latitude,
            lng: place.location.longitude,
          },
        } : undefined,
        photos: place.photos && place.photos.length > 0 ? [{
          photo_reference: place.photos[0].name,
        }] : undefined,
        google_maps_uri: place.googleMapsUri,
      }));
      
      // Check if X-Pot appears in wide net results
      const xPotResult = wideNetResults.find(r => 
        r.name.toLowerCase().includes('x-pot') || 
        r.name.toLowerCase().includes('x pot')
      );
      
      if (xPotResult) {
        debugInfo.knownStoreCheck = {
          found: true,
          inRawResults: true,
          inWideNet: true,
          place: {
            id: xPotResult.place_id,
            name: xPotResult.name,
            rating: xPotResult.rating,
            userRatingCount: xPotResult.user_ratings_total,
            address: xPotResult.formatted_address,
          },
          wideNetQuery: {
            center: wideNetCenter,
            radiusMeters: 12000,
            includedTypes: ['restaurant'],
            keyword: undefined,
            maxResultCount: 20, // Google Places API (New) limit: 1-20
            rawPlacesCount: wideNetResults.length,
          },
        };
      } else {
        debugInfo.knownStoreCheck = {
          found: false,
          inRawResults: false,
          inWideNet: false,
          wideNetQuery: {
            center: wideNetCenter,
            radiusMeters: 12000,
            includedTypes: ['restaurant'],
            keyword: undefined,
            maxResultCount: 20, // Google Places API (New) limit: 1-20
            rawPlacesCount: wideNetResults.length,
          },
        };
      }
    } catch (error) {
      console.error(`[Spend Today] 🔍 新店打卡 - STEP 2 - Wide net query error:`, error);
    }
  }
  
  // Attach debug info to return value (will be used in handler if debug mode)
  (allPlaces as any).__debugInfo = debugMode ? debugInfo : undefined;
  
  return allPlaces;
}

// Remove old relaxed search code - now handled by tiered thresholds

async function fetchAllPlacesFromGoogle(debugMode: boolean = false): Promise<SpendPlace[]> {
  // Only search in Cupertino and Sunnyvale (no San Jose)
  const cities: Array<keyof typeof CITY_COORDS> = ['cupertino', 'sunnyvale'];
  const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '夜宵'];
  
  const allPlaces: SpendPlace[] = [];
  // Track global order across all cities/categories to preserve Google Places ranking
  const globalPlaceOrderMap = new Map<string, number>();
  let globalOrderIndex = 0;
  
  // Collect debug snapshots for 夜宵
  const nightSnackDebugSnapshots: any[] = [];
  
  // Fetch from all combinations (excluding 新店打卡 which is handled separately)
  for (const city of cities) {
    for (const category of categories) {
      try {
        // Don't pass userLocation - always use city center to ensure distance filtering works correctly
        const places = await fetchPlacesForCategory(city, category, debugMode);
        
        // Extract debug snapshot for 夜宵
        if (category === '夜宵') {
          const debugSnapshot = (places as any).__debugSnapshot;
          if (debugSnapshot) {
            delete (places as any).__debugSnapshot;
            nightSnackDebugSnapshots.push(debugSnapshot);
          }
        }
        
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
        // Continue with other cities/categories
      }
    }
  }
  
  // Store debug snapshots for handler
  (allPlaces as any).__nightSnackDebugSnapshots = nightSnackDebugSnapshots;
  
  // Fetch "新店打卡" separately (5 cities, Chinese restaurants + bubble tea)
  try {
    const newPlaces = await fetchNewPlaces(debugMode);
    // Extract debug info if present
    const newPlacesDebugInfo = (newPlaces as any).__debugInfo;
    if (newPlacesDebugInfo) {
      delete (newPlaces as any).__debugInfo;
    }
    
    // Assign global order indices
    for (const place of newPlaces) {
      if (!globalPlaceOrderMap.has(place.id)) {
        globalPlaceOrderMap.set(place.id, globalOrderIndex++);
      }
      place.googlePlacesRank = globalPlaceOrderMap.get(place.id);
    }
    allPlaces.push(...newPlaces);
    
    // Store debug info for handler
    (allPlaces as any).__newPlacesDebugInfo = newPlacesDebugInfo;
  } catch (error) {
    console.error('[Spend Today] Error fetching new places:', error);
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
  
  // Sort by "popular" ranking: userRatingCount desc, then rating desc
  // This matches the requirement: "popular" = 先按 userRatingCount desc，再按 rating desc
  const sortedPlaces = Array.from(uniquePlaces.values()).sort((a, b) => {
    // First sort by user_ratings_total (descending)
    if (b.user_ratings_total !== a.user_ratings_total) {
      return b.user_ratings_total - a.user_ratings_total;
    }
    // Then sort by rating (descending)
    if (b.rating !== a.rating) {
      return b.rating - a.rating;
    }
    // Finally use combined ranking score as tiebreaker
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
 * Returns: { '奶茶': [...], '中餐': [...], '新店打卡': [...], '夜宵': [...] }
 */
function groupPlacesByCategory(places: SpendPlace[]): Record<string, SpendPlace[]> {
  const byCategory: Record<string, SpendPlace[]> = {
    '奶茶': [],
    '中餐': [],
    '新店打卡': [],
    '夜宵': [],
  };
  
  places.forEach(place => {
    if (byCategory[place.category]) {
      byCategory[place.category].push(place);
    }
  });
  
  // Sort each category by score and take top 50
  // For 新店打卡, score is newness score (higher = newer)
  // For other categories, score is popularity score (higher = more popular)
  const result: Record<string, SpendPlace[]> = {};
  for (const category of Object.keys(byCategory)) {
    result[category] = byCategory[category]
      .sort((a, b) => b.score - a.score) // Higher score = better (works for both newness and popularity)
      .slice(0, 50); // Return top 50 places per category
  }
  
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // STEP 1 & 2: Sanity checks
  const debugMode = req.query.debug === '1';
  
  // STEP 1 & 2: Sanity checks for Hankow Cuisine (夜宵)
  const nightSnackSanityCheck = req.query.nightSnackSanityCheck === '1';
  
  if (nightSnackSanityCheck && debugMode) {
    try {
      // STEP 0: Try to extract Place ID from Google Maps short link
      const mapsShortLink = 'https://maps.app.goo.gl/DvQuw1BbziDNf6N88';
      
      let placeIdFromLink: string | null = null;
      let placeDetailsFromLink: any = null;
      
      try {
        // Follow redirect to get full URL
        const redirectResponse = await fetch(mapsShortLink, { method: 'HEAD', redirect: 'follow' });
        const fullUrl = redirectResponse.url;
        
        // Try to extract place_id from URL (format: .../place/.../... or ...?cid=... or .../data=...)
        const placeIdMatch = fullUrl.match(/place[\/=]([^\/\?&]+)/i) || fullUrl.match(/cid[=:]([^&]+)/i);
        if (placeIdMatch) {
          placeIdFromLink = placeIdMatch[1];
        }
        
        // If we have a place_id, try to get place details
        if (placeIdFromLink) {
          const placeDetailsUrl = `https://places.googleapis.com/v1/places/${placeIdFromLink}`;
          const placeDetailsResponse = await fetch(placeDetailsUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
              'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,formattedAddress,location,googleMapsUri',
            },
          });
          
          if (placeDetailsResponse.ok) {
            placeDetailsFromLink = await placeDetailsResponse.json();
          }
        }
      } catch (linkError: any) {
        console.error(`[Spend Today] Error resolving link:`, linkError);
      }
      
      // STEP 1: Direct query for "Hankow Cuisine" - try multiple variations
      const directQueryUrl = 'https://places.googleapis.com/v1/places:searchText';
      
      // Try multiple query variations
      const queryVariations = [
        'Hankow Cuisine Sunnyvale',
        'Hankow Cuisine',
        'Hankow Cuisine Cupertino',
        'Hankow Cuisine San Jose',
        'Hankow Cuisine Bay Area',
        'Hankou Cuisine', // Alternative spelling
        '汉口食府', // Chinese name if applicable
      ];
      
      const directResults: any[] = [];
      let hankowFound = false;
      let hankowData: any = null;
      
      for (const queryText of queryVariations) {
        const directQueryBody = {
          textQuery: queryText,
          maxResultCount: 10, // Increased to 10 for better coverage
        };
        
        try {
          const directResponse = await fetch(directQueryUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.googleMapsUri',
            },
            body: JSON.stringify(directQueryBody),
          });
          
          if (!directResponse.ok) {
            const errorText = await directResponse.text();
            console.error(`[Spend Today] Direct query error for "${queryText}": ${directResponse.status}`);
            continue; // Try next variation
          }
          
          const directData: NewPlacesSearchNearbyResponse = await directResponse.json();
          const directPlaces = directData.places || [];
          
          const queryResults = directPlaces.map(p => ({
            name: p.displayName?.text,
            placeId: p.id,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
            address: p.formattedAddress,
            googleMapsUri: p.googleMapsUri,
          }));
          
          directResults.push(...queryResults);
          
          // Check if Hankow Cuisine appears in this query
          const hankowInThisQuery = queryResults.find(r => 
            r.name?.toLowerCase().includes('hankow') || 
            r.name?.toLowerCase().includes('han kow')
          );
          
          if (hankowInThisQuery && !hankowFound) {
            hankowFound = true;
            hankowData = hankowInThisQuery;
          }
          
          // Small delay between queries
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
          console.error(`[Spend Today] Error for query "${queryText}":`, error);
          continue; // Try next variation
        }
      }
      
      // Deduplicate results by placeId
      const uniqueDirectResults = Array.from(
        new Map(directResults.map(r => [r.placeId, r])).values()
      );
      
      // STEP 2: Nearby search for multiple cities (wide net)
      const nearbyUrl = 'https://places.googleapis.com/v1/places:searchNearby';
      
      // Try multiple cities
      const citiesToTest = [
        { name: 'Sunnyvale', center: CITY_COORDS.sunnyvale },
        { name: 'Cupertino', center: CITY_COORDS.cupertino },
        { name: 'San Jose', center: CITY_COORDS.sanjose },
      ];
      
      const allNearbyResults: any[] = [];
      let hankowInNearby: any = null;
      
      for (const city of citiesToTest) {
        const nearbyBody = {
          includedTypes: ['restaurant'],
          maxResultCount: 20, // Google Places API (New) limit: 1-20
          locationRestriction: {
            circle: {
              center: {
                latitude: city.center.lat,
                longitude: city.center.lng,
              },
              radius: 12000, // 12km
            },
          },
          rankPreference: 'DISTANCE',
        };
        
        try {
          const nearbyResponse = await fetch(nearbyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.googleMapsUri',
            },
            body: JSON.stringify(nearbyBody),
          });
          
          if (!nearbyResponse.ok) {
            const errorText = await nearbyResponse.text();
            console.error(`[Spend Today] Nearby search error for ${city.name}: ${nearbyResponse.status}`);
            continue; // Try next city
          }
          
          const nearbyData: NewPlacesSearchNearbyResponse = await nearbyResponse.json();
          const nearbyPlaces = nearbyData.places || [];
          
          const cityResults = nearbyPlaces.map(p => ({
            name: p.displayName?.text,
            placeId: p.id,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
            address: p.formattedAddress,
          }));
          
          allNearbyResults.push(...cityResults);
          
          // Check if Hankow Cuisine appears in this city's results
          const hankowInThisCity = cityResults.find(r => 
            r.name?.toLowerCase().includes('hankow') || 
            r.name?.toLowerCase().includes('han kow')
          );
          
          if (hankowInThisCity && !hankowInNearby) {
            hankowInNearby = hankowInThisCity;
          }
          
          // Small delay between cities
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
          console.error(`[Spend Today] Error for ${city.name}:`, error);
          continue; // Try next city
        }
      }
      
      // Deduplicate nearby results by placeId
      const uniqueNearbyResults = Array.from(
        new Map(allNearbyResults.map(r => [r.placeId, r])).values()
      );
      
      // Check if place from link matches any results
      let hankowFromLink = false;
      if (placeDetailsFromLink) {
        const linkPlaceId = placeDetailsFromLink.id;
        const linkName = placeDetailsFromLink.displayName?.text?.toLowerCase() || '';
        
        // Check if it appears in direct query results
        const foundInDirect = uniqueDirectResults.find(r => 
          r.placeId === linkPlaceId || 
          r.name?.toLowerCase().includes(linkName.split(' ')[0])
        );
        
        // Check if it appears in nearby results
        const foundInNearby = uniqueNearbyResults.find(r => 
          r.placeId === linkPlaceId || 
          r.name?.toLowerCase().includes(linkName.split(' ')[0])
        );
        
        if (foundInDirect || foundInNearby) {
          hankowFromLink = true;
          if (!hankowFound && foundInDirect) {
            hankowFound = true;
            hankowData = foundInDirect;
          }
          if (!hankowInNearby && foundInNearby) {
            hankowInNearby = foundInNearby;
          }
        }
      }
      
      setCorsHeaders(res);
      return res.status(200).json({
        debug: true,
        nightSnackSanityCheck: true,
        step0_fromLink: {
          mapsLink: mapsShortLink,
          placeId: placeIdFromLink,
          placeDetails: placeDetailsFromLink ? {
            name: placeDetailsFromLink.displayName?.text,
            placeId: placeDetailsFromLink.id,
            rating: placeDetailsFromLink.rating,
            userRatingCount: placeDetailsFromLink.userRatingCount,
            address: placeDetailsFromLink.formattedAddress,
            googleMapsUri: placeDetailsFromLink.googleMapsUri,
          } : null,
          foundInResults: hankowFromLink,
        },
        step1_directQuery: {
          queries: queryVariations,
          resultsCount: uniqueDirectResults.length,
          results: uniqueDirectResults,
          hankowFound: hankowFound,
          hankowData: hankowData,
        },
        step2_nearbySearch: {
          cities: citiesToTest.map(c => c.name),
          radius: 12000,
          resultsCount: uniqueNearbyResults.length,
          results: uniqueNearbyResults,
          hankowFound: !!hankowInNearby,
          hankowData: hankowInNearby,
        },
        summary: {
          foundFromLink: hankowFromLink,
          foundInDirectQuery: hankowFound,
          foundInNearbySearch: !!hankowInNearby,
          conclusion: hankowFromLink || hankowFound || hankowInNearby
            ? 'Hankow Cuisine exists in Google Places API' 
            : 'Hankow Cuisine NOT found in Google Places API - may need to check: 1) Place ID/name spelling, 2) API permissions, 3) Place may be permanently closed',
        },
      });
    } catch (error: any) {
      console.error(`[Spend Today] 🔍 STEP 1/2 - Night snack sanity check error:`, error);
      setCorsHeaders(res);
      return res.status(500).json({
        debug: true,
        nightSnackSanityCheck: true,
        error: error.message || String(error),
      });
    }
  }
  
  // STEP 1 & 2: Sanity checks for X-Pot (新店打卡)
  const xPotSanityCheck = req.query.sanityCheck === '1';
  
  if (xPotSanityCheck && debugMode) {
    try {
      // STEP 1: Direct query for "The X-Pot Cupertino"
      const directQueryUrl = 'https://places.googleapis.com/v1/places:searchText';
      const directQueryBody = {
        textQuery: 'The X-Pot Cupertino',
        maxResultCount: 10,
      };
      
      const directResponse = await fetch(directQueryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.googleMapsUri',
        },
        body: JSON.stringify(directQueryBody),
      });
      
      if (!directResponse.ok) {
        const errorText = await directResponse.text();
        console.error(`[Spend Today] 🔍 STEP 1 - HTTP error: ${directResponse.status}`, errorText);
        throw new Error(`Direct query failed: ${directResponse.status}`);
      }
      
      const directData: NewPlacesSearchNearbyResponse = await directResponse.json();
      const directPlaces = directData.places || [];
      const directResults = directPlaces.map(p => ({
        name: p.displayName?.text,
        placeId: p.id,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        address: p.formattedAddress,
      }));
      
      // STEP 2: Nearby search for Cupertino
      const cupertinoCenter = CITY_COORDS.cupertino;
      const nearbyUrl = 'https://places.googleapis.com/v1/places:searchNearby';
      const nearbyBody = {
        includedTypes: ['restaurant'],
        maxResultCount: 20, // Google Places API (New) limit: 1-20
        locationRestriction: {
          circle: {
            center: {
              latitude: cupertinoCenter.lat,
              longitude: cupertinoCenter.lng,
            },
            radius: 12000, // 12km
          },
        },
        rankPreference: 'DISTANCE',
      };
      
      const nearbyResponse = await fetch(nearbyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.googleMapsUri',
        },
        body: JSON.stringify(nearbyBody),
      });
      
      if (!nearbyResponse.ok) {
        const errorText = await nearbyResponse.text();
        console.error(`[Spend Today] 🔍 STEP 2 - HTTP error: ${nearbyResponse.status}`, errorText);
        throw new Error(`Nearby search failed: ${nearbyResponse.status}`);
      }
      
      const nearbyData: NewPlacesSearchNearbyResponse = await nearbyResponse.json();
      const nearbyPlaces = nearbyData.places || [];
      const nearbyResults = nearbyPlaces.map(p => ({
        name: p.displayName?.text,
        placeId: p.id,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        address: p.formattedAddress,
      }));
      
      // Check if X-Pot appears in either result
      const xPotInDirect = directResults.find(r => r.name?.toLowerCase().includes('x-pot') || r.name?.toLowerCase().includes('x pot'));
      const xPotInNearby = nearbyResults.find(r => r.name?.toLowerCase().includes('x-pot') || r.name?.toLowerCase().includes('x pot'));
      
      setCorsHeaders(res);
      return res.status(200).json({
        debug: true,
        sanityCheck: true,
        step1_directQuery: {
          query: 'The X-Pot Cupertino',
          resultsCount: directPlaces.length,
          results: directResults,
          xPotFound: !!xPotInDirect,
          xPotData: xPotInDirect || null,
        },
        step2_nearbySearch: {
          center: cupertinoCenter,
          radius: 12000,
          resultsCount: nearbyPlaces.length,
          results: nearbyResults,
          xPotFound: !!xPotInNearby,
          xPotData: xPotInNearby || null,
        },
      });
    } catch (error: any) {
      console.error(`[Spend Today] 🔍 STEP 1/2 - Sanity check error:`, error);
      setCorsHeaders(res);
      return res.status(500).json({
        debug: true,
        sanityCheck: true,
        error: error.message || String(error),
      });
    }
  }
  
  // STEP 3: Debug bypass mode (?debug=1&bypassFilter=1)
  const bypassFilter = req.query.bypassFilter === '1';
  
  if (bypassFilter && debugMode) {
    console.log(`[Spend Today] 🔍 STEP 3 - DEBUG BYPASS MODE: Running minimal query (San Jose, Chinese, restaurant)`);
    
    try {
      // Minimal query: San Jose, Chinese, restaurant, radius=10000m, maxResultCount=10
      const sanJoseCenter = CITY_COORDS.sanjose;
      const bypassResults = await searchGooglePlacesNearby(
        sanJoseCenter,
        10000, // 10km radius
        'restaurant',
        'Chinese',
        true // debugMode = true (bypass filtering in searchGooglePlacesNearby)
      );
      
      // Return first 5 places with raw data (no filtering)
      const rawPlaces = bypassResults.slice(0, 5).map(result => ({
        name: result.name,
        rating: result.rating,
        userRatingCount: result.user_ratings_total,
        place_id: result.place_id,
        address: result.formatted_address,
      }));
      
      setCorsHeaders(res);
      return res.status(200).json({
        debug: true,
        bypassMode: true,
        rawPlacesCount: bypassResults.length,
        places: rawPlaces,
        requestSummary: {
          city: 'San Jose',
          keyword: 'Chinese',
          includedTypes: ['restaurant'],
          radiusMeters: 10000,
          maxResultCount: 10,
        },
      });
    } catch (error: any) {
      console.error(`[Spend Today] 🔍 STEP 3 - Bypass Error:`, error);
      setCorsHeaders(res);
      return res.status(500).json({
        debug: true,
        bypassMode: true,
        error: error.message || String(error),
        rawPlacesCount: 0,
      });
    }
  }
  // Security logging at handler start (only in non-production)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Spend Today] Handler started');
  }
  
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
      }
    }
    
    // COST OPTIMIZATION: Aggressive caching (12 hours TTL)
    // Cache key is location-independent since we search from city centers
    const cached = getCachedData(cacheKey, SPEND_TODAY_CACHE_TTL, nocache);
    if (cached && !nocache) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, { name: 'Google Places', url: 'https://maps.google.com' }, ttlMsToSeconds(SPEND_TODAY_CACHE_TTL), 'spend-today');
      
      // COST OPTIMIZATION DEBUG: Log cache hit
      const totalPlaces = cachedData.items?.length || Object.values(cachedData.itemsByCategory || {}).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      console.log(`[Spend Today] ✅ Cache HIT: ${totalPlaces} total places, age: ${cached.cacheAgeSeconds}s`);
      
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
    
    // Log cache miss (only in debug mode)
    if (debugMode) {
      console.log(`[Spend Today] Cache MISS: fetching from API`);
    }

    // Fetch from Google Places API
    // If API key is not configured, skip API call and go directly to stale cache or seed data fallback
    let allPlaces: SpendPlace[] = [];
    if (!GOOGLE_PLACES_API_KEY) {
      console.warn('[Spend Today] GOOGLE_PLACES_API_KEY not configured, skipping API call and using fallback');
      console.warn('[Spend Today] Debug: process.env.GOOGLE_PLACES_API_KEY =', process.env.GOOGLE_PLACES_API_KEY ? `[Set, length: ${process.env.GOOGLE_PLACES_API_KEY.length}]` : '[Not set]');
      console.warn('[Spend Today] All env vars containing "GOOGLE":', Object.keys(process.env).filter(k => k.toUpperCase().includes('GOOGLE')).join(', ') || 'None found');
      allPlaces = [];
    } else {
      // Don't use userLocation - always search from city centers to ensure distance filtering
      try {
        // COST OPTIMIZATION DEBUG: Track API calls
        const apiCallStartTime = Date.now();
        allPlaces = await fetchAllPlacesFromGoogle(debugMode);
        const apiCallDuration = Date.now() - apiCallStartTime;
        
        // Log API call summary (only in debug mode)
        if (debugMode) {
          console.log(`[Spend Today] API calls: ${apiCallDuration}ms, ${allPlaces.length} places`);
        }
      } catch (apiError: any) {
        console.error('[Spend Today] Error fetching from Google Places API:', apiError);
        // If API fails (e.g., REQUEST_DENIED, billing issue), continue to stale cache or seed data fallback
        allPlaces = [];
      }
    }
    
    if (allPlaces.length === 0) {
      // Try to return stale cache if available
      const stale = getStaleCache(cacheKey);
      if (stale && stale.data && (stale.data.items?.length > 0 || Object.keys(stale.data.itemsByCategory || {}).length > 0)) {
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
          '新店打卡': 'new_places',
          '夜宵': 'late_night',
        };
        
        // Convert Chinese keys to English keys if needed
        const normalizedItemsByCategory: Record<string, SpendPlace[]> = {
          'milk_tea': [],
          'chinese': [],
          'new_places': [],
          'late_night': [],
        };
        
        for (const [key, places] of Object.entries(itemsByCategory)) {
          const englishKey = CATEGORY_KEY_MAP[key] || key;
          if (normalizedItemsByCategory.hasOwnProperty(englishKey)) {
            // Limit to 5 items + 1 random per category
            const categoryPlaces = places as SpendPlace[];
            const top5 = categoryPlaces.slice(0, 5);
            if (categoryPlaces.length > 5) {
              const remaining = categoryPlaces.slice(5);
              const randomPlace = remaining[Math.floor(Math.random() * remaining.length)];
              randomPlace.category = `${key} (随机选店)`;
              top5.push(randomPlace);
            }
            normalizedItemsByCategory[englishKey] = top5;
          } else if (key === 'milk_tea' || key === 'chinese' || key === 'new_places' || key === 'late_night') {
            // Limit to 5 items + 1 random per category
            const categoryPlaces = places as SpendPlace[];
            const top5 = categoryPlaces.slice(0, 5);
            if (categoryPlaces.length > 5) {
              const remaining = categoryPlaces.slice(5);
              const randomPlace = remaining[Math.floor(Math.random() * remaining.length)];
              randomPlace.category = `${key} (随机选店)`;
              top5.push(randomPlace);
            }
            normalizedItemsByCategory[key] = top5;
          }
        }
        
        // Rebuild flat items array for backward compatibility
        items = Object.values(normalizedItemsByCategory).flat();
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).json({
          ...staleData,
          itemsByCategory: normalizedItemsByCategory,
          items: items.slice(0, 24), // Up to 6 per category * 4 categories (5 items + 1 random)
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
      '新店打卡': [],
      '夜宵': [],
    };
    
    // Group all places by their category field
    for (const place of allPlaces) {
      const placeCategory = place.category;
      
      // Try exact match first
      if (placesByCategoryDirect.hasOwnProperty(placeCategory)) {
        placesByCategoryDirect[placeCategory].push(place);
      } else {
        // Try to match by checking if the category string matches any expected category
        const expectedCategories: string[] = ['奶茶', '中餐', '新店打卡', '夜宵'];
        const matched = expectedCategories.find(cat => {
          // Compare by byte representation to avoid encoding issues
          const placeBytes = Buffer.from(placeCategory, 'utf8').toString('hex');
          const catBytes = Buffer.from(cat, 'utf8').toString('hex');
          return placeBytes === catBytes || placeCategory === cat;
        });
        
        if (matched) {
          placesByCategoryDirect[matched].push(place);
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
    
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(SPEND_TODAY_CACHE_TTL);
    
    // Group by category - NO fallback data, only real places
    // IMPORTANT: Use English keys for itemsByCategory to avoid JSON encoding issues
    // Each place still has the correct Chinese category field
    const CATEGORY_MILK_TEA = '奶茶';
    const CATEGORY_CHINESE = '中餐';
    const CATEGORY_NEW_PLACES = '新店打卡';
    const CATEGORY_LATE_NIGHT = '夜宵';
    
    // Map Chinese category names to English keys for JSON serialization
    const CATEGORY_KEY_MAP: Record<string, string> = {
      [CATEGORY_MILK_TEA]: 'milk_tea',
      [CATEGORY_CHINESE]: 'chinese',
      [CATEGORY_NEW_PLACES]: 'new_places',
      [CATEGORY_LATE_NIGHT]: 'late_night',
    };
    
    const categories: string[] = [CATEGORY_MILK_TEA, CATEGORY_CHINESE, CATEGORY_NEW_PLACES, CATEGORY_LATE_NIGHT];
    const finalPlacesByCategory: Record<string, SpendPlace[]> = {
      'milk_tea': [],
      'chinese': [],
      'new_places': [],
      'late_night': [],
    };
    
    for (const category of categories) {
      
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
          const existingIds = new Set(categoryPlaces.map(p => p.id));
          const additionalItems = validStaleItems.filter(p => !existingIds.has(p.id));
          categoryPlaces = [...categoryPlaces, ...additionalItems]
            .sort((a, b) => {
              // For 新店打卡, sort by newness score (higher = newer)
              // For other categories, sort by combined ranking: Google Places rank + new business bonus
              if (category === '新店打卡') {
                return b.score - a.score; // Higher newness score = better
              } else {
                const rankA = a.googlePlacesRank ?? Infinity;
                const rankB = b.googlePlacesRank ?? Infinity;
                const scoreA = calculateCombinedRankingScore(rankA, a.user_ratings_total);
                const scoreB = calculateCombinedRankingScore(rankB, b.user_ratings_total);
                return scoreA - scoreB; // Lower score = better
              }
            })
            .slice(0, 50); // Return top 50 places per category (ranked by combined score)
        } else {
          console.warn(`[Spend Today] No stale cache available for ${category}`);
        }
      }
      
      // Use English key for itemsByCategory, but keep Chinese category in each place
      const englishKey = CATEGORY_KEY_MAP[category];
      if (englishKey) {
        // For all categories: ensure we have at least 6 places (5 normal + 1 random) for carousel display
        // If we have < 6, pad with seed data
        if (categoryPlaces.length < 6) {
          // Use FOOD_SEED_DATA directly to get all seed places for this category
          const seedForCategory = FOOD_SEED_DATA.filter(p => p.category === category);
          if (seedForCategory.length > 0) {
            const seedSpendPlaces: SpendPlace[] = seedForCategory.map(p => ({
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
            // Add seed places that are not already in categoryPlaces
            const existingIds = new Set(categoryPlaces.map(p => p.id));
            const newSeedPlaces = seedSpendPlaces.filter(p => !existingIds.has(p.id));
            // Add enough seed places to reach at least 6 total
            const needed = 6 - categoryPlaces.length;
            categoryPlaces = [...categoryPlaces, ...newSeedPlaces.slice(0, needed)];
            console.log(`[Spend Today] Added ${Math.min(newSeedPlaces.length, needed)} seed places for ${category}, total now: ${categoryPlaces.length}`);
          }
        }
        
        // Ensure we have at least 6 places for carousel (5 normal + 1 random)
        // If still < 6 after seed data addition, use all available places
        if (categoryPlaces.length < 6) {
          console.warn(`[Spend Today] WARNING: Category ${category} still has only ${categoryPlaces.length} places after seed data addition`);
        }
        
        // For all categories: ensure we have at least 6 places (5 normal + 1 random) for carousel display
        // For 新店打卡, sort by newness score (higher = newer)
        // For other categories, already sorted by popularity
        if (category === '新店打卡') {
          categoryPlaces.sort((a, b) => b.score - a.score); // Higher newness score = better
        }
        
        // Keep top 5 places per category
        const top5Places = categoryPlaces.slice(0, 5);
        
        // Always add one random place if we have at least 6 places total
        // If we have exactly 5, use the 5th as both normal and random (to ensure 6 items)
        if (categoryPlaces.length >= 6) {
          const remainingPlaces = categoryPlaces.slice(5);
          const randomPlace = remainingPlaces[Math.floor(Math.random() * remainingPlaces.length)];
          // Mark as random selection
          randomPlace.category = `${category} (随机选店)`;
          top5Places.push(randomPlace);
        } else if (categoryPlaces.length === 5) {
          // If we have exactly 5, duplicate the last one as random to ensure 6 items
          const lastPlace = { ...categoryPlaces[4] };
          lastPlace.category = `${category} (随机选店)`;
          top5Places.push(lastPlace);
        } else {
          // If < 5, we can't reach 6, but still try to add one more if available
          if (categoryPlaces.length > top5Places.length) {
            const extraPlace = categoryPlaces[top5Places.length];
            extraPlace.category = `${category} (随机选店)`;
            top5Places.push(extraPlace);
          }
        }
        
        finalPlacesByCategory[englishKey] = top5Places;
      } else {
        console.error(`[Spend Today] ERROR: No English key mapping for category ${category}`);
      }
      
      if (englishKey && finalPlacesByCategory[englishKey].length === 0) {
        console.warn(`[Spend Today] WARNING: Category ${category} (key: ${englishKey}) has 0 places after all attempts`);
      }
    }
    
    // Log final summary (only in debug mode)
    if (debugMode) {
      const totalCount = Object.values(finalPlacesByCategory).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[Spend Today] Final: ${totalCount} places across ${Object.keys(finalPlacesByCategory).length} categories`);
    }
    
    // Extract debug info from allPlaces if present
    const newPlacesDebugInfo = (allPlaces as any).__newPlacesDebugInfo;
    if (newPlacesDebugInfo) {
      delete (allPlaces as any).__newPlacesDebugInfo;
    }
    
    // Extract debug snapshots for 夜宵
    const nightSnackDebugSnapshots = (allPlaces as any).__nightSnackDebugSnapshots;
    if (nightSnackDebugSnapshots) {
      delete (allPlaces as any).__nightSnackDebugSnapshots;
    }
    
    const response: any = {
      status: 'ok' as const,
      itemsByCategory: finalPlacesByCategory, // New structure: grouped by category
      items: Object.values(finalPlacesByCategory).flat(), // Legacy: flat array for backward compatibility
      count: Object.values(finalPlacesByCategory).reduce((sum, arr) => sum + arr.length, 0), // 6 per category * 4 categories = 24 (5 items + 1 random each)
      asOf: fetchedAtISO,
      source: { name: 'Google Places', url: 'https://maps.google.com' },
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
      // Debug info (only if ?debug=1 is in query or in development)
      ...(debugMode ? {
        _debug: {
          hasApiKey: !!GOOGLE_PLACES_API_KEY,
          apiKeyLength: GOOGLE_PLACES_API_KEY?.length || 0,
          apiKeyPrefix: GOOGLE_PLACES_API_KEY ? GOOGLE_PLACES_API_KEY.substring(0, 10) + '...' : 'N/A',
          env: process.env.VERCEL_ENV || 'local',
          allGoogleEnvVars: Object.keys(process.env).filter(k => k.toUpperCase().includes('GOOGLE')),
          placesFromApi: allPlaces.length,
          placesFromCache: 0, // Will be set if using cache
          newPlacesDebug: newPlacesDebugInfo || null, // 新店打卡 debug info
          nightSnackDebug: nightSnackDebugSnapshots || null, // 夜宵 debug snapshots (STEP 0)
        },
      } : {}),
    };

    // Update cache (24 hours)
    // COST OPTIMIZATION: Cache results for 12 hours (aggressive caching)
    setCache(cacheKey, response);
    
    // Log cache write (only in debug mode)
    if (debugMode) {
      const totalPlacesCached = response.items?.length || Object.values(response.itemsByCategory || {}).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      console.log(`[Spend Today] Cache written: ${totalPlacesCached} places`);
    }

    // Ensure proper encoding for JSON response
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(response);
  } catch (error: any) {
    console.error('[API /api/spend/today] Error:', error);
    
    // Log specific error types for debugging
    if (error?.message) {
      console.error('[API /api/spend/today] Error message:', error.message);
    }
    if (error?.code) {
      console.error('[API /api/spend/today] Error code:', error.code);
    }
    
    // Check for specific error types that should trigger fallback
    const errorMessage = error?.message || '';
    const shouldFallback = 
      errorMessage.includes('LegacyApiNotActivated') ||
      errorMessage.includes('REQUEST_DENIED') ||
      errorMessage.includes('billing') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('API key') ||
      errorMessage.includes('GOOGLE_PLACES_API_KEY') ||
      errorMessage.includes('not configured') ||
      errorMessage.includes('Permission denied') ||
      error?.code === 403 ||
      error?.code === 400;
    
    if (shouldFallback) {
      console.log('[API /api/spend/today] Detected API error requiring fallback, attempting cache/seed fallback...');
    }
    
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
      const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '新店打卡', '夜宵'];
      const CATEGORY_KEY_MAP_STALE: Record<string, string> = {
        '奶茶': 'milk_tea',
        '中餐': 'chinese',
        '新店打卡': 'new_places',
        '夜宵': 'late_night',
      };
      
      const normalizedItemsByCategory: Record<string, SpendPlace[]> = {
        'milk_tea': [],
        'chinese': [],
        'new_places': [],
        'late_night': [],
      };
      
      for (const category of categories) {
        // Only keep items with valid place_id (real Google Places - place_id typically starts with 'Ch' or is long)
        if (itemsByCategory[category]) {
          const filtered = itemsByCategory[category].filter((p: any) => 
            p.id && (p.id.startsWith('Ch') || p.id.length > 10) && p.maps_url && !p.maps_url.includes('#')
          );
          const englishKey = CATEGORY_KEY_MAP_STALE[category];
          if (englishKey) {
            // For 新店打卡: show all available places, no minimum requirement
            if (category === '新店打卡') {
              normalizedItemsByCategory[englishKey] = filtered;
              console.log(`[Spend Today] Stale cache: 新店打卡 showing ${filtered.length} places (no minimum requirement)`);
            } else {
              // Limit to 5 items + 1 random per category (for other categories)
              const top5 = filtered.slice(0, 5);
              if (filtered.length > 5) {
                const remaining = filtered.slice(5);
                const randomPlace = remaining[Math.floor(Math.random() * remaining.length)];
                randomPlace.category = `${category} (随机选店)`;
                top5.push(randomPlace);
              }
              normalizedItemsByCategory[englishKey] = top5;
            }
          }
        }
      }
      
      // Rebuild flat items array for backward compatibility
      items = Object.values(normalizedItemsByCategory).flat();
      
      // Ensure proper encoding for JSON response
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        ...staleData,
        itemsByCategory: normalizedItemsByCategory,
        items: items.slice(0, 24), // Up to 6 per category * 4 categories (5 items + 1 random)
        count: items.length,
        cache_hit: true,
        stale: true,
      });
    }

    // Last resort: use seed data as fallback
    console.warn('[Spend Today] All attempts failed, using seed data as fallback');
    const seedPlaces = getFoodRecommendationsFromSeed();
    
    // Convert seed data to SpendPlace format and group by category
    const seedByCategory: Record<string, SpendPlace[]> = {
      'milk_tea': [],
      'chinese': [],
      'new_places': [],
      'late_night': [],
    };
    
    const categoryMap: Record<string, string> = {
      '奶茶': 'milk_tea',
      '中餐': 'chinese',
      '新店打卡': 'new_places',
      '夜宵': 'late_night',
    };
    
    seedPlaces.forEach((place: FoodPlace) => {
      const englishKey = categoryMap[place.category] || 'milk_tea';
      if (seedByCategory[englishKey]) {
        seedByCategory[englishKey].push({
          id: place.id,
          name: place.name,
          category: place.category,
          rating: place.rating,
          user_ratings_total: place.review_count,
          address: place.address,
          maps_url: place.url,
          photo_url: place.photo_url,
          city: place.city,
          score: place.score,
          distance_miles: place.distance_miles,
        });
      }
    });
    
    // Limit each category to 5 items + 1 random
    for (const [key, places] of Object.entries(seedByCategory)) {
      const top5 = places.slice(0, 5);
      if (places.length > 5) {
        const remaining = places.slice(5);
        const randomPlace = remaining[Math.floor(Math.random() * remaining.length)];
        const categoryName = categoryMap[randomPlace.category] || key;
        randomPlace.category = `${categoryName} (随机选店)`;
        top5.push(randomPlace);
      }
      seedByCategory[key] = top5;
    }
    
    const errorAtISO = new Date().toISOString();
    const allSeedItems = Object.values(seedByCategory).flat();

    // Ensure proper encoding for JSON response
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      status: 'ok' as const,
      itemsByCategory: seedByCategory,
      items: allSeedItems,
      count: allSeedItems.length,
      asOf: errorAtISO,
      source: { name: 'Local Seed Data', url: 'https://maps.google.com' },
      ttlSeconds: ttlMsToSeconds(SPEND_TODAY_CACHE_TTL),
      cache_hit: false,
      fetched_at: errorAtISO,
      note: 'Using seed data fallback',
      // Debug info (only if ?debug=1 is in query or in development)
      ...(req.query.debug === '1' || process.env.VERCEL_ENV === 'development' ? {
        _debug: {
          hasApiKey: !!GOOGLE_PLACES_API_KEY,
          apiKeyLength: GOOGLE_PLACES_API_KEY?.length || 0,
          apiKeyPrefix: GOOGLE_PLACES_API_KEY ? GOOGLE_PLACES_API_KEY.substring(0, 10) + '...' : 'N/A',
          env: process.env.VERCEL_ENV || 'local',
          allGoogleEnvVars: Object.keys(process.env).filter(k => k.toUpperCase().includes('GOOGLE')),
          error: error?.message || 'Unknown error',
          fallbackReason: 'API key not configured or API call failed',
        },
      } : {}),
    });
  }
}
