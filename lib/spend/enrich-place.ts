/**
 * API endpoint for enriching place metadata
 * 
 * Two modes:
 * 1. Resolve placeId: POST ?textQuery=...&lat=...&lng=...&radius=...
 * 2. Get details: POST ?placeId=...
 * 
 * Rules:
 * - Single call per request
 * - Circuit breaker for quota
 * - Returns minimal data needed
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

interface PlaceSearchResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  googleMapsUri?: string;
}

/**
 * Resolve placeId from text query
 */
async function resolvePlaceId(
  textQuery: string,
  location: { lat: number; lng: number },
  radiusMeters: number
): Promise<{ placeId: string | null; name: string | null; city: string | null }> {
  try {
    const url = `${PLACES_API_BASE}/places:searchText`;
    const body = {
      textQuery,
      maxResultCount: 3,
      locationBias: {
        circle: {
          center: {
            latitude: location.lat,
            longitude: location.lng,
          },
          radius: radiusMeters,
        },
      },
      includedTypes: ['restaurant', 'cafe'],
    };

    const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429 || response.status === 403 || errorText.includes('quota')) {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`Places API error: ${response.status}`);
    }

    const data = await response.json();
    const places = data.places || [];
    
    if (places.length === 0) {
      return { placeId: null, name: null, city: null };
    }

    // Pick best match (first result is usually best)
    const bestMatch = places[0];
    if (!bestMatch.id || !bestMatch.displayName) {
      return { placeId: null, name: null, city: null };
    }

    // Extract city from address
    let city = '';
    if (bestMatch.formattedAddress) {
      const parts = bestMatch.formattedAddress.split(',');
      if (parts.length >= 2) {
        city = parts[parts.length - 2].trim();
      }
    }

    return {
      placeId: bestMatch.id,
      name: bestMatch.displayName.text,
      city,
    };
  } catch (error: any) {
    console.error('[EnrichPlace API] Error resolving placeId:', error);
    throw error;
  }
}

/**
 * Fetch place details by placeId
 */
async function fetchPlaceDetails(placeId: string): Promise<{
  placeId: string;
  name: string;
  city: string;
  rating: number;
  userRatingCount: number;
  photo?: {
    photoName?: string;
    photoReference?: string;
    photoUrl?: string;
  };
  googleMapsUri?: string;
}> {
  const url = `${PLACES_API_BASE}/places/${placeId}`;
  const fieldMask = 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.photos,places.googleMapsUri';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429 || response.status === 403 || errorText.includes('quota')) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(`Places API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract photo (STEP 3: Ensure unique photoName per item)
  let photo: { photoName?: string; photoReference?: string; photoUrl?: string } | undefined;
  if (data.photos && data.photos.length > 0) {
    const firstPhoto = data.photos[0];
    if (firstPhoto.name) {
      // New API format - use getMedia endpoint with skipHttpRedirect to get actual mediaUri
      // For now, use redirect URL but add cache-buster based on placeId
      const cacheBuster = placeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000;
      photo = {
        photoName: firstPhoto.name,
        // Use redirect URL (browser will follow redirect to actual image)
        photoUrl: `https://places.googleapis.com/v1/${firstPhoto.name}/media?maxWidthPx=600&key=${GOOGLE_PLACES_API_KEY}&cb=${cacheBuster}`,
      };
    } else if (firstPhoto.photoReference) {
      // Legacy format - add cache-buster based on placeId
      const cacheBuster = placeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000;
      photo = {
        photoReference: firstPhoto.photoReference,
        photoUrl: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${firstPhoto.photoReference}&key=${GOOGLE_PLACES_API_KEY}&cb=${cacheBuster}`,
      };
    }
  }

  // Extract city from address
  let city = '';
  if (data.formattedAddress) {
    const parts = data.formattedAddress.split(',');
    if (parts.length >= 2) {
      city = parts[parts.length - 2].trim();
    }
  }

  return {
    placeId: data.id || placeId,
    name: data.displayName?.text || '',
    city,
    rating: data.rating || 0,
    userRatingCount: data.userRatingCount || 0,
    photo,
    googleMapsUri: data.googleMapsUri,
  };
}

export async function handleEnrichPlace(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Mode 1: Resolve placeId from text query
    if (req.query.textQuery) {
      const textQuery = req.query.textQuery as string;
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const radius = parseFloat(req.query.radius as string) || 15000;

      if (!textQuery || isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Missing required parameters: textQuery, lat, lng' });
      }

      const result = await resolvePlaceId(textQuery, { lat, lng }, radius);
      return res.status(200).json(result);
    }

    // Mode 2: Get place details by placeId
    if (req.query.placeId) {
      const placeId = req.query.placeId as string;
      if (!placeId) {
        return res.status(400).json({ error: 'Missing placeId parameter' });
      }

      const details = await fetchPlaceDetails(placeId);
      return res.status(200).json(details);
    }

    return res.status(400).json({ error: 'Missing textQuery or placeId parameter' });
  } catch (error: any) {
    console.error('[EnrichPlace API] Error:', error);

    if (error.message === 'QUOTA_EXCEEDED' || error.message?.includes('QUOTA')) {
      return res.status(429).json({
        error: 'QUOTA_EXCEEDED',
        message: 'Places API quota exceeded. Cooldown activated for 7 days.',
      });
    }

    return res.status(500).json({
      error: 'FETCH_FAIL',
      message: error.message || 'Unknown error',
    });
  }
}
