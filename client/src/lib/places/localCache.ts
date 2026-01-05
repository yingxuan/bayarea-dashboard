/**
 * Local Places Cache (IndexedDB)
 * Persistent client-side cache for Places pools
 * TTL: 14-30 days (low frequency updates)
 * 
 * Seed data is loaded from JSON files in /lib/seeds/southbay/
 */

import { get, set, del, clear } from 'idb-keyval';
import type { SeedCategory } from '../../../../shared/types/seeds';

const DB_NAME = 'places-cache';
const DEFAULT_TTL_DAYS = 14;
const COOLDOWN_KEY = 'places_quota_cooldown_until';

export interface CachedPlace {
  placeId: string;
  name: string;
  rating: number;
  userRatingCount: number;
  address: string;
  mapsUrl: string;
  lat?: number;
  lng?: number;
  photoRef?: string; // Can be photoName (New API) or photoReference (Legacy) or photoUrl
  city?: string; // Optional city field for seed data
}

// City coordinates (for seed data)
const CITY_COORDS = {
  cupertino: { lat: 37.3230, lng: -122.0322 },
  sunnyvale: { lat: 37.3688, lng: -122.0363 },
  sanjose: { lat: 37.3382, lng: -121.8863 },
  milpitas: { lat: 37.4283, lng: -121.9066 },
  fremont: { lat: 37.5483, lng: -121.9886 },
} as const;

export interface CachedPool {
  version: number;
  updatedAt: number; // epochMs
  ttlDays: number;
  sourceMode: 'live' | 'cache' | 'seed';
  requestMeta?: {
    radiusMeters: number;
    rankPreference?: string;
    maxResultCount: number;
    includedTypes: string[];
    keyword?: string;
  };
  items: CachedPlace[];
}

/**
 * Get cache key for a pool
 */
function getPoolKey(city: string, poolType: 'restaurant' | 'cafe' | 'new_places'): string {
  return `places_pool:${city}:${poolType}`;
}

/**
 * Get cached pool
 */
export async function getPool(
  city: string,
  poolType: 'restaurant' | 'cafe' | 'new_places'
): Promise<CachedPool | null> {
  try {
    const key = getPoolKey(city, poolType);
    const cached = await get<CachedPool>(key);
    return cached || null;
  } catch (error) {
    console.error('[LocalCache] Error getting pool:', error);
    return null;
  }
}

/**
 * Set cached pool
 */
export async function setPool(
  city: string,
  poolType: 'restaurant' | 'cafe' | 'new_places',
  pool: CachedPool
): Promise<void> {
  try {
    const key = getPoolKey(city, poolType);
    await set(key, pool);
  } catch (error) {
    console.error('[LocalCache] Error setting pool:', error);
  }
}

/**
 * Get new places pool (specific cache for 新店打卡)
 */
export async function getNewPlacesPool(): Promise<CachedPool | null> {
  return getPool('southbay', 'new_places');
}

/**
 * Set new places pool (specific cache for 新店打卡)
 */
export async function setNewPlacesPool(pool: CachedPool): Promise<void> {
  return setPool('southbay', 'new_places', pool);
}

/**
 * Clear new places pool (specific cache for 新店打卡)
 */
export async function clearNewPlacesPool(): Promise<void> {
  try {
    const key = getPoolKey('southbay', 'new_places');
    await del(key);
    console.log('[LocalCache] New places pool cleared');
  } catch (error) {
    console.error('[LocalCache] Error clearing new places pool:', error);
  }
}

/**
 * Check if pool is stale
 */
export function isStale(pool: CachedPool | null, ttlDays?: number): boolean {
  if (!pool) return true;
  const now = Date.now();
  const ageMs = now - pool.updatedAt;
  const effectiveTtlDays = ttlDays || pool.ttlDays;
  const ttlMs = effectiveTtlDays * 24 * 60 * 60 * 1000;
  return ageMs > ttlMs;
}

/**
 * Get cache age in days
 */
