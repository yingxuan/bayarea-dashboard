/**
 * Places Enrichment Cache
 * Persistent cache for enriched place metadata (rating, photo, etc.)
 * 
 * Storage: IndexedDB (via idb-keyval)
 * TTL: 30 days
 * Key format: place:${placeId} or seed:${normalize(name)}|${normalize(city)}
 */

import { get, set, del } from 'idb-keyval';

const ENRICHMENT_TTL_DAYS = 30;
const ENRICHMENT_DB_PREFIX = 'place_enrichment:';

export interface EnrichedPlace {
  key: string;
  placeId?: string;
  name: string;
  city: string;
  rating: number;
  userRatingCount: number;
  photo?: {
    photoName?: string; // New API format: places/{place_id}/photos/{photo_id}
    photoReference?: string; // Legacy format
    photoUrl?: string; // Pre-computed URL
  };
  googleMapsUri?: string;
  updatedAt: number; // epochMs
}

/**
 * Normalize string for cache key
 */
function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, '_');
}

/**
 * Generate cache key for a place
 */
export function getEnrichmentKey(placeId: string | undefined, name: string, city: string): string {
  if (placeId) {
    return `${ENRICHMENT_DB_PREFIX}place:${placeId}`;
  }
  return `${ENRICHMENT_DB_PREFIX}seed:${normalize(name)}|${normalize(city)}`;
}

/**
 * Get enriched place from cache
 */
export async function getEnriched(key: string): Promise<EnrichedPlace | null> {
  try {
    const cached = await get<EnrichedPlace>(key);
    if (!cached) return null;
    
    // Check if fresh
    if (!isFresh(cached.updatedAt, ENRICHMENT_TTL_DAYS)) {
      // Cache expired, but return it anyway (stale data better than nothing)
      return cached;
    }
    
    return cached;
  } catch (error) {
    console.error('[EnrichmentCache] Error getting enriched place:', error);
    return null;
  }
}

/**
 * Set enriched place in cache
 */
export async function setEnriched(key: string, data: EnrichedPlace): Promise<void> {
  try {
    await set(key, data);
  } catch (error) {
    console.error('[EnrichmentCache] Error setting enriched place:', error);
  }
}

/**
 * Check if enrichment is fresh (within TTL)
 */
export function isFresh(updatedAt: number, ttlDays: number = ENRICHMENT_TTL_DAYS): boolean {
  const now = Date.now();
  const ageMs = now - updatedAt;
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  return ageMs <= ttlMs;
}

/**
 * Batch get enriched places
 */
export async function getBatchEnriched(keys: string[]): Promise<Map<string, EnrichedPlace>> {
  const result = new Map<string, EnrichedPlace>();
  for (const key of keys) {
    const enriched = await getEnriched(key);
    if (enriched) {
      result.set(key, enriched);
    }
  }
  return result;
}
