/**
 * Vercel Serverless Function: /api/shows
 * Fetches trending TV shows using TMDB API
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, API_URLS, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';
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
} from './utils.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const SHOWS_CACHE_TTL = CACHE_TTL.SHOWS;

interface Show {
  id: number;
  title: string;
  description: string;
  rating: number;
  poster_url: string;
  url: string; // TMDB or IMDb URL
  first_air_date: string;
}

async function fetchTMDBShows(): Promise<Show[]> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY environment variable is not set');
  }

  // Fetch trending TV shows (this week)
  const response = await fetch(
    `${API_URLS.TMDB}/trending/tv/week?api_key=${TMDB_API_KEY}&language=en-US`
  );

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  return (data.results || []).map((show: any) => ({
    id: show.id,
    title: show.name || show.original_name,
    description: show.overview || 'No description available',
    rating: show.vote_average,
    poster_url: show.poster_path 
      ? `${API_URLS.TMDB_IMAGE}${show.poster_path}`
      : '',
    url: `${API_URLS.TMDB_PAGE}/tv/${show.id}`, // TMDB page URL
    first_air_date: show.first_air_date || '',
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'shows';
    
    // Check cache
    const cached = getCachedData(cacheKey, SHOWS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.TMDB, ttlMsToSeconds(SHOWS_CACHE_TTL), 'shows');
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
      });
    }

    // Log cache bypass
    if (nocache) {
      console.log('[API /api/shows] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data
    const shows = await fetchTMDBShows();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(SHOWS_CACHE_TTL);
    
    const response: any = {
      // Standard response structure
      status: 'ok' as const,
      items: shows.slice(0, 6), // Top 6 trending shows
      count: shows.slice(0, 6).length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.TMDB,
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      // Legacy fields for backward compatibility
      shows: shows.slice(0, 6),
      updated_at: formatUpdatedAt(),
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
      age: 0,
      expiry: ttlSeconds,
    };

    // Update cache
    setCache(cacheKey, response);

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/shows] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'shows';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.TMDB, ttlMsToSeconds(SHOWS_CACHE_TTL), 'shows');
      return res.status(200).json({
        ...staleData,
        cache_hit: true,
        stale: true,
      });
    }

    // If TMDB_API_KEY is missing, return empty array with helpful message
    if (error instanceof Error && error.message.includes('TMDB_API_KEY')) {
      const errorAtISO = new Date().toISOString();
      return res.status(200).json({
        status: 'unavailable' as const,
        items: [],
        count: 0,
        asOf: errorAtISO,
        source: SOURCE_INFO.TMDB,
        ttlSeconds: 0,
        error: 'TMDB_API_KEY not configured',
        message: 'To enable TV shows data, add TMDB_API_KEY to Vercel environment variables.',
        cache_hit: false,
        fetched_at: errorAtISO,
        // Legacy fields
        shows: [],
        updated_at: new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      });
    }

    const errorAtISO = new Date().toISOString();
    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: SOURCE_INFO.TMDB,
      ttlSeconds: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: errorAtISO,
      // Legacy fields
      shows: [],
      updated_at: formatUpdatedAt(),
    });
  }
}
