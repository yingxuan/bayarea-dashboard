/**
 * Vercel Serverless Function: /api/chinese-gossip
 * Fetches Chinese gossip topics for Bay Area Chinese community
 * 
 * Requirements:
 * - Always return 3 items
 * - Never show "暂无内容"
 * - Data sources (priority): huaren.us → Blind → X/Twitter → Reddit/HN (fallback)
 * - Keywords: 裁员, 湾区, 码农, package, 跳槽, AI, OpenAI, 谷歌, Meta, 微软, 特斯拉, IPO, 绿卡, H1B
 * - Filter: 24-48 hours OR high heat old posts
 * - Output: title only with source prefix (e.g., 【huaren】)
 * - No explanation, no truth judgment, no opinions
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

const CHINESE_GOSSIP_CACHE_TTL = CACHE_TTL.GOSSIP; // 30 minutes

// Keywords pool (Chinese priority)
const KEYWORDS = [
  '裁员', '湾区', '码农', 'package', '跳槽', 'AI', 'OpenAI', 
  '谷歌', 'Meta', '微软', '特斯拉', 'IPO', '绿卡', 'H1B',
  'layoff', 'bay area', 'engineer', 'salary', 'job', 'tech',
  'Google', 'Microsoft', 'Tesla', 'Tesla', 'IPO', 'green card'
];

interface ChineseGossipItem {
  id: string;
  title: string;
  url: string;
  source: 'huaren' | 'blind' | 'twitter' | 'reddit' | 'hn';
  publishedAt: string;
  replyCount?: number;
  viewCount?: number;
  hotScore?: number;
}

/**
 * Check if text matches keywords (Chinese priority)
 * Supports both Chinese and English keywords
 */
function matchesKeywords(text: string): boolean {
  // For Chinese keywords, check directly (case-sensitive for Chinese)
  const chineseKeywords = ['裁员', '湾区', '码农', '跳槽', '谷歌', '微软', '特斯拉', '绿卡'];
  const hasChineseKeyword = chineseKeywords.some(keyword => text.includes(keyword));
  if (hasChineseKeyword) return true;
  
  // For English keywords, check case-insensitive
  const lowerText = text.toLowerCase();
  const englishKeywords = ['package', 'ai', 'openai', 'meta', 'ipo', 'h1b', 'layoff', 'bay area', 'engineer', 'salary', 'job', 'tech', 'google', 'microsoft', 'tesla', 'green card'];
  return englishKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Check if post is recent (24-48 hours) or high heat
 * More lenient: accept posts within 7 days if they have any engagement
 */
function isRelevant(post: {
  publishedAt: string;
  replyCount?: number;
  viewCount?: number;
  hotScore?: number;
}): boolean {
  const now = Date.now();
  const publishedTime = new Date(post.publishedAt).getTime();
  const hoursAgo = (now - publishedTime) / (1000 * 60 * 60);
  
  // Recent posts (within 7 days) - more lenient
  if (hoursAgo <= 7 * 24) {
    // Within 24-48 hours: always accept
    if (hoursAgo >= 24 && hoursAgo <= 48) {
      return true;
    }
    
    // Within 24 hours: always accept
    if (hoursAgo < 24) {
      return true;
    }
    
    // 48 hours to 7 days: accept if has engagement
    const hasEngagement = 
      (post.replyCount && post.replyCount >= 10) ||
      (post.viewCount && post.viewCount >= 100) ||
      (post.hotScore && post.hotScore >= 20);
    return hasEngagement;
  }
  
  // Older than 7 days: only high heat posts
  const hasHighHeat = 
    (post.replyCount && post.replyCount >= 50) ||
    (post.viewCount && post.viewCount >= 500) ||
    (post.hotScore && post.hotScore >= 80);
  return hasHighHeat;
}

/**
 * Fetch from Reddit (fallback source)
 */
async function fetchRedditGossip(): Promise<ChineseGossipItem[]> {
  try {
    // Search in r/bayarea, r/cscareerquestions, r/ExperiencedDevs
    const subreddits = ['bayarea', 'cscareerquestions', 'ExperiencedDevs'];
    const allPosts: ChineseGossipItem[] = [];
    
    for (const subreddit of subreddits) {
      try {
        const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=20`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BayAreaDashboard/1.0)',
          },
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const posts = data.data?.children || [];
        
        for (const post of posts) {
          const postData = post.data;
          if (!postData || !postData.title) continue;
          
          const title = postData.title;
          // More lenient: if no keyword match, still include if it's from relevant subreddits
          // For bayarea subreddit, accept all posts; for others, require keyword match
          const shouldInclude = subreddit === 'bayarea' || matchesKeywords(title);
          if (!shouldInclude) continue;
          
          const publishedAt = new Date(postData.created_utc * 1000).toISOString();
          const item: ChineseGossipItem = {
            id: `reddit_${postData.id}`,
            title: title,
            url: `https://reddit.com${postData.permalink}`,
            source: 'reddit',
            publishedAt,
            replyCount: postData.num_comments || 0,
            viewCount: postData.ups || 0,
            hotScore: postData.score || 0,
          };
          
          if (isRelevant(item)) {
            allPosts.push(item);
          }
        }
      } catch (error) {
        console.error(`[Chinese Gossip] Error fetching Reddit r/${subreddit}:`, error);
        continue;
      }
    }
    
    return allPosts;
  } catch (error) {
    console.error('[Chinese Gossip] Error fetching Reddit:', error);
    return [];
  }
}

