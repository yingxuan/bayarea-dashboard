/**
 * Vercel Serverless Function: /api/gossip
 * Fetches trending tech discussions from Hacker News
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
  const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
  if (!response.ok) {
    throw new Error(`HN API error: ${response.statusText}`);
  }
  return response.json();
}

async function fetchHackerNews(): Promise<GossipItem[]> {
  // Fetch top stories
  const response = await fetch(`${HN_API_BASE}/topstories.json`);
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
  
  // Calculate time ago
  const getTimeAgo = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    const hours = Math.floor(diff / 3600);
    if (hours < 1) return `${Math.floor(diff / 60)} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };
  
  return validStories.map((story: any) => ({
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
    const cacheKey = 'gossip';
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        ...cached.data,
        cache_hit: true,
      });
    }

    // Fetch fresh data
    const gossip = await fetchHackerNews();
    
    const response = {
      gossip: gossip.slice(0, 8), // Top 8 stories
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      cache_hit: false,
    };

    // Update cache
    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/gossip] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'gossip';
    const stale = cache.get(cacheKey);
    
    if (stale) {
      return res.status(200).json({
        ...stale.data,
        cache_hit: true,
        stale: true,
      });
    }

    res.status(500).json({
      error: 'Failed to fetch gossip',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
