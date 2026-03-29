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
import { XMLParser } from 'fast-xml-parser';
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
  category: 'layoff' | 'hiring' | 'discussion';
}

const SUBREDDITS = [
  { sub: 'layoffs', label: 'r/layoffs' },
  { sub: 'cscareerquestions', label: 'r/cscq' },
  { sub: 'techworkers', label: 'r/techworkers' },
];
const GOOGLE_NEWS_QUERIES = [
  'https://news.google.com/rss/search?q=tech+layoffs+when:7d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=big+tech+layoffs+when:7d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=teamblind+layoffs+when:7d&hl=en-US&gl=US&ceid=US:en',
];

function categorizeJobTitle(title: string): JobItem['category'] | null {
  if (/(layoff|laid off|job cut|downsizing|downsiz|restructur|workforce reduction|裁员)/i.test(title)) {
    return 'layoff';
  }
  if (/(hiring|recruit|interview|offer|job opening|headcount|opening|招聘|面试)/i.test(title)) {
    return 'hiring';
  }
  if (/(career|job market|求职|跳槽|内推)/i.test(title)) {
    return 'discussion';
  }
  return null;
}

async function fetchGoogleNewsItems(
  seenUrls: Set<string>,
  items: JobItem[],
): Promise<void> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
  });

  for (const rssUrl of GOOGLE_NEWS_QUERIES) {
    try {
      const resp = await fetch(rssUrl, {
        headers: { 'User-Agent': 'BayAreaDashboard/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) {
        continue;
      }

      const xml = await resp.text();
      const parsed = parser.parse(xml);
      const rawItems = parsed?.rss?.channel?.item;
      const feedItems = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

      for (const item of feedItems) {
        const title = String(item?.title || '').trim();
        const url = String(item?.link || '').trim();
        const category = categorizeJobTitle(title);
        if (!title || !url || category !== 'layoff' || seenUrls.has(url)) {
          continue;
        }

        seenUrls.add(url);
        items.push({
          title,
          url,
          source: rssUrl.includes('teamblind') ? 'Blind' : 'Google News',
          publishedAt: item?.pubDate ? new Date(item.pubDate).toISOString() : undefined,
          category,
        });
      }
    } catch (err) {
      console.warn('[Jobs] Google News fetch failed:', err instanceof Error ? err.message : err);
    }

    if (items.filter((item) => item.category === 'layoff').length >= 5) {
      break;
    }
  }
}

export async function fetchJobsData(nocache: boolean = false): Promise<{ items: JobItem[]; sourceMode: 'live' | 'cache' | 'unavailable' }> {
  const cacheKey = 'community-jobs-v2';

  if (!nocache) {
    const cached = getCachedData(cacheKey, JOBS_CACHE_TTL, false);
    if (cached && cached.data?.items?.length >= 3) {
      console.log(`[Jobs] Using cache (${cached.data.items.length} items)`);
      return { items: cached.data.items, sourceMode: 'cache' as const };
    }
  }

  const items: JobItem[] = [];
  const seenUrls = new Set<string>();
  await fetchGoogleNewsItems(seenUrls, items);

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
        const category = categorizeJobTitle(title || '');
        if (!title || title.length < 10) continue;
        if (!category) continue;
        const url = `https://www.reddit.com${permalink}`;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        items.push({
          title,
          url,
          source: label,
          publishedAt: created_utc ? new Date(created_utc * 1000).toISOString() : undefined,
          category,
        });
      }
    } catch (err) {
      console.warn(`[Jobs] r/${sub} fetch failed:`, err instanceof Error ? err.message : err);
    }
    if (items.length >= 10) break;
  }

  const topItems = items
    .sort((a, b) => {
      if (a.category === b.category) {
        return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
      }
      if (a.category === 'layoff') return -1;
      if (b.category === 'layoff') return 1;
      if (a.category === 'hiring') return -1;
      if (b.category === 'hiring') return 1;
      return 0;
    })
    .slice(0, 10);

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
      layoffCount: items.filter((item) => item.category === 'layoff').length,
      hiringCount: items.filter((item) => item.category === 'hiring').length,
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
      layoffCount: 0,
      hiringCount: 0,
      count: 0,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: 'unavailable',
    });
  }
}

export default handleJobs;