export function getCacheAgeDays(pool: CachedPool | null): number {
  if (!pool) return Infinity;
  const now = Date.now();
  const ageMs = now - pool.updatedAt;
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

/**
 * Check if in cooldown period
 */
export async function isInCooldown(): Promise<boolean> {
  try {
    const cooldownUntil = await get<number>(COOLDOWN_KEY);
    if (!cooldownUntil) return false;
    return Date.now() < cooldownUntil;
  } catch (error) {
    console.error('[LocalCache] Error checking cooldown:', error);
    return false;
  }
}

/**
 * Set cooldown period (e.g., after quota exceeded)
 */
export async function setCooldown(days: number = 7): Promise<void> {
  try {
    const cooldownUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    await set(COOLDOWN_KEY, cooldownUntil);
    console.log(`[LocalCache] Cooldown set until ${new Date(cooldownUntil).toISOString()}`);
  } catch (error) {
    console.error('[LocalCache] Error setting cooldown:', error);
  }
}

/**
 * Clear cooldown
 */
export async function clearCooldown(): Promise<void> {
  try {
    await del(COOLDOWN_KEY);
  } catch (error) {
    console.error('[LocalCache] Error clearing cooldown:', error);
  }
}

/**
 * Get rotation cursor for a tile
 */
export async function getRotationCursor(tileKey: string): Promise<number> {
  try {
    const cursorKey = `places_cursor:${tileKey}`;
    const cursor = await get<number>(cursorKey);
    return cursor || 0;
  } catch (error) {
    console.error('[LocalCache] Error getting cursor:', error);
    return 0;
  }
}

/**
 * Set rotation cursor for a tile
 */
export async function setRotationCursor(tileKey: string, cursor: number): Promise<void> {
  try {
    const cursorKey = `places_cursor:${tileKey}`;
    await set(cursorKey, cursor);
  } catch (error) {
    console.error('[LocalCache] Error setting cursor:', error);
  }
}

/**
 * Rotate places from pool (deterministic)
 */
export function rotatePlaces(
  places: CachedPlace[],
  cursor: number,
  count: number = 5
): CachedPlace[] {
  if (places.length <= count) return places;
  
  // Deterministic rotation
  const rotated = [...places];
  for (let i = 0; i < cursor; i++) {
    const first = rotated.shift();
    if (first) rotated.push(first);
  }
  
  return rotated.slice(0, count);
}

/**
 * Create pool from API response
 */
export function createPool(
  items: CachedPlace[],
  sourceMode: 'live' | 'cache' | 'seed' = 'live',
  requestMeta?: CachedPool['requestMeta']
): CachedPool {
  return {
    version: 1,
    updatedAt: Date.now(),
    ttlDays: DEFAULT_TTL_DAYS,
    sourceMode,
    requestMeta,
    items,
  };
}

/**
 * Load seed data from JSON files
 * Returns empty pool if files not found (graceful fallback)
 */
export async function loadSeedFile(category: '奶茶' | '中餐' | '夜宵' | '新店打卡'): Promise<CachedPlace[]> {
  try {
    console.log(`[LocalCache] Loading seed file for category: ${category}`);
    // Dynamic import of seed JSON (bundled at build time)
    const seedModule = await import(`@/lib/seeds/southbay/${category}.json`);
    const seedFile = seedModule.default || seedModule;
    
    console.log(`[LocalCache] Seed file loaded for ${category}:`, {
      hasItems: !!seedFile.items,
      itemsLength: seedFile.items?.length || 0,
      version: seedFile.version,
    });
    
    if (!seedFile.items || !Array.isArray(seedFile.items)) {
      console.warn(`[LocalCache] Invalid seed file for ${category}:`, seedFile);
      return [];
    }

    // Convert SeedPlace to CachedPlace
    // Runtime preference: prefer mapsType="place" over "search" for exact store pages
    return seedFile.items
      .filter((item: any) => item.mapsUrl && item.name) // Filter invalid items
      .map((item: any): CachedPlace => {
        // Infer mapsType if not provided
        const mapsType = item.mapsType || 
          (item.mapsUrl.includes('/search/') || item.mapsUrl.includes('?q=') ? 'search' : 'place');
        
        // Prefer placeId if available (from resolved seeds)
        const placeId = item.placeId || `seed_${category}_${item.name.replace(/\s+/g, '_').toLowerCase()}`;
        
        // Prefer exact place URL (mapsType="place") over search URLs
        // If both exist, prefer the place link
        const mapsUrl = item.mapsUrl; // Already resolved to exact place URI if placeId exists
        
        // Build photo URL from photoName or photoReference if available
        let photoRef: string | undefined;
        if (item.photoName) {
          // New API format: store photoName, will be resolved via server proxy
          photoRef = item.photoName;
        } else if (item.photoReference) {
          // Legacy format: use directly
          photoRef = item.photoReference;
        }

        const cachedPlace: CachedPlace = {
          placeId,
          name: item.name,
          rating: item.rating ?? 0, // Use enriched rating if available
          userRatingCount: item.userRatingCount ?? 0, // Use enriched count if available
          address: item.address || item.city || 'South Bay',
          mapsUrl: item.googleMapsUri || mapsUrl, // Prefer enriched googleMapsUri if available
          lat: item.lat,
          lng: item.lng,
          photoRef, // Use enriched photo if available
          city: item.city, // Preserve city from seed data
        };
        
        // Debug log for places with rating data
        if (cachedPlace.rating > 0 || cachedPlace.userRatingCount > 0) {
          console.log(`[LocalCache] Loaded ${category} place "${item.name}" with rating: ${cachedPlace.rating}, count: ${cachedPlace.userRatingCount}`);
        }
        
        return cachedPlace;
      });
  } catch (error) {
    console.error(`[LocalCache] Failed to load seed file for ${category}:`, error);
    if (error instanceof Error) {
      console.error(`[LocalCache] Error details:`, {
        message: error.message,
        stack: error.stack,
      });
    }
    return [];
  }
}

/**
 * Get seed data pool (fallback when API fails)
 * Loads from JSON seed files
 */
export async function getSeedPool(
  city: keyof typeof CITY_COORDS,
  type: 'restaurant' | 'cafe'
): Promise<CachedPool> {
  // Map pool type to categories
  const categories: Array<'奶茶' | '中餐' | '夜宵' | '新店打卡'> =
    type === 'cafe'
      ? ['奶茶'] // Cafe pool -> bubble tea category
      : ['中餐', '夜宵', '新店打卡']; // Restaurant pool -> Chinese, late night, new places

  // Load all relevant seed categories and combine
  const allPlaces: CachedPlace[] = [];
  for (const category of categories) {
    const categoryPlaces = await loadSeedFile(category);
    allPlaces.push(...categoryPlaces);
  }

  // Deduplicate by name+city (same place in same city should only appear once)
  // Also deduplicate by mapsUrl as fallback
  const seenByNameCity = new Map<string, CachedPlace>();
  const seenByUrl = new Map<string, CachedPlace>();
  
  for (const place of allPlaces) {
    // Use city from place, or extract from address, or use 'South Bay' as fallback
    const city = place.city || (place.address ? place.address.split(',')[0].trim() : 'South Bay');
    const nameCityKey = `${place.name.toLowerCase().trim()}|${city.toLowerCase().trim()}`;
    const urlKey = place.mapsUrl;
    
    // Prefer name+city deduplication (more reliable for search URLs)
    if (!seenByNameCity.has(nameCityKey)) {
      seenByNameCity.set(nameCityKey, place);
      seenByUrl.set(urlKey, place);
    } else {
      // If we already have this name+city, skip it even if URL is different
      // (prevents same place appearing multiple times when in multiple categories)
    }
  }

  const deduped = Array.from(seenByNameCity.values());

  return createPool(deduped, 'seed');
}

/**
 * Synchronous version for backward compatibility (returns empty pool)
 * Use async getSeedPool() instead
 */
export function getSeedPoolSync(city: keyof typeof CITY_COORDS, type: 'restaurant' | 'cafe'): CachedPool {
  // Return empty pool - async version should be used
  return createPool([], 'seed');
}

/**
 * Clear all cached pools (debug/cleanup)
 */
export async function clearAllPools(): Promise<void> {
  try {
    // Clear all keys that start with places_pool:
    // Note: idb-keyval doesn't have listKeys, so we'd need to track keys manually
    // For now, just clear known keys
    const cities = ['cupertino', 'sunnyvale', 'sanjose', 'milpitas', 'fremont'];
    const poolTypes: Array<'restaurant' | 'cafe'> = ['restaurant', 'cafe'];
    
    for (const city of cities) {
      for (const poolType of poolTypes) {
        const key = getPoolKey(city, poolType);
        await del(key);
      }
    }
    
    console.log('[LocalCache] All pools cleared');
  } catch (error) {
    console.error('[LocalCache] Error clearing pools:', error);
  }
}
