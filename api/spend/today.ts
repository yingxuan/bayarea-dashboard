/**
 * Vercel Serverless Function: /api/spend/today
 * Returns food recommendations using Google Places API (New)
 * 
 * Requirements:
 * - Cities: Cupertino / Sunnyvale
 * - Categories: 奶茶 / 中餐 / 甜品 / 夜宵
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
const SPEND_TODAY_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours (increased from 24h for better cost control - food places don't need real-time freshness)

// Debug: Log environment variable status (without exposing the key)
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV) {
  console.log('[Spend Today] GOOGLE_PLACES_API_KEY status:', GOOGLE_PLACES_API_KEY ? `Set (length: ${GOOGLE_PLACES_API_KEY.length})` : 'Not set');
  console.log('[Spend Today] Available env vars with GOOGLE:', Object.keys(process.env).filter(k => k.includes('GOOGLE')).join(', ') || 'None');
}

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
// COST OPTIMIZATION: Reduced to primary keywords only (fewer API calls)
const CATEGORY_KEYWORDS = {
  '奶茶': ['bubble tea', 'boba'], // Reduced from 10 to 2 keywords
  '中餐': ['chinese restaurant'], // Reduced from 2 to 1 keyword
  '甜品': ['dessert', 'ice cream'], // Changed from coffee to dessert
  '夜宵': ['hot pot', 'bbq'], // Reduced from 10 to 2 keywords
} as const;

// Category to type mapping (for Nearby Search)
const CATEGORY_TYPES = {
  '奶茶': 'cafe', // Use cafe as base type for bubble tea
  '中餐': 'restaurant',
  '甜品': 'cafe', // Use cafe as base type for dessert
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
 * Search Google Places using Places API (New) - searchNearby
 * Returns places within radius, filtered by keyword
 * Uses POST method with proper headers
 */
async function searchGooglePlacesNearby(
  location: { lat: number; lng: number },
  radius: number = 50000, // Maximum allowed: 50000 meters (~31 miles)
  type?: string,
  keyword?: string
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
        maxResultCount: 6, // Reduced from 20: UI shows 2-3 cards + 1 random = 4 max needed
        locationBias: {
          circle: {
            center: {
              latitude: location.lat,
              longitude: location.lng,
            },
            radius: radius,
          },
        },
        includedType: type, // Optional: filter by type
      };
    } else {
      // Use searchNearby for type-based searches
      url = 'https://places.googleapis.com/v1/places:searchNearby';
      requestBody = {
        includedTypes: type ? [type] : undefined,
        maxResultCount: 6, // Reduced from 20: UI shows 2-3 cards + 1 random = 4 max needed
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
    }
    
    // COST OPTIMIZATION: Minimal field mask - only fields actually used in UI
    // UI uses: name, rating, user_ratings_total, distance_miles (calculated), photo_url
    // Removed: regularOpeningHours (not shown), types (not shown), googleMapsUri (can construct from place_id)
    // COST OPTIMIZATION DEBUG: Log API call details
    console.log(`[Spend Today] 📊 API Call: ${url.includes('searchText') ? 'searchText' : 'searchNearby'}`);
    console.log(`[Spend Today] 📊 Field Mask: places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.photos`);
    console.log(`[Spend Today] 📊 Max Result Count: ${requestBody.maxResultCount}`);
    console.log(`[Spend Today] 📊 Keyword/Type: ${keyword || type || 'none'}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.photos',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Spend Today] Places API (New) HTTP error: ${response.status} ${response.statusText}`);
      console.error(`[Spend Today] Error response: ${errorText}`);
      throw new Error(`Places API (New) error: ${response.status} ${response.statusText}`);
    }

    const data: NewPlacesSearchNearbyResponse = await response.json();
    
    // Check for API-level errors
    if ((data as any).error) {
      const error = (data as any).error;
      const errorMessage = error.message || JSON.stringify(error);
      const errorCode = error.code || error.status || 'UNKNOWN';
      
      console.error(`[Spend Today] Places API (New) error: ${errorCode} - ${errorMessage}`);
      
      // Always throw for API errors to trigger fallback
      // This includes: legacy API, billing, quota, key restrictions, etc.
      const apiError = new Error(`Places API (New) error: ${errorCode} - ${errorMessage}`);
      (apiError as any).code = errorCode;
      throw apiError;
    }

    const places = data.places || [];
    
    // COST OPTIMIZATION DEBUG: Log results
    console.log(`[Spend Today] 📊 Places Returned: ${places.length}`);
    if (places.length > 0) {
      const photosCount = places.filter(p => p.photos && p.photos.length > 0).length;
      console.log(`[Spend Today] 📊 Places with Photos: ${photosCount}/${places.length}`);
    }
    
    // No need to filter by keyword if we used searchText (it already filters)
    // But we can still do a light filter for searchNearby results if needed
    let filteredPlaces = places;
    if (keyword && !url.includes('searchText')) {
      // Only filter if we used searchNearby (shouldn't happen now, but keep as safety)
      const keywordLower = keyword.toLowerCase();
      filteredPlaces = places.filter(place => {
        const name = place.displayName?.text?.toLowerCase() || '';
        const address = place.formattedAddress?.toLowerCase() || '';
        return name.includes(keywordLower) || address.includes(keywordLower);
      });
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
      opening_hours: place.regularOpeningHours ? {
        open_now: place.regularOpeningHours.openNow,
      } : undefined,
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
    '甜品': 'dessert',
    '夜宵': 'late_night',
  };
  
  const categoryToChinese: Record<string, string> = {
    'milk_tea': '奶茶',
    'chinese': '中餐',
    'dessert': '甜品',
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
      ).catch((error: any) => {
        // Log error but don't throw - continue with other keywords
        console.error(`[Spend Today] Error searching for keyword "${keyword}":`, error);
        return [];
      });

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
          continue;
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
          
          if (!isBBQSkewersOrHotPot) {
            continue;
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

  return allPlaces;
}

