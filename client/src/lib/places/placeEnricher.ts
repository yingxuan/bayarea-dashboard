/**
 * Place Enricher
 * Fetches real metadata from Google Places API for seed items
 * 
 * Rules:
 * - Only enriches items currently displayed
 * - Max 6 calls per page load
 * - Throttles to 1 req/sec
 * - Circuit breaker for quota exceeded
 */

import { config } from '@/config';
import { getEnrichmentKey, getEnriched, setEnriched, type EnrichedPlace } from './enrichmentCache';

const MAX_ENRICH_CALLS = 6; // Total calls per session (includes both resolution + details)
const THROTTLE_MS = 1000; // 1 second between calls
const COOLDOWN_KEY = 'place_enrichment_cooldown_until';

// Session state
let callsMadeThisSession = 0;
let lastCallTime = 0;
const pendingEnrichments = new Map<string, Promise<EnrichedPlace | null>>();

/**
 * Check if we can make another API call
 */
function canMakeCall(): boolean {
  return callsMadeThisSession < MAX_ENRICH_CALLS;
}

/**
 * Record an API call
 */
function recordCall(): boolean {
  if (callsMadeThisSession >= MAX_ENRICH_CALLS) {
    return false;
  }
  callsMadeThisSession++;
  lastCallTime = Date.now();
  return true;
}

/**
 * Check if in cooldown period
 */
async function isInCooldown(): Promise<boolean> {
  try {
    const { get } = await import('idb-keyval');
    const cooldownUntil = await get<number>(COOLDOWN_KEY);
    if (!cooldownUntil) return false;
    return Date.now() < cooldownUntil;
  } catch (error) {
    return false;
  }
}

/**
 * Set cooldown period
 */
async function setCooldown(days: number = 7): Promise<void> {
  try {
    const { set } = await import('idb-keyval');
    const cooldownUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    await set(COOLDOWN_KEY, cooldownUntil);
    console.log(`[PlaceEnricher] Cooldown set until ${new Date(cooldownUntil).toISOString()}`);
  } catch (error) {
    console.error('[PlaceEnricher] Error setting cooldown:', error);
  }
}

/**
 * Normalize string for matching
 */
function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s]/g, '');
}

/**
 * Resolve placeId from seed item using searchText
 */
async function resolvePlaceId(name: string, city: string): Promise<string | null> {
  if (!canMakeCall()) {
    console.warn(`[PlaceEnricher] Max calls reached (${MAX_ENRICH_CALLS}), skipping placeId resolution`);
    return null;
  }

  // Check cooldown
  if (await isInCooldown()) {
    console.warn('[PlaceEnricher] In cooldown, skipping placeId resolution');
    return null;
  }

  // Throttle
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < THROTTLE_MS) {
    await new Promise(resolve => setTimeout(resolve, THROTTLE_MS - timeSinceLastCall));
  }

  try {
    if (!recordCall()) {
      return null;
    }

    const textQuery = `${name} ${city} CA`;
    const SOUTH_BAY_CENTER = { lat: 37.3230, lng: -122.0322 };
    const RADIUS_METERS = 15000;

    const url = `${config.apiBaseUrl}/api/spend/enrich-place?textQuery=${encodeURIComponent(textQuery)}&lat=${SOUTH_BAY_CENTER.lat}&lng=${SOUTH_BAY_CENTER.lng}&radius=${RADIUS_METERS}`;
    
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 403) {
        await setCooldown(7);
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.placeId) {
      return data.placeId;
    }

    return null;
  } catch (error: any) {
    console.error('[PlaceEnricher] Error resolving placeId:', error);
    if (error.message === 'QUOTA_EXCEEDED') {
      await setCooldown(7);
    }
    return null;
  }
}

/**
 * Fetch place details (rating, photo, etc.) by placeId
 */
