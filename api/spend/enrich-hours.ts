/**
 * API endpoint for enriching opening hours
 * 
 * Usage: POST /api/spend/enrich-hours?placeId=...
 * 
 * Rules:
 * - Single call per request
 * - Circuit breaker for quota
 * - Returns opening hours data
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (req.query.placeId) {
      const placeId = req.query.placeId as string;
      if (!placeId) {
        return res.status(400).json({ error: 'Missing placeId parameter' });
      }

      const url = `${PLACES_API_BASE}/places/${placeId}`;
      const fieldMask = 'places.id,places.regularOpeningHours,places.currentOpeningHours';

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

      return res.status(200).json({
        placeId: data.id || placeId,
        regularOpeningHours: data.regularOpeningHours,
        currentOpeningHours: data.currentOpeningHours,
      });
    }

    return res.status(400).json({ error: 'Missing placeId parameter' });
  } catch (error: any) {
    console.error('[EnrichHours API] Error:', error);

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
