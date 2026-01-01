/**
 * Vercel Serverless Function: /api/shows
 * Fetches trending TV shows using TMDB API
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

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
    `${TMDB_BASE_URL}/trending/tv/week?api_key=${TMDB_API_KEY}&language=en-US`
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
      ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
      : '',
    url: `https://www.themoviedb.org/tv/${show.id}`, // TMDB page URL
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
    const cacheKey = 'shows';
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        ...cached.data,
        cache_hit: true,
      });
    }

    // Fetch fresh data
    const shows = await fetchTMDBShows();
    
    const response = {
      shows: shows.slice(0, 6), // Top 6 trending shows
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      fetched_at: new Date().toISOString(),
      cache_hit: false,
      age: 0,
      expiry: Math.floor(CACHE_TTL / 1000),
    };

    // Update cache
    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/shows] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'shows';
    const stale = cache.get(cacheKey);
    
    if (stale) {
      return res.status(200).json({
        ...stale.data,
        cache_hit: true,
        stale: true,
      });
    }

    // If TMDB_API_KEY is missing, return empty array with helpful message
    if (error instanceof Error && error.message.includes('TMDB_API_KEY')) {
      return res.status(200).json({
        shows: [],
        updated_at: new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        fetched_at: new Date().toISOString(),
        cache_hit: false,
        error: 'TMDB_API_KEY not configured',
        message: 'To enable TV shows data, add TMDB_API_KEY to Vercel environment variables.',
      });
    }

    res.status(500).json({
      error: 'Failed to fetch TV shows',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