async function fetchPlaceDetails(placeId: string): Promise<EnrichedPlace | null> {
  if (!canMakeCall()) {
    console.warn(`[PlaceEnricher] Max calls reached (${MAX_ENRICH_CALLS}), skipping details fetch`);
    return null;
  }

  // Check cooldown
  if (await isInCooldown()) {
    console.warn('[PlaceEnricher] In cooldown, skipping details fetch');
    return null;
  }

  // Throttle
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < THROTTLE_MS) {
    await new Promise(resolve => setTimeout(resolve, THROTTLE_MS - timeSinceLastCall));
  }

  try {
    if (!recordCall()) {
      return null;
    }

    const url = `${config.apiBaseUrl}/api/spend/enrich-place?placeId=${encodeURIComponent(placeId)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 403) {
        await setCooldown(7);
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.placeId || !data.name) {
      return null;
    }

    const enriched: EnrichedPlace = {
      key: getEnrichmentKey(data.placeId, data.name, data.city || ''),
      placeId: data.placeId,
      name: data.name,
      city: data.city || '',
      rating: data.rating || 0,
      userRatingCount: data.userRatingCount || 0,
      photo: data.photo ? {
        photoName: data.photo.photoName,
        photoReference: data.photo.photoReference,
        photoUrl: data.photo.photoUrl,
      } : undefined,
      googleMapsUri: data.googleMapsUri,
      updatedAt: Date.now(),
    };

    // Cache it
    await setEnriched(enriched.key, enriched);

    return enriched;
  } catch (error: any) {
    console.error('[PlaceEnricher] Error fetching place details:', error);
    if (error.message === 'QUOTA_EXCEEDED') {
      await setCooldown(7);
    }
    return null;
  }
}

/**
 * Enrich a single place (resolve placeId if needed, then fetch details)
 */
export async function enrichPlace(
  name: string,
  city: string,
  existingPlaceId?: string
): Promise<EnrichedPlace | null> {
  // Check cache first
  const cacheKey = getEnrichmentKey(existingPlaceId, name, city);
  const cached = await getEnriched(cacheKey);
  if (cached) {
    return cached;
  }

  // Check if already enriching this place
  if (pendingEnrichments.has(cacheKey)) {
    return pendingEnrichments.get(cacheKey)!;
  }

  // Start enrichment
  const enrichmentPromise = (async () => {
    let placeId = existingPlaceId;

    // Step 1: Resolve placeId if not available (uses 1 call)
    if (!placeId) {
      if (!canMakeCall()) {
        // No calls left, skip
        return null;
      }
      placeId = await resolvePlaceId(name, city);
      if (!placeId) {
        // Can't resolve, return null (will use fallback)
        return null;
      }
    }

    // Step 2: Fetch details (uses 1 call)
    if (!canMakeCall()) {
      // No calls left for details, return null
      return null;
    }
    const enriched = await fetchPlaceDetails(placeId);
    
    // If we resolved a new placeId, also cache it with the seed key
    if (enriched && !existingPlaceId) {
      const seedKey = getEnrichmentKey(undefined, name, city);
      await setEnriched(seedKey, enriched);
    }

    return enriched;
  })();

  pendingEnrichments.set(cacheKey, enrichmentPromise);
  
  try {
    return await enrichmentPromise;
  } finally {
    pendingEnrichments.delete(cacheKey);
  }
}

/**
 * Get enrichment stats for debugging
 */
export async function getEnrichmentStats(): Promise<{
  callsMadeThisSession: number;
  inCooldown: boolean;
  cooldownUntil: number | null;
}> {
  const inCooldown = await isInCooldown();
  let cooldownUntil: number | null = null;
  try {
    const { get } = await import('idb-keyval');
    cooldownUntil = (await get<number>(COOLDOWN_KEY)) || null;
  } catch (error) {
    // Ignore
  }

  return {
    callsMadeThisSession,
    inCooldown,
    cooldownUntil,
  };
}

/**
 * Reset session counter (for testing)
 */
export function resetSessionCounter(): void {
  callsMadeThisSession = 0;
  lastCallTime = 0;
}
