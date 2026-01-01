/**
 * Vercel Serverless Function: /api/deals
 * Fetches real deals from Reddit r/deals using official JSON endpoint
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

const DEALS_CACHE_TTL = CACHE_TTL.DEALS;

interface Deal {
  id: string;
  title: string;
  url: string; // Reddit post URL
  external_url?: string; // Deal link (if available)
  store: string;
  score: number;
  comments: number;
  time_ago: string;
}

async function fetchRedditDeals(): Promise<Deal[]> {
  // Fetch hot deals from r/deals
  const response = await fetch(`${API_URLS.REDDIT}/r/deals/hot.json?limit=20`, {
    headers: {
      'User-Agent': 'BayAreaDashboard/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Calculate time ago
  const getTimeAgo = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    const hours = Math.floor(diff / 3600);
    if (hours < 1) return `${Math.floor(diff / 60)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  
  // Extract store name from title (common patterns: [Store], Store:, etc.)
  const extractStore = (title: string): string => {
    const match = title.match(/\[([^\]]+)\]|^([^:]+):/);
    if (match) return match[1] || match[2];
    
    // Common store names
    const stores = ['Amazon', 'Target', 'Walmart', 'Best Buy', 'Costco', 'eBay', 'Newegg'];
    for (const store of stores) {
      if (title.toLowerCase().includes(store.toLowerCase())) {
        return store;
      }
    }
    
    return 'Various';
  };
  
  return (data.data?.children || [])
    .filter((post: any) => !post.data.stickied) // Remove stickied posts
    .map((post: any) => ({
      id: post.data.id,
      title: post.data.title,
      url: `https://www.reddit.com${post.data.permalink}`, // Reddit discussion URL
      external_url: post.data.url?.startsWith('http') ? post.data.url : undefined,
      store: extractStore(post.data.title),
      score: post.data.score || 0,
      comments: post.data.num_comments || 0,
      time_ago: getTimeAgo(post.data.created_utc),
    }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'deals';
    
    // Check cache
    const cached = getCachedData(cacheKey, DEALS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.REDDIT, ttlMsToSeconds(DEALS_CACHE_TTL), 'deals');
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
      console.log('[API /api/deals] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data
    const deals = await fetchRedditDeals();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(DEALS_CACHE_TTL);
    
    const response: any = {
      // Standard response structure
      status: 'ok' as const,
      items: deals.slice(0, 8), // Top 8 deals
      count: deals.slice(0, 8).length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.REDDIT,
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      // Legacy fields for backward compatibility
      deals: deals.slice(0, 8),
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
    console.error('[API /api/deals] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'deals';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.REDDIT, ttlMsToSeconds(DEALS_CACHE_TTL), 'deals');
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
      source: SOURCE_INFO.REDDIT,
      ttlSeconds: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: errorAtISO,
      // Legacy fields
      deals: [],
      updated_at: formatUpdatedAt(),
    });
  }
}
