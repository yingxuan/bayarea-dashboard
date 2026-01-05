/**
 * API endpoint for proxying Google Places photos
 * 
 * Prevents API key exposure in client code
 * Caches mediaUri aggressively (30+ days)
 * 
 * Usage: GET /api/spend/place-photo?photoName=... OR ?photoReference=...
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const PHOTO_CACHE_TTL_DAYS = 30;

// Simple in-memory cache (for serverless, consider using Redis or similar for production)
const photoCache = new Map<string, { url: string; cachedAt: number }>();

/**
 * Get cached photo URL
 */
function getCachedPhotoUrl(key: string): string | null {
  const cached = photoCache.get(key);
  if (!cached) return null;
  
  const ageMs = Date.now() - cached.cachedAt;
  const ttlMs = PHOTO_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > ttlMs) {
    photoCache.delete(key);
    return null;
  }
  
  return cached.url;
}

/**
 * Cache photo URL
 */
function cachePhotoUrl(key: string, url: string): void {
  photoCache.set(key, { url, cachedAt: Date.now() });
}

/**
 * Get photo media URL from photoName (New API)
 */
async function getPhotoUrlFromName(photoName: string): Promise<string> {
  const cacheKey = `name:${photoName}`;
  const cached = getCachedPhotoUrl(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Use getMedia endpoint with skipHttpRedirect to get actual mediaUri
    const url = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=600&skipHttpRedirect=true&key=${GOOGLE_PLACES_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Photo API error: ${response.status}`);
    }

    const data = await response.json();
    const mediaUri = data.photoUri || data.mediaUri;
    
    if (mediaUri) {
      cachePhotoUrl(cacheKey, mediaUri);
      return mediaUri;
    }

    // Fallback: use redirect URL
    const redirectUrl = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=600&key=${GOOGLE_PLACES_API_KEY}`;
    cachePhotoUrl(cacheKey, redirectUrl);
    return redirectUrl;
  } catch (error: any) {
    console.error('[PlacePhoto] Error fetching photo from name:', error);
    // Fallback to redirect URL
    const redirectUrl = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=600&key=${GOOGLE_PLACES_API_KEY}`;
    return redirectUrl;
  }
}

/**
 * Get photo URL from photoReference (Legacy API)
 */
function getPhotoUrlFromReference(photoReference: string): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${photoReference}&key=${GOOGLE_PLACES_API_KEY}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const photoName = req.query.photoName as string | undefined;
    const photoReference = req.query.photoReference as string | undefined;

    if (!photoName && !photoReference) {
      return res.status(400).json({ error: 'Missing photoName or photoReference parameter' });
    }

    let photoUrl: string;

    if (photoName) {
      // New API format
      photoUrl = await getPhotoUrlFromName(photoName);
    } else if (photoReference) {
      // Legacy format
      photoUrl = getPhotoUrlFromReference(photoReference);
    } else {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    // Redirect to photo URL
    return res.redirect(302, photoUrl);
  } catch (error: any) {
    console.error('[PlacePhoto] Error:', error);
    return res.status(500).json({
      error: 'FETCH_FAIL',
      message: error.message || 'Unknown error',
    });
  }
}
