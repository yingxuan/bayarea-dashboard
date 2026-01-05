/**
 * API endpoint for refreshing "新店打卡" (new places) category
 * 
 * Rules:
 * - Exactly 1 Places API call per refresh
 * - Uses searchText with "restaurant OR cafe"
 * - Local filtering for new-ish places (rating >= 4.0, userRatingCount <= 80)
 * - Circuit breaker with 7-day cooldown
 * - Returns cached pool format
 * 
 * Usage: POST /api/spend/new-places?manual_refresh=1
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchTextPlaces } from './placesClient';

interface CachedPlace {
  placeId: string;
  name: string;
  rating: number;
  userRatingCount: number;
  address: string;
  mapsUrl: string;
}

const SOUTH_BAY_CENTER = { lat: 37.3230, lng: -122.0322 };
const RADIUS_METERS = 15000;
const MAX_RESULT_COUNT = 20;

// New-ish filter thresholds
const PRIMARY_THRESHOLD = { rating: 4.0, userRatingCount: 80 };
const FALLBACK_THRESHOLD = { rating: 3.8, userRatingCount: 150 };

interface NewPlacesPlace {
  id: string;
  displayName?: {
    text: string;
    languageCode: string;
  };
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  googleMapsUri?: string;
}

interface NewPlacesResponse {
  places?: NewPlacesPlace[];
}

export async function handleNewPlaces(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const manualRefresh = req.query.manual_refresh === '1';
  if (!manualRefresh) {
    return res.status(400).json({ error: 'manual_refresh=1 required' });
  }

  try {
    console.log('[New Places API] Starting refresh...');

    // Make exactly 1 API call
    const response = await searchTextPlaces(
      'restaurant OR cafe',
      SOUTH_BAY_CENTER,
      RADIUS_METERS,
      MAX_RESULT_COUNT,
      ['restaurant', 'cafe']
    );

    const places = response.places || [];
    console.log(`[New Places API] Received ${places.length} places from API`);

    // Convert to CachedPlace format
    const cachedPlaces = places
      .filter((p) => 
        p.rating !== undefined && 
        p.userRatingCount !== undefined && 
        p.id && 
        p.displayName &&
        typeof p.rating === 'number' &&
        typeof p.userRatingCount === 'number'
      )
      .map((p) => ({
        placeId: p.id,
        name: p.displayName!.text,
        rating: p.rating as number,
        userRatingCount: p.userRatingCount as number,
        address: p.formattedAddress || '',
        mapsUrl: p.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${p.id}`,
      }));

    // STEP 3: Hard enforce new-ish constraints (exclude >= 500 ratingCount ALWAYS)
    // First, exclude all places with >= 500 ratingCount (never "new-ish")
    const candidates = cachedPlaces.filter((p) => p.userRatingCount < 500);
    console.log(`[New Places API] After excluding >=500 ratingCount: ${candidates.length} places`);

    // Apply local filtering: Primary threshold
    let filtered = candidates.filter(
      (p) => p.rating >= PRIMARY_THRESHOLD.rating && p.userRatingCount <= PRIMARY_THRESHOLD.userRatingCount
    );

    console.log(`[New Places API] After primary filter (rating>=${PRIMARY_THRESHOLD.rating}, count<=${PRIMARY_THRESHOLD.userRatingCount}): ${filtered.length} places`);

    // Fallback: relax if < 3 results (but still exclude >= 500)
    if (filtered.length < 3) {
      filtered = candidates.filter(
        (p) => p.rating >= FALLBACK_THRESHOLD.rating && p.userRatingCount <= FALLBACK_THRESHOLD.userRatingCount
      );
      console.log(`[New Places API] After fallback filter (rating>=${FALLBACK_THRESHOLD.rating}, count<=${FALLBACK_THRESHOLD.userRatingCount}): ${filtered.length} places`);
    }

    // If still < 3, will fallback to seed data on client side
    if (filtered.length < 3) {
      console.warn(`[New Places API] Only ${filtered.length} places after filtering, client will use seed fallback`);
    }

    // Return in CachedPool format
    const pool = {
      version: 1,
      updatedAt: Date.now(),
      ttlDays: 14,
      sourceMode: (filtered.length >= 3 ? 'live' : 'seed') as 'live' | 'seed',
      requestMeta: {
        radiusMeters: RADIUS_METERS,
        maxResultCount: MAX_RESULT_COUNT,
        includedTypes: ['restaurant', 'cafe'],
        keyword: 'restaurant OR cafe',
      },
      items: filtered,
    };

    return res.status(200).json(pool);
  } catch (error: any) {
    console.error('[New Places API] Error:', error);

    // Handle quota exceeded
    if (error.message === 'QUOTA_EXCEEDED' || error.message?.includes('QUOTA')) {
      return res.status(429).json({
        error: 'QUOTA_EXCEEDED',
        message: 'Places API quota exceeded. Cooldown activated for 7 days.',
      });
    }

    // Handle other errors
    return res.status(500).json({
      error: 'FETCH_FAIL',
      message: error.message || 'Unknown error',
    });
  }
}
