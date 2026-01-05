/**
 * Centralized Google Places API Client
 * Rate-limited, deduplicated, with circuit breaker
 * 
 * Strategy:
 * - In-memory dedup for identical requests within a session
 * - Hard timeout + no retries
 * - Circuit breaker for quota exceeded
 * - Structured logging
 */

import type { VercelRequest } from '@vercel/node';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

// Circuit breaker state
let circuitBreakerOpen = false;
let circuitBreakerOpenUntil: number | null = null;
const CIRCUIT_BREAKER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory request deduplication (per request lifecycle)
const requestDedupMap = new Map<string, Promise<any>>();

// Request timeout
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

interface PlacesRequest {
  city: string;
  type: 'restaurant' | 'cafe';
  radiusMeters: number;
  maxResultCount: number;
}

interface PlacesResponse {
  places: Array<{
    id: string;
    displayName?: { text: string };
    rating?: number;
    userRatingCount?: number;
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    googleMapsUri?: string;
    photos?: Array<{ name: string }>;
  }>;
}

/**
 * Generate request key for deduplication
 */
function getRequestKey(request: PlacesRequest): string {
  return `places:${request.city}:${request.type}:${request.radiusMeters}:${request.maxResultCount}`;
}

/**
 * Check if circuit breaker is open
 */
function isCircuitBreakerOpen(): boolean {
  if (!circuitBreakerOpen) return false;
  if (circuitBreakerOpenUntil && Date.now() < circuitBreakerOpenUntil) {
    return true;
  }
  // Cooldown expired, reset
  circuitBreakerOpen = false;
  circuitBreakerOpenUntil = null;
  return false;
}

/**
 * Open circuit breaker (quota exceeded)
 */
function openCircuitBreaker(): void {
  circuitBreakerOpen = true;
  circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  console.error('[PlacesClient] Circuit breaker opened for 24h due to quota exceeded');
}

/**
 * Search nearby places using Google Places API
 */
export async function searchNearbyPlaces(
  request: PlacesRequest,
  location: { lat: number; lng: number }
): Promise<PlacesResponse> {
  // Check circuit breaker
  if (isCircuitBreakerOpen()) {
    throw new Error('QUOTA_EXCEEDED: Circuit breaker is open');
  }

  // Check deduplication
  const requestKey = getRequestKey(request);
  const existingRequest = requestDedupMap.get(requestKey);
  if (existingRequest) {
    console.log(`[PlacesClient] Deduped request: ${requestKey}`);
    return existingRequest;
  }

  // Create new request
  const requestPromise = (async () => {
    const url = `${PLACES_API_BASE}/places:searchNearby`;
    const body = {
      includedTypes: [request.type],
      maxResultCount: request.maxResultCount,
      locationRestriction: {
        circle: {
          center: {
            latitude: location.lat,
            longitude: location.lng,
          },
          radius: request.radiusMeters,
        },
      },
      rankPreference: 'DISTANCE' as const,
    };

    // Minimal field mask
    const fieldMask = 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.googleMapsUri,places.photos';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        // Check for quota exceeded
        if (status === 429 || status === 403 || errorText.includes('quota') || errorText.includes('QUOTA')) {
          openCircuitBreaker();
          throw new Error('QUOTA_EXCEEDED');
        }

        console.error(`[PlacesClient] API error ${status}:`, errorText);
        throw new Error(`Places API error: ${status}`);
      }

      const data: PlacesResponse = await response.json();

      // Log request (structured)
      console.log(`[PlacesClient] Success: ${requestKey}`, {
        requestKey,
        endpoint: 'searchNearby',
        status: response.status,
        placesCount: data.places?.length || 0,
        costBucket: 'nearby',
      });

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error(`[PlacesClient] Timeout: ${requestKey}`);
        throw new Error('REQUEST_TIMEOUT');
      }

      if (error.message === 'QUOTA_EXCEEDED') {
        throw error;
      }

      console.error(`[PlacesClient] Error: ${requestKey}`, error);
      throw error;
    } finally {
      // Clean up dedup map after request completes
      requestDedupMap.delete(requestKey);
    }
  })();

  // Store in dedup map
  requestDedupMap.set(requestKey, requestPromise);

  return requestPromise;
}

/**
 * Clear dedup map (call at end of request lifecycle)
 */
export function clearDedupMap(): void {
  requestDedupMap.clear();
}

/**
 * Get circuit breaker status
 */
export function getCircuitBreakerStatus(): { open: boolean; openUntil: number | null } {
  return {
    open: isCircuitBreakerOpen(),
    openUntil: circuitBreakerOpenUntil,
  };
}

/**
 * Search places using Places API (New) searchText endpoint
 * Used for "新店打卡" category with single query
 */
export async function searchTextPlaces(
  textQuery: string,
  location: { lat: number; lng: number },
  radiusMeters: number = 15000,
  maxResultCount: number = 20,
  includedTypes?: string[]
): Promise<PlacesResponse> {
  // Check circuit breaker
  if (isCircuitBreakerOpen()) {
    throw new Error('QUOTA_EXCEEDED: Circuit breaker is open');
  }

  // Check deduplication
  const requestKey = `searchText:${textQuery}:${location.lat}:${location.lng}:${radiusMeters}:${maxResultCount}`;
  const existingRequest = requestDedupMap.get(requestKey);
  if (existingRequest) {
    console.log(`[PlacesClient] Deduped request: ${requestKey}`);
    return existingRequest;
  }

  // Create new request
  const requestPromise = (async () => {
    const url = `${PLACES_API_BASE}/places:searchText`;
    const body: any = {
      textQuery,
      maxResultCount,
      locationBias: {
        circle: {
          center: {
            latitude: location.lat,
            longitude: location.lng,
          },
          radius: radiusMeters,
        },
      },
    };

    // Add includedTypes if provided
    if (includedTypes && includedTypes.length > 0) {
      body.includedTypes = includedTypes;
    }

    // Field mask for required fields
    const fieldMask = 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        // Check for quota exceeded
        if (status === 429 || status === 403 || errorText.includes('quota') || errorText.includes('QUOTA')) {
          openCircuitBreaker();
          throw new Error('QUOTA_EXCEEDED');
        }

        console.error(`[PlacesClient] API error ${status}:`, errorText);
        throw new Error(`Places API error: ${status}`);
      }

      const data: PlacesResponse = await response.json();

      // Log request (structured)
      console.log(`[PlacesClient] Success: ${requestKey}`, {
        requestKey,
        endpoint: 'searchText',
        status: response.status,
        placesCount: data.places?.length || 0,
        costBucket: 'text',
      });

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error(`[PlacesClient] Timeout: ${requestKey}`);
        throw new Error('REQUEST_TIMEOUT');
      }

      if (error.message === 'QUOTA_EXCEEDED') {
        throw error;
      }

      console.error(`[PlacesClient] Error: ${requestKey}`, error);
      throw error;
    } finally {
      // Clean up dedup map after request completes
      requestDedupMap.delete(requestKey);
    }
  })();

  // Store in dedup map
  requestDedupMap.set(requestKey, requestPromise);

  return requestPromise;
}
