/**
 * Vercel Serverless Function: /api/movies
 * Fetches Chinese-language movies currently in US theaters from TMDB
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, SOURCE_INFO, ttlMsToSeconds } from '../../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  normalizeCachedResponse,
  normalizeStaleResponse,
  formatUpdatedAt,
} from '../../lib/api-utils.js';

const MOVIES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface Movie {
  id: number;
  title: string;
  original_title: string;
  poster_url: string;
  rating: number;
  release_date: string;
  fandango_url: string;
}

async function fetchChineseMovies(): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY not configured');
  }

  // Fetch pages 1 and 2 in parallel
  const fetchPage = async (page: number) => {
    const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${apiKey}&language=zh-CN&region=US&page=${page}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BayAreaDashboard/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return (data.results || []) as any[];
  };

  const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(2)]);
  const results = [...page1, ...page2];

  // Include both Mandarin (zh) and Cantonese (cn)
  const CHINESE_LANGS = new Set(['zh', 'cn']);
  const seen = new Set<number>();

  return results
    .filter((item: any) => CHINESE_LANGS.has(item.original_language) && !seen.has(item.id) && seen.add(item.id))
    .map((item: any): Movie => ({
      id: item.id,
      title: item.title || item.original_title,
      original_title: item.original_title || item.title,
      poster_url: item.poster_path
        ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
        : '',
      rating: item.vote_average || 0,
      release_date: item.release_date || '',
      fandango_url: `https://www.fandango.com/search?q=${encodeURIComponent(item.title || item.original_title)}&entityType=MOVIE`,
    }));
}

export async function handleMovies(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (handleOptions(req, res)) {
    return;
  }

  // If no API key, return silently unavailable
  if (!process.env.TMDB_API_KEY) {
    return res.status(200).json({
      status: 'unavailable',
      items: [],
      count: 0,
      asOf: new Date().toISOString(),
      source: SOURCE_INFO.TMDB,
      ttlSeconds: 0,
      cache_hit: false,
      fetched_at: new Date().toISOString(),
    });
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'movies';

    const cached = getCachedData(cacheKey, MOVIES_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.TMDB, ttlMsToSeconds(MOVIES_CACHE_TTL), 'movies');
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
      });
    }

    if (nocache) {
      console.log('[API /api/movies] Cache bypass requested via ?nocache=1');
    }

    const movies = await fetchChineseMovies();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(MOVIES_CACHE_TTL);

    const responseData: any = {
      status: movies.length > 0 ? ('ok' as const) : ('unavailable' as const),
      items: movies,
      count: movies.length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.TMDB,
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      updated_at: formatUpdatedAt(),
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
    };

    if (movies.length > 0) {
      setCache(cacheKey, responseData);
    }

    console.log(`[API /api/movies] ✅ Fetched ${movies.length} Chinese movies in US theaters`);
    res.status(200).json(responseData);
  } catch (error) {
    console.error('[API /api/movies] Error:', error);

    const cacheKey = 'movies';
    const stale = getStaleCache(cacheKey);

    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.TMDB, ttlMsToSeconds(MOVIES_CACHE_TTL), 'movies');
      return res.status(200).json({
        ...staleData,
        cache_hit: true,
        stale: true,
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
      updated_at: formatUpdatedAt(),
    });
  }
}

export default handleMovies;