/**
 * Fetch from Hacker News (fallback source)
 */
async function fetchHackerNewsGossip(): Promise<ChineseGossipItem[]> {
  try {
    const response = await fetch(`${API_URLS.HACKER_NEWS}/topstories.json`);
    if (!response.ok) {
      throw new Error(`HN API error: ${response.statusText}`);
    }
    
    const storyIds = await response.json();
    const stories: ChineseGossipItem[] = [];
    
    // Fetch top 20 stories
    for (const id of storyIds.slice(0, 20)) {
      try {
        const itemResponse = await fetch(`${API_URLS.HACKER_NEWS}/item/${id}.json`);
        if (!itemResponse.ok) continue;
        
        const item = await itemResponse.json();
        if (!item || !item.title || item.dead || item.deleted) continue;
        
        // More lenient: accept if matches keywords OR has high score (likely tech-related)
        const shouldInclude = matchesKeywords(item.title) || (item.score && item.score >= 50);
        if (!shouldInclude) continue;
        
        const publishedAt = new Date(item.time * 1000).toISOString();
        const gossipItem: ChineseGossipItem = {
          id: `hn_${item.id}`,
          title: item.title,
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          source: 'hn',
          publishedAt,
          replyCount: item.descendants || 0,
          hotScore: item.score || 0,
        };
        
        if (isRelevant(gossipItem)) {
          stories.push(gossipItem);
        }
      } catch (error) {
        console.error(`[Chinese Gossip] Error fetching HN item ${id}:`, error);
        continue;
      }
    }
    
    return stories;
  } catch (error) {
    console.error('[Chinese Gossip] Error fetching Hacker News:', error);
    return [];
  }
}

/**
 * Fetch from all sources with priority
 */
async function fetchAllChineseGossip(): Promise<ChineseGossipItem[]> {
  const allItems: ChineseGossipItem[] = [];
  
  // Priority 1: huaren.us (core) - TODO: implement web scraping
  // For now, skip and use fallback sources
  
  // Priority 2: Blind - TODO: implement API integration
  // For now, skip and use fallback sources
  
  // Priority 3: X/Twitter - TODO: implement API integration
  // For now, skip and use fallback sources
  
  // Priority 4: Reddit (fallback)
  try {
    const redditItems = await fetchRedditGossip();
    console.log(`[Chinese Gossip] Fetched ${redditItems.length} items from Reddit`);
    allItems.push(...redditItems);
  } catch (error) {
    console.error('[Chinese Gossip] Reddit fetch failed:', error);
  }
  
  // Priority 5: Hacker News (fallback)
  try {
    const hnItems = await fetchHackerNewsGossip();
    console.log(`[Chinese Gossip] Fetched ${hnItems.length} items from HN`);
    allItems.push(...hnItems);
  } catch (error) {
    console.error('[Chinese Gossip] HN fetch failed:', error);
  }
  
  console.log(`[Chinese Gossip] Total items before deduplication: ${allItems.length}`);
  
  // Remove duplicates by title similarity
  const uniqueItems: ChineseGossipItem[] = [];
  const seenTitles = new Set<string>();
  
  for (const item of allItems) {
    const normalizedTitle = item.title.toLowerCase().trim();
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
      uniqueItems.push(item);
    }
  }
  
  // Sort by relevance (recent + high heat first)
  uniqueItems.sort((a, b) => {
    const aTime = new Date(a.publishedAt).getTime();
    const bTime = new Date(b.publishedAt).getTime();
    const now = Date.now();
    const aHoursAgo = (now - aTime) / (1000 * 60 * 60);
    const bHoursAgo = (now - bTime) / (1000 * 60 * 60);
    
    // Recent posts first (within 7 days)
    if (aHoursAgo <= 7 * 24 && bHoursAgo > 7 * 24) return -1;
    if (aHoursAgo > 7 * 24 && bHoursAgo <= 7 * 24) return 1;
    
    // Then by heat (reply count or hot score)
    const aHeat = (a.replyCount || 0) + (a.hotScore || 0);
    const bHeat = (b.replyCount || 0) + (b.hotScore || 0);
    return bHeat - aHeat;
  });
  
  console.log(`[Chinese Gossip] Unique items after deduplication: ${uniqueItems.length}`);
  
  // Always return at least some items, even if less than 3
  // If we have items, return top 3 (or all if less than 3)
  if (uniqueItems.length > 0) {
    const result = uniqueItems.slice(0, 3);
    console.log(`[Chinese Gossip] Returning ${result.length} items`);
    return result;
  }
  
  // If no items match, return empty array (fallback will handle this)
  console.warn('[Chinese Gossip] No items found after filtering');
  return [];
}

