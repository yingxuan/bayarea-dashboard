/**
 * Vercel Serverless Function: /api/gossip
 * Fetches trending tech discussions from Hacker News
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, API_URLS, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';

const GOSSIP_CACHE_TTL = CACHE_TTL.GOSSIP;

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();

interface GossipItem {
  id: number;
  title: string;
  url: string; // HN discussion URL
  score: number;
  comments: number;
  author: string;
  time_ago: string;
}

async function fetchHNItem(id: number): Promise<any> {
  const response = await fetch(`${API_URLS.HACKER_NEWS}/item/${id}.json`);
  if (!response.ok) {
    throw new Error(`HN API error: ${response.statusText}`);
  }
  return response.json();
}

async function fetchHackerNews(): Promise<GossipItem[]> {
  // Fetch top stories
    const response = await fetch(`${API_URLS.HACKER_NEWS}/topstories.json`);
  if (!response.ok) {
    throw new Error(`HN API error: ${response.statusText}`);
  }
  
  const storyIds = await response.json();
  
  // Fetch details for top 15 stories (to filter and get best 8)
  const stories = await Promise.all(
    storyIds.slice(0, 15).map((id: number) => fetchHNItem(id))
  );
  
  // Filter out dead/deleted stories and those without URLs
  const validStories = stories.filter(story => 
    story && !story.dead && !story.deleted && story.title
  );
  
  // Filter to 7 days old max (7 * 24 * 3600 = 604800 seconds)
  const sevenDaysAgo = Date.now() / 1000 - 604800;
  const recentStories = validStories.filter((story: any) => story.time >= sevenDaysAgo);
  
  // Calculate time ago
  const getTimeAgo = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    const hours = Math.floor(diff / 3600);
    if (hours < 1) return `${Math.floor(diff / 60)} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };
  
  return recentStories.map((story: any) => ({
    id: story.id,
    title: story.title,
    url: story.url || `https://news.ycombinator.com/item?id=${story.id}`, // External URL or HN discussion
    score: story.score || 0,
    comments: story.descendants || 0,
    author: story.by || 'unknown',
    time_ago: getTimeAgo(story.time),
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
    const cacheKey = 'gossip';
    const cached = cache.get(cacheKey);
    const now = Date.now();
    
    if (!nocache && cached && now - cached.timestamp < GOSSIP_CACHE_TTL) {
      const cachedData = cached.data;
      // Ensure cached response has standard structure
      if (!cachedData.status) {
        cachedData.status = cachedData.items?.length > 0 ? "ok" : "ok";
        cachedData.items = cachedData.items || cachedData.gossip || [];
        cachedData.count = cachedData.count ?? cachedData.items.length;
        cachedData.asOf = cachedData.asOf || cachedData.fetched_at || new Date().toISOString();
        cachedData.source = cachedData.source || SOURCE_INFO.HACKER_NEWS;
        cachedData.ttlSeconds = cachedData.ttlSeconds || ttlMsToSeconds(GOSSIP_CACHE_TTL);
      }
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
      });
    }

    // Fetch fresh data
    const gossip = await fetchHackerNews();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(GOSSIP_CACHE_TTL);
    
    const response: any = {
      // Standard response structure
      status: 'ok' as const,
      items: gossip.slice(0, 8), // Top 8 stories
      count: gossip.slice(0, 8).length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.HACKER_NEWS,
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      // Legacy fields for backward compatibility
      gossip: gossip.slice(0, 8),
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
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
    console.error('[API /api/gossip] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'gossip';
    const stale = cache.get(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      // Ensure stale response has standard structure
      if (!staleData.status) {
        staleData.status = staleData.items?.length > 0 ? "stale" : "unavailable";
        staleData.items = staleData.items || staleData.gossip || [];
        staleData.count = staleData.count ?? staleData.items.length;
        staleData.asOf = staleData.asOf || staleData.fetched_at || new Date().toISOString();
        staleData.source = staleData.source || { name: 'Hacker News', url: 'https://news.ycombinator.com/' };
        staleData.ttlSeconds = staleData.ttlSeconds || ttlMsToSeconds(GOSSIP_CACHE_TTL);
      } else {
        staleData.status = "stale"; // Override to stale if we're using stale cache
      }
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
      source: SOURCE_INFO.HACKER_NEWS,
      ttlSeconds: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: errorAtISO,
      // Legacy fields
      gossip: [],
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
