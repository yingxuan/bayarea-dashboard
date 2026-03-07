/**
 * Vercel Serverless Function: /api/community/jobs
 * Fetches layoff/career news from Reddit (r/layoffs, r/cscareerquestions)
 *
 * Requirements:
 * - Return >= 3 items
 * - Cache TTL: 30 minutes
 * - No fake placeholder items
 */

export const runtime = 'nodejs';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ttlMsToSeconds } from '../../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
} from '../../lib/api-utils.js';

const JOBS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface JobItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

const SUBREDDITS = [
  { sub: 'layoffs', label: 'r/layoffs' },
  { sub: 'cscareerquestions', label: 'r/cscq' },
  { sub: 'techworkers', label: 'r/techworkers' },
];

async function fetchJobsData(nocache: boolean = false): Promise<{ items: JobItem[]; sourceMode: 'live' | 'cache' | 'unavailable' }> {
  const cacheKey = 'community-jobs';

  if (!nocache) {
    const cached = getCachedData(cacheKey, JOBS_CACHE_TTL, false);
    if (cached && cached.data?.items?.length >= 3) {
      console.log(`[Jobs] Using cache (${cached.data.items.length} items)`);
      return { items: cached.data.items, sourceMode: 'cache' as const };
    }
  }

  const items: JobItem[] = [];
  const seenUrls = new Set<string>();

  for (const { sub, label } of SUBREDDITS) {
    try {
      const resp = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        headers: { 'User-Agent': 'BayAreaDashboard/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) {
        console.warn(`[Jobs] Reddit r/${sub} returned ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      const posts: any[] = data?.data?.children || [];
      for (const post of posts) {
        const { title, permalink, created_utc } = post.data || {};
        if (!title || title.length < 10) continue;
        const url = `https://www.reddit.com${permalink}`;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        items.push({
          title,
          url,
          source: label,
          publishedAt: created_utc ? new Date(created_utc * 1000).toISOString() : undefined,
        });
      }
    } catch (err) {
      console.warn(`[Jobs] r/${sub} fetch failed:`, err instanceof Error ? err.message : err);
    }
    if (items.length >= 8) break;
  }

  const topItems = items.slice(0, 8);

  if (topItems.length >= 3) {
    setCache(cacheKey, { items: topItems, sourceMode: 'live' });
    console.log(`[Jobs] Fetched ${topItems.length} items live`);
    return { items: topItems, sourceMode: 'live' };
  }

  // Try stale cache
  const stale = getStaleCache(cacheKey);
  if (stale && stale.data?.items?.length >= 3) {
    console.log(`[Jobs] Using stale cache (${stale.data.items.length} items)`);
    return { items: stale.data.items, sourceMode: 'cache' as const };
  }

  console.log('[Jobs] No data available');
  return { items: [], sourceMode: 'unavailable' };
}

export async function handleJobs(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  try {
    const nocache = isCacheBypass(req);
    const fetchedAt = new Date().toISOString();
    const { items, sourceMode } = await fetchJobsData(nocache);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      status: items.length > 0 ? 'ok' : 'unavailable',
      items,
      count: items.length,
      fetchedAt,
      ttlSeconds: ttlMsToSeconds(JOBS_CACHE_TTL),
      sourceMode,
    });
  } catch (error) {
    console.error('[API /api/community/jobs] Error:', error);
    res.status(200).json({
      status: 'unavailable',
      items: [],
      count: 0,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: 'unavailable',
    });
  }
}

export default handleJobs;
