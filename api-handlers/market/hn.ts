/**
 * Hacker News Top Stories handler: /api/hn
 * Fetches top 5 HN stories via Firebase API (no auth, accessible from Vercel)
 * Cache TTL: 15 minutes
 */

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

const HN_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const HN_TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const STORY_COUNT = 5;
const FETCH_TIMEOUT = 8000;

interface HNStory {
  id: number;
  title: string;
  url: string;
  score: number;
  commentCount: number;
  hnUrl: string;
}

export async function handleHN(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  const cacheKey = 'hn-top-stories';

  if (!isCacheBypass(req)) {
    const cached = getCachedData(cacheKey, HN_CACHE_TTL, false);
    if (cached?.data) {
      return res.status(200).json({ ...cached.data, cache_hit: true });
    }
  }

  try {
    const topResp = await fetch(HN_TOP_STORIES_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!topResp.ok) throw new Error(`HN API returned ${topResp.status}`);

    const ids: number[] = await topResp.json();
    const topIds = ids.slice(0, STORY_COUNT * 2); // Fetch extra in case some fail

    const storyResults = await Promise.allSettled(
      topIds.map(id =>
        fetch(HN_ITEM_URL(id), { signal: AbortSignal.timeout(3000) })
          .then(r => r.json())
      )
    );

    const stories: HNStory[] = storyResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value?.title)
      .map(r => r.value)
      .filter(s => s.type === 'story' && s.title && (s.url || s.id))
      .slice(0, STORY_COUNT)
      .map(s => ({
        id: s.id,
        title: s.title,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        score: s.score || 0,
        commentCount: s.descendants || 0,
        hnUrl: `https://news.ycombinator.com/item?id=${s.id}`,
      }));

    const payload = {
      status: 'ok' as const,
      items: stories,
      count: stories.length,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: ttlMsToSeconds(HN_CACHE_TTL),
      cache_hit: false,
    };

    if (stories.length > 0) {
      setCache(cacheKey, payload);
    }
    return res.status(200).json(payload);
  } catch (error) {
    const stale = getStaleCache(cacheKey);
    if (stale?.data) {
      return res.status(200).json({ ...stale.data, cache_hit: true, stale: true });
    }
    console.error('[HN] Error:', error instanceof Error ? error.message : error);
    return res.status(200).json({
      status: 'unavailable',
      items: [],
      count: 0,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      cache_hit: false,
    });
  }
}
