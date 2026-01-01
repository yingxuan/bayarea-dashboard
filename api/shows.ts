/**
 * Vercel Serverless Function: /api/shows
 * Fetches trending TV shows using TMDB API
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, API_URLS, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const SHOWS_CACHE_TTL = CACHE_TTL.SHOWS;

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();

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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Check cache
    const nocache = req.query.nocache === '1' || req.query.nocache === 'true';
    const cacheKey = 'shows';
    const cached = cache.get(cacheKey);
    const now = Date.now();
    
    // Calculate cache metadata
    let cacheAgeSeconds = 0;
    let cacheExpiresInSeconds = Math.floor(SHOWS_CACHE_TTL / 1000);
    
    if (cached) {
      cacheAgeSeconds = Math.floor((now - cached.timestamp) / 1000);
      const remainingMs = SHOWS_CACHE_TTL - (now - cached.timestamp);
      cacheExpiresInSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    }
    
    // Return cached data if valid and not bypassed
    if (!nocache && cached && now - cached.timestamp < SHOWS_CACHE_TTL) {
      const cachedData = cached.data;
      // Ensure cached response has standard structure
      if (!cachedData.status) {
        cachedData.status = cachedData.items?.length > 0 ? "ok" : "ok";
        cachedData.items = cachedData.items || cachedData.shows || [];
        cachedData.count = cachedData.count ?? cachedData.items.length;
        cachedData.asOf = cachedData.asOf || cachedData.fetched_at || new Date().toISOString();
        cachedData.source = cachedData.source || SOURCE_INFO.TMDB;
        cachedData.ttlSeconds = cachedData.ttlSeconds || ttlMsToSeconds(SHOWS_CACHE_TTL);
      }
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cacheAgeSeconds,
        cache_expires_in_seconds: cacheExpiresInSeconds,
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
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
      age: 0,
      expiry: ttlSeconds,
    };

    // Update cache
    cache.set(cacheKey, {
      data: response,
      timestamp: now,
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/shows] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'shows';
    const stale = cache.get(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      // Ensure stale response has standard structure
      if (!staleData.status) {
        staleData.status = staleData.items?.length > 0 ? "stale" : "unavailable";
        staleData.items = staleData.items || staleData.shows || [];
        staleData.count = staleData.count ?? staleData.items.length;
        staleData.asOf = staleData.asOf || staleData.fetched_at || new Date().toISOString();
        staleData.source = staleData.source || SOURCE_INFO.TMDB;
        staleData.ttlSeconds = staleData.ttlSeconds || ttlMsToSeconds(SHOWS_CACHE_TTL);
      } else {
        staleData.status = "stale"; // Override to stale if we're using stale cache
      }
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
}