/**
 * Format title with source prefix
 */
function formatTitleWithSource(item: ChineseGossipItem): string {
  const sourcePrefix: Record<ChineseGossipItem['source'], string> = {
    huaren: '【huaren】',
    blind: '【Blind】',
    twitter: '【X】',
    reddit: '【Reddit】',
    hn: '【HN】',
  };
  
  return `${sourcePrefix[item.source]} ${item.title}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'chinese-gossip';
    
    // Check cache
    const cached = getCachedData(cacheKey, CHINESE_GOSSIP_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.REDDIT, ttlMsToSeconds(CHINESE_GOSSIP_CACHE_TTL), 'chinese-gossip');
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
      console.log('[API /api/chinese-gossip] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data
    const items = await fetchAllChineseGossip();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(CHINESE_GOSSIP_CACHE_TTL);
    
    // Format items with source prefix
    const formattedItems = items.map(item => ({
      id: item.id,
      title: formatTitleWithSource(item),
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt,
    }));
    
    // Ensure we always have 3 items (pad with previous cache if needed)
    let finalItems = formattedItems;
    if (finalItems.length < 3) {
      // Try to get stale cache to fill remaining slots
      const stale = getStaleCache(cacheKey);
      if (stale && stale.data.items && Array.isArray(stale.data.items)) {
        const staleItems = stale.data.items as any[];
        // Add items from stale cache that aren't already in finalItems
        const existingIds = new Set(finalItems.map(i => i.id));
        const additionalItems = staleItems.filter(i => !existingIds.has(i.id));
        finalItems = [...finalItems, ...additionalItems].slice(0, 3);
      }
    }
    
    const response: any = {
      // Standard response structure
      status: 'ok' as const,
      items: finalItems,
      count: finalItems.length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.REDDIT, // Default source, will be mixed
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
    };

    // Update cache
    setCache(cacheKey, response);

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/chinese-gossip] Error:', error);
    
    // Try to return stale cache (yesterday's data)
    const cacheKey = 'chinese-gossip';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.REDDIT, ttlMsToSeconds(CHINESE_GOSSIP_CACHE_TTL), 'chinese-gossip');
      
      // Ensure we have 3 items even from stale cache
      let items = staleData.items || [];
      if (!Array.isArray(items)) {
        items = [];
      }
      if (items.length < 3) {
        // If stale cache has less than 3, we still return what we have
        // (requirement: never show "暂无内容", so we return what we can)
        console.warn(`[API /api/chinese-gossip] Stale cache has only ${items.length} items, returning them anyway`);
      }
      
      return res.status(200).json({
        ...staleData,
        items: items.slice(0, 3), // Ensure max 3
        count: Math.min(items.length, 3),
        cache_hit: true,
        stale: true,
      });
    }

    // Last resort: return empty array (but this should never happen due to stale cache fallback)
    // However, requirement says never show "暂无内容", so we return empty array silently
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
    });
  }
}