/**
 * Fetch all places from all cities and categories, then merge and sort by popularity
 */
async function fetchAllPlacesFromGoogle(): Promise<SpendPlace[]> {
  // Only search in Cupertino and Sunnyvale (no San Jose)
  const cities: Array<keyof typeof CITY_COORDS> = ['cupertino', 'sunnyvale'];
  const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '甜品', '夜宵'];
  
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
 * Returns: { '奶茶': [...], '中餐': [...], '甜品': [...], '夜宵': [...] }
 */
function groupPlacesByCategory(places: SpendPlace[]): Record<string, SpendPlace[]> {
  const byCategory: Record<string, SpendPlace[]> = {
    '奶茶': [],
    '中餐': [],
    '甜品': [],
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
  // Security logging at handler start (without exposing the key)
  console.log('[Spend Today] Handler started');
  console.log('[Spend Today] VERCEL_ENV:', process.env.VERCEL_ENV || 'local');
  console.log('[Spend Today] GOOGLE_PLACES_API_KEY exists:', !!process.env.GOOGLE_PLACES_API_KEY);
  console.log('[Spend Today] GOOGLE_PLACES_API_KEY length:', process.env.GOOGLE_PLACES_API_KEY?.length || 0);
  console.log('[Spend Today] All env vars containing "GOOGLE":', Object.keys(process.env).filter(k => k.toUpperCase().includes('GOOGLE')).join(', ') || 'None');
  
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
    
    // COST OPTIMIZATION DEBUG: Log cache miss
    console.log(`[Spend Today] ❌ Cache MISS: will fetch from API`);

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
        allPlaces = await fetchAllPlacesFromGoogle();
        const apiCallDuration = Date.now() - apiCallStartTime;
        
        // COST OPTIMIZATION DEBUG: Calculate estimated API calls saved
        // Before: Each category had 10 keywords × 2 cities = 20 calls per category × 4 categories = 80 calls
        //         Plus getPlaceDetails: ~20 places × 2 cities = 40 calls
        //         Total: ~120 calls per request
        // After: Each category has 2 keywords × 2 cities = 4 calls per category × 4 categories = 16 calls
        //        No getPlaceDetails calls = 0
        //        Total: ~16 calls per request
        // Savings: ~104 calls per request (87% reduction)
        const estimatedCallsBefore = 120; // Rough estimate
        const estimatedCallsAfter = 16; // Rough estimate
        const estimatedSavings = estimatedCallsBefore - estimatedCallsAfter;
        console.log(`[Spend Today] 📊 API Call Summary:`);
        console.log(`[Spend Today] 📊   Duration: ${apiCallDuration}ms`);
        console.log(`[Spend Today] 📊   Places Returned: ${allPlaces.length}`);
        console.log(`[Spend Today] 📊   Estimated Calls Saved: ~${estimatedSavings} calls (${Math.round(estimatedSavings / estimatedCallsBefore * 100)}% reduction)`);
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
          '甜品': 'dessert',
          '夜宵': 'late_night',
        };
        
        // Convert Chinese keys to English keys if needed
        const normalizedItemsByCategory: Record<string, SpendPlace[]> = {
          'milk_tea': [],
          'chinese': [],
          'dessert': [],
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
          } else if (key === 'milk_tea' || key === 'chinese' || key === 'dessert' || key === 'late_night') {
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
      '甜品': [],
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
        const expectedCategories: string[] = ['奶茶', '中餐', '甜品', '夜宵'];
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
    const CATEGORY_DESSERT = '甜品';
    const CATEGORY_LATE_NIGHT = '夜宵';
    
    // Map Chinese category names to English keys for JSON serialization
    const CATEGORY_KEY_MAP: Record<string, string> = {
      [CATEGORY_MILK_TEA]: 'milk_tea',
      [CATEGORY_CHINESE]: 'chinese',
      [CATEGORY_DESSERT]: 'dessert',
      [CATEGORY_LATE_NIGHT]: 'late_night',
    };
    
    const categories: string[] = [CATEGORY_MILK_TEA, CATEGORY_CHINESE, CATEGORY_DESSERT, CATEGORY_LATE_NIGHT];
    const finalPlacesByCategory: Record<string, SpendPlace[]> = {
      'milk_tea': [],
      'chinese': [],
      'dessert': [],
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
      
      // Use English key for itemsByCategory, but keep Chinese category in each place
      const englishKey = CATEGORY_KEY_MAP[category];
      if (englishKey) {
        // If we have < 2 places, try seed data fallback for this category
        if (categoryPlaces.length < 2) {
          console.log(`[Spend Today] Category ${category} has < 2 places, trying seed data fallback`);
          const seedPlaces = getFoodRecommendationsFromSeed();
          const seedForCategory = seedPlaces.filter(p => p.category === category);
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
            categoryPlaces = [...categoryPlaces, ...seedSpendPlaces].slice(0, 50);
            console.log(`[Spend Today] Added ${seedSpendPlaces.length} seed places for ${category}`);
          }
        }
        
        // Keep top 5 places per category, sorted by Google Places ranking (already sorted by placeOrderMap)
        const top5Places = categoryPlaces.slice(0, 5);
        
        // Add one random place from the category (if available)
        if (categoryPlaces.length > 5) {
          const remainingPlaces = categoryPlaces.slice(5);
          const randomPlace = remainingPlaces[Math.floor(Math.random() * remainingPlaces.length)];
          // Mark as random selection
          randomPlace.category = `${category} (随机选店)`;
          top5Places.push(randomPlace);
        }
        
        finalPlacesByCategory[englishKey] = top5Places;
        console.log(`[Spend Today] Final count for ${category} (key: ${englishKey}): ${finalPlacesByCategory[englishKey].length} (5 items + ${top5Places.length > 5 ? '1 random' : '0 random'})`);
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
      ...(req.query.debug === '1' || process.env.VERCEL_ENV === 'development' ? {
        _debug: {
          hasApiKey: !!GOOGLE_PLACES_API_KEY,
          apiKeyLength: GOOGLE_PLACES_API_KEY?.length || 0,
          apiKeyPrefix: GOOGLE_PLACES_API_KEY ? GOOGLE_PLACES_API_KEY.substring(0, 10) + '...' : 'N/A',
          env: process.env.VERCEL_ENV || 'local',
          allGoogleEnvVars: Object.keys(process.env).filter(k => k.toUpperCase().includes('GOOGLE')),
          placesFromApi: allPlaces.length,
          placesFromCache: 0, // Will be set if using cache
        },
      } : {}),
    };

    // Update cache (24 hours)
    // COST OPTIMIZATION: Cache results for 12 hours (aggressive caching)
    setCache(cacheKey, response);
    
    // COST OPTIMIZATION DEBUG: Log cache write
    const totalPlacesCached = response.items?.length || Object.values(response.itemsByCategory || {}).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    console.log(`[Spend Today] 💾 Cache WRITTEN: ${totalPlacesCached} total places, TTL: 12h`);

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
      const categories: Array<keyof typeof CATEGORY_KEYWORDS> = ['奶茶', '中餐', '甜品', '夜宵'];
      const CATEGORY_KEY_MAP_STALE: Record<string, string> = {
        '奶茶': 'milk_tea',
        '中餐': 'chinese',
        '甜品': 'dessert',
        '夜宵': 'late_night',
      };
      
      const normalizedItemsByCategory: Record<string, SpendPlace[]> = {
        'milk_tea': [],
        'chinese': [],
        'dessert': [],
        'late_night': [],
      };
      
      for (const category of categories) {
        // Only keep items with valid place_id (real Google Places - place_id typically starts with 'Ch' or is long)
        if (itemsByCategory[category]) {
          const filtered = itemsByCategory[category].filter((p: any) => 
            p.id && (p.id.startsWith('Ch') || p.id.length > 10) && p.maps_url && !p.maps_url.includes('#')
          );
          // Limit to 5 items + 1 random per category
          const top5 = filtered.slice(0, 5);
          if (filtered.length > 5) {
            const remaining = filtered.slice(5);
            const randomPlace = remaining[Math.floor(Math.random() * remaining.length)];
            randomPlace.category = `${category} (随机选店)`;
            top5.push(randomPlace);
          }
          const englishKey = CATEGORY_KEY_MAP_STALE[category];
          if (englishKey) {
            normalizedItemsByCategory[englishKey] = top5;
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
    console.log('[Spend Today] All attempts failed, using seed data as fallback');
    const seedPlaces = getFoodRecommendationsFromSeed();
    
    // Convert seed data to SpendPlace format and group by category
    const seedByCategory: Record<string, SpendPlace[]> = {
      'milk_tea': [],
      'chinese': [],
      'dessert': [],
      'late_night': [],
    };
    
    const categoryMap: Record<string, string> = {
      '奶茶': 'milk_tea',
      '中餐': 'chinese',
      '甜品': 'dessert',
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
