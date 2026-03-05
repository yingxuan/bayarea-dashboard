/**
 * Vercel Serverless Function: /api/bayarea-movies
 * Fetches upcoming Bay Area Chinese film screenings from Ticketmaster Discovery API v2
 *
 * Requirements:
 * - Multiple keyword searches merged + deduped by event ID
 * - SQLite cache TTL: 6 hours
 * - No seed data fallback — return empty array if no results
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ttlMsToSeconds } from '../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
} from '../lib/api-utils.js';

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT = 10000; // 10 seconds
const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

interface MovieScreeningItem {
  id: string;
  name: string;
  url: string;
  image: string | null;
  venue: string | null;
  city: string | null;
  date: string; // ISO UTC
  dateDisplay: string; // e.g. "Mar 15"
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateDisplay(localDate: string): string {
  try {
    const parts = localDate.split('-');
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return `${MONTH_NAMES[month]} ${day}`;
  } catch {
    return '';
  }
}

function getBestImage(images: any[]): string | null {
  if (!images?.length) return null;
  const ratio169 = images.filter(i => i.ratio === '16_9' && !i.fallback);
  const pool = ratio169.length > 0 ? ratio169 : images.filter(i => !i.fallback);
  if (!pool.length) return images[0]?.url || null;
  pool.sort((a, b) => (b.width || 0) - (a.width || 0));
  return pool[0].url || null;
}

function mapEventToScreening(event: any): MovieScreeningItem {
  const venue = event._embedded?.venues?.[0];
  return {
    id: String(event.id),
    name: event.name || 'Untitled Event',
    url: event.url || '',
    image: getBestImage(event.images || []),
    venue: venue?.name || null,
    city: venue?.city?.name || null,
    date: event.dates?.start?.dateTime || '',
    dateDisplay: formatDateDisplay(event.dates?.start?.localDate || ''),
  };
}

async function fetchTMSearch(apiKey: string, keyword: string): Promise<any[]> {
  const now = new Date();
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const startDateTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endDateTime = future.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const params = new URLSearchParams({
    apikey: apiKey,
    keyword,
    classificationName: 'Film',
    geoPoint: '37.3382,-121.8863',
    radius: '75',
    unit: 'miles',
    sort: 'date,asc',
    size: '50',
    startDateTime,
    endDateTime,
  });

  const url = `${TM_BASE}?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[BayAreaMovies] Ticketmaster "${keyword}" returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data._embedded?.events || [];
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[BayAreaMovies] Failed to fetch "${keyword}":`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchBayAreaMovies(nocache: boolean = false): Promise<{ items: MovieScreeningItem[]; sourceMode: 'live' | 'cache' | 'unavailable' }> {
  const cacheKey = 'bayarea_movies';

  if (!nocache) {
    const cached = getCachedData(cacheKey, CACHE_TTL, false);
    if (cached?.data?.items) {
      console.log(`[BayAreaMovies] ✅ Using cache (${cached.data.items.length} items)`);
      return { items: cached.data.items, sourceMode: 'cache' };
    }
  }

  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    console.warn('[BayAreaMovies] TICKETMASTER_API_KEY not set');
    const stale = getStaleCache(cacheKey);
    const staleItems: MovieScreeningItem[] | undefined = stale?.data?.items;
    if (staleItems && staleItems.length > 0) {
      return { items: staleItems, sourceMode: 'cache' };
    }
    return { items: [], sourceMode: 'unavailable' };
  }

  // Parallel searches: Chinese + English keywords for film events
  const [results1, results2, results3] = await Promise.all([
    fetchTMSearch(apiKey, 'chinese film'),
    fetchTMSearch(apiKey, '华语'),
    fetchTMSearch(apiKey, 'mandarin film'),
  ]);

  // Merge and deduplicate by event ID
  const seen = new Set<string>();
  const merged: MovieScreeningItem[] = [];

  for (const event of [...results1, ...results2, ...results3]) {
    if (!event?.id) continue;
    const id = String(event.id);
    if (seen.has(id)) continue;
    seen.add(id);

    const screening = mapEventToScreening(event);
    if (screening.url) {
      merged.push(screening);
    }
  }

  // Sort by date ascending
  merged.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const items = merged.slice(0, 8);

  if (items.length > 0) {
    setCache(cacheKey, { items, sourceMode: 'live' });
    console.log(`[BayAreaMovies] ✅ Fetched ${items.length} film screenings`);
    return { items, sourceMode: 'live' };
  }

  // Try stale cache
  const stale = getStaleCache(cacheKey);
  const staleItems: MovieScreeningItem[] | undefined = stale?.data?.items;
  if (staleItems && staleItems.length > 0) {
    console.log(`[BayAreaMovies] ✅ Using stale cache (${staleItems.length} items)`);
    return { items: staleItems, sourceMode: 'cache' };
  }

  console.log('[BayAreaMovies] No film screenings found');
  return { items: [], sourceMode: 'unavailable' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const fetchedAt = new Date().toISOString();

    const { items, sourceMode } = await fetchBayAreaMovies(nocache);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      status: 'ok',
      items,
      count: items.length,
      fetchedAt,
      ttlSeconds: ttlMsToSeconds(CACHE_TTL),
      sourceMode,
    });
  } catch (error) {
    console.error('[API /api/bayarea-movies] Error:', error);

    const stale = getStaleCache('bayarea_movies');
    const staleItems: MovieScreeningItem[] | undefined = stale?.data?.items;
    if (staleItems && staleItems.length > 0) {
      return res.status(200).json({
        status: 'ok',
        items: staleItems,
        count: staleItems.length,
        fetchedAt: new Date().toISOString(),
        ttlSeconds: 0,
        sourceMode: 'cache',
      });
    }

    return res.status(200).json({
      status: 'unavailable',
      items: [],
      count: 0,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: 'unavailable',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
