/**
 * Vercel Serverless Function: /api/deals
 * Fetches real deals from Reddit r/deals using official JSON endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, ttlMsToSeconds } from '../shared/config.js';

const DEALS_CACHE_TTL = CACHE_TTL.DEALS;

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();

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
  const response = await fetch(`${REDDIT_API_BASE}/r/deals/hot.json?limit=20`, {
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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Check cache
    const cacheKey = 'deals';
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < DEALS_CACHE_TTL) {
      return res.status(200).json({
        ...cached.data,
        cache_hit: true,
      });
    }

    // Fetch fresh data
    const deals = await fetchRedditDeals();
    
    const response = {
      deals: deals.slice(0, 8), // Top 8 deals
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
      expiry: ttlMsToSeconds(DEALS_CACHE_TTL),
    };

    // Update cache
    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/deals] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'deals';
    const stale = cache.get(cacheKey);
    
    if (stale) {
      return res.status(200).json({
        ...stale.data,
        cache_hit: true,
        stale: true,
      });
    }

    res.status(500).json({
      error: 'Failed to fetch deals',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
