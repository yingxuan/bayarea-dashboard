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
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { CACHE_TTL, API_URLS, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';
import { getGossipSeedData, type GossipSeedItem } from '../shared/gossip-seed-data.js';
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
          // More lenient: accept all posts from bayarea, or if matches keywords, or if has high engagement
          const hasHighEngagement = (postData.num_comments || 0) >= 20 || (postData.ups || 0) >= 50;
          const shouldInclude = subreddit === 'bayarea' || matchesKeywords(title) || hasHighEngagement;
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
        // Lower threshold to get more items
        const shouldInclude = matchesKeywords(item.title) || (item.score && item.score >= 30);
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
 * Fetch from huaren.us forum (华人闲话版块)
 */
async function fetchHuarenGossip(): Promise<ChineseGossipItem[]> {
  const HUAREN_URL = 'https://huaren.us/showforum.html?forumid=398';
  const FETCH_TIMEOUT = 10000; // 10 seconds
  
  try {
    console.log(`[Chinese Gossip] Fetching from huaren.us: ${HUAREN_URL}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    
    const response = await fetch(HUAREN_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Detect encoding and decode
    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    
    // Try to detect charset from HTML
    const sniff = buf.slice(0, 16384).toString('latin1');
    const charsetMatch = sniff.match(/charset\s*=\s*["']?\s*([a-z0-9\-_]+)/i);
    let encoding = 'utf-8';
    
    if (charsetMatch) {
      const detectedCharset = charsetMatch[1].toLowerCase();
      if (detectedCharset.includes('gbk') || detectedCharset.includes('gb2312') || detectedCharset.includes('gb18030')) {
        encoding = 'gb18030';
      } else if (detectedCharset.includes('utf')) {
        encoding = 'utf-8';
      }
    }
    
    console.log(`[Chinese Gossip] Detected encoding: ${encoding}`);
    const html = iconv.decode(buf, encoding);
    
    const $ = cheerio.load(html, {
      decodeEntities: true,
      normalizeWhitespace: false,
    });
    
    const items: ChineseGossipItem[] = [];
    const seenUrls = new Set<string>();
    const baseUrl = 'https://huaren.us/';
    
    // Find all forum posts (excluding sticky posts)
    // Look for post links in the forum listing
    // Common patterns: links in table rows, post titles, etc.
    
    // Parse all links and find post threads
    // Based on the actual HTML structure from huaren.us
    // Look for links in table rows (forum post listings are usually in tables)
    $('a').each((_, element) => {
      if (items.length >= 30) return false; // Collect enough for filtering
      
      const $link = $(element);
      const href = $link.attr('href');
      if (!href) return;
      
      // Must be a thread/post link (not forum display, not navigation)
      // huaren.us uses patterns like: viewthread.php?tid=xxx or showthread.php?tid=xxx
      // More specific: must contain 'tid=' parameter (thread ID)
      const isThreadLink = (href.includes('viewthread') || 
                           href.includes('showthread') ||
                           href.includes('thread.php')) &&
                          (href.includes('tid=') || href.includes('threadid='));
      
      if (!isThreadLink) return;
      
      // Filter out navigation and forum links
      if (href.includes('forumdisplay') || 
          href.includes('forumid=') ||
          href.includes('page=') ||
          href.includes('orderby=') ||
          href.includes('filter=') ||
          href.includes('action=') ||
          href.includes('mode=')) {
        return;
      }
      
      // Ensure URL contains thread ID parameter
      const urlParams = new URLSearchParams(href.split('?')[1] || '');
      const tid = urlParams.get('tid') || urlParams.get('threadid');
      if (!tid || tid.length < 3) {
        return; // Invalid or missing thread ID
      }
      
      // Get title from link text or title attribute
      let title = $link.text().trim() || $link.attr('title') || '';
      
      // If no title in link, try parent elements
      if (!title || title.length < 5) {
        const $parent = $link.parent();
        title = $parent.text().trim() || 
                $parent.parent().text().trim() ||
                $link.closest('td, div, li').text().trim();
      }
      
      // Clean title - remove extra whitespace and newlines
      title = title.replace(/\s+/g, ' ').trim();
      
      if (!title || title.length < 5) return;
      
      // Filter out sticky posts, navigation, and functional links
      const titleLower = title.toLowerCase();
      if (titleLower.includes('置顶') || 
          titleLower.includes('版规') || 
          titleLower.includes('公告') ||
          titleLower.includes('发帖') ||
          titleLower.includes('下页') ||
          titleLower.includes('上页') ||
          titleLower.includes('首页') ||
          titleLower.includes('版主') ||
          title === '发帖' ||
          title.length < 5) {
        return;
      }
      
      // Build absolute URL - ensure it's a complete thread URL
      let url: string;
      try {
        if (href.startsWith('http')) {
          url = href;
        } else if (href.startsWith('/')) {
          url = new URL(href, baseUrl).toString();
        } else {
          url = new URL(href, baseUrl).toString();
        }
        
        // Ensure URL has thread ID parameter
        const urlObj = new URL(url);
        const tid = urlObj.searchParams.get('tid') || urlObj.searchParams.get('threadid');
        if (!tid || tid.length < 3) {
          return; // Skip if no valid thread ID
        }
        
        // Normalize URL - ensure it points to the thread view page
        if (!url.includes('viewthread') && !url.includes('showthread') && !url.includes('thread.php')) {
          // If URL doesn't have the thread view path, construct it
          url = `${baseUrl}viewthread.php?tid=${tid}`;
        }
      } catch (error) {
        console.warn(`[Chinese Gossip] Failed to build URL from href: ${href}`, error);
        return;
      }
      
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      
      // Try to extract metadata from the row/container
      const $row = $link.closest('tr, tbody, div, li, td');
      let replyCount = 0;
      let viewCount = 0;
      let publishedAt = new Date().toISOString();
      
      // Look for numbers in the row (reply/view counts)
      // From the HTML structure, numbers like "322" (回复数) and "121" (查看数) appear in table cells
      $row.find('td, span, div').each((_, el) => {
        const text = $(el).text().trim();
        // Extract numbers (reply counts are usually smaller, view counts larger)
        const numbers = text.match(/\d+/g);
        if (numbers) {
          numbers.forEach(numStr => {
            const num = parseInt(numStr, 10);
            if (num > 0 && num < 1000000) {
              // Heuristic: numbers < 10000 are usually reply counts, >= 10000 are view counts
              if (num < 10000 && replyCount === 0) {
                replyCount = num;
              } else if (num >= 10000 && viewCount === 0) {
                viewCount = num;
              }
            }
          });
        }
        
        // Look for date patterns: "2026-01-02" or "01-02 16:00" or "2026-01-02 16:00"
        const dateMatch = text.match(/(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})\s*(\d{2}:\d{2})?/);
        if (dateMatch) {
          try {
            const dateStr = dateMatch[0];
            if (dateStr.includes(' ')) {
              // Format: "2026-01-02 16:00" or "01-02 16:00"
              const [datePart, timePart] = dateStr.split(' ');
              if (datePart.includes('-')) {
                const parts = datePart.split('-');
                if (parts.length === 3) {
                  // Full date: "2026-01-02"
                  publishedAt = new Date(`${datePart}T${timePart || '00:00'}:00`).toISOString();
                } else if (parts.length === 2) {
                  // Month-day: "01-02"
                  const year = new Date().getFullYear();
                  publishedAt = new Date(`${year}-${datePart}T${timePart || '00:00'}:00`).toISOString();
                }
              }
            } else {
              // Just date: "2026-01-02"
              publishedAt = new Date(dateStr).toISOString();
            }
          } catch {
            // Keep default
          }
        }
      });
      
      // Accept all posts from huaren.us gossip forum (华人闲话版块)
      // No keyword filtering needed since this is already a gossip forum
      items.push({
        id: `huaren_${url.split('/').pop()?.split('?')[0] || Date.now()}`,
        title: title,
        url: url,
        source: 'huaren',
        publishedAt: publishedAt,
        replyCount: replyCount || undefined,
        viewCount: viewCount || undefined,
        hotScore: (replyCount + viewCount) || undefined,
      });
    });
    
    // Filter by relevance (recent or high heat)
    const filteredItems = items.filter(item => isRelevant(item));
    
    console.log(`[Chinese Gossip] Fetched ${filteredItems.length} items from huaren.us (from ${items.length} total)`);
    return filteredItems;
  } catch (error) {
    console.error('[Chinese Gossip] Error fetching huaren.us:', error);
    return [];
  }
}

/**
 * Fetch from all sources with priority
 * Only use huaren.us as the data source
 */
async function fetchAllChineseGossip(): Promise<ChineseGossipItem[]> {
  const allItems: ChineseGossipItem[] = [];
  
  // Only source: huaren.us (华人闲话版块)
  try {
    const huarenItems = await fetchHuarenGossip();
    console.log(`[Chinese Gossip] ✅ Fetched ${huarenItems.length} items from huaren.us`);
    allItems.push(...huarenItems);
  } catch (error) {
    console.error('[Chinese Gossip] ❌ huaren.us fetch failed:', error);
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
      // Filter cached data to only include huaren items
      let cachedItems = cachedData.items || [];
      if (Array.isArray(cachedItems)) {
        cachedItems = cachedItems.filter((item: any) => item.source === 'huaren');
        console.log(`[API /api/chinese-gossip] Filtered cached data to ${cachedItems.length} huaren items`);
      }
      normalizeCachedResponse({ ...cachedData, items: cachedItems }, SOURCE_INFO.REDDIT, ttlMsToSeconds(CHINESE_GOSSIP_CACHE_TTL), 'chinese-gossip');
      return res.status(200).json({
        ...cachedData,
        items: cachedItems,
        count: cachedItems.length,
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
    
    // Filter: Only keep huaren items (remove Reddit/HN)
    const huarenItemsOnly = formattedItems.filter(item => item.source === 'huaren');
    console.log(`[API /api/chinese-gossip] Filtered to ${huarenItemsOnly.length} huaren items (from ${formattedItems.length} total)`);
    
    // Ensure we always have 3 items (pad with previous cache if needed)
    let finalItems = huarenItemsOnly;
    if (finalItems.length < 3) {
      // Try to get stale cache to fill remaining slots (only huaren items)
      const stale = getStaleCache(cacheKey);
      if (stale && stale.data.items && Array.isArray(stale.data.items)) {
        const staleItems = stale.data.items as any[];
        // Only use huaren items from stale cache
        const huarenStaleItems = staleItems.filter((i: any) => i.source === 'huaren');
        // Add items from stale cache that aren't already in finalItems
        const existingIds = new Set(finalItems.map(i => i.id));
        const additionalItems = huarenStaleItems.filter((i: any) => !existingIds.has(i.id));
        finalItems = [...finalItems, ...additionalItems].slice(0, 3);
        console.log(`[API /api/chinese-gossip] Added ${additionalItems.length} huaren items from stale cache`);
      }
    }
    
    // If still less than 3, use seed data as fallback (only huaren items)
    if (finalItems.length < 3) {
      console.warn(`[API /api/chinese-gossip] Only found ${finalItems.length} huaren items, using seed data as fallback`);
      const seedItems = getGossipSeedData();
      // Only use huaren items from seed data
      const huarenSeedItems = seedItems.filter((item: any) => item.source === 'huaren');
      const existingIds = new Set(finalItems.map(i => i.id));
      const seedFormatted = huarenSeedItems
        .filter(item => !existingIds.has(item.id))
        .map(item => ({
          id: item.id,
          title: formatTitleWithSource(item as ChineseGossipItem),
          url: item.url,
          source: item.source,
          publishedAt: item.publishedAt,
        }));
      finalItems = [...finalItems, ...seedFormatted].slice(0, 3);
      console.log(`[API /api/chinese-gossip] Added ${seedFormatted.length} huaren items from seed data`);
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
      // Filter stale cache to only include huaren items
      let items = (staleData.items || []).filter((item: any) => item.source === 'huaren');
      if (!Array.isArray(items)) {
        items = [];
      }
      console.log(`[API /api/chinese-gossip] Filtered stale cache to ${items.length} huaren items`);
      
      if (items.length < 3) {
        // If stale cache has less than 3, fill with seed data (only huaren)
        console.warn(`[API /api/chinese-gossip] Stale cache has only ${items.length} huaren items, using seed data as fallback`);
        const seedItems = getGossipSeedData();
        // Only use huaren items from seed data
        const huarenSeedItems = seedItems.filter((item: any) => item.source === 'huaren');
        const existingIds = new Set(items.map((i: any) => i.id));
        const seedFormatted = huarenSeedItems
          .filter(item => !existingIds.has(item.id))
          .map(item => ({
            id: item.id,
            title: formatTitleWithSource(item as ChineseGossipItem),
            url: item.url,
            source: item.source,
            publishedAt: item.publishedAt,
          }));
        items = [...items, ...seedFormatted].slice(0, 3);
      }
      
      normalizeStaleResponse({ ...staleData, items }, SOURCE_INFO.REDDIT, ttlMsToSeconds(CHINESE_GOSSIP_CACHE_TTL), 'chinese-gossip');
      
      return res.status(200).json({
        ...staleData,
        items: items.slice(0, 3), // Ensure max 3
        count: Math.min(items.length, 3),
        cache_hit: true,
        stale: true,
      });
    }

    // Last resort: return seed data (only huaren items)
    console.warn('[API /api/chinese-gossip] All sources failed, using seed data as last resort (huaren only)');
    const errorAtISO = new Date().toISOString();
    const seedItems = getGossipSeedData();
    // Only use huaren items from seed data
    const huarenSeedItems = seedItems.filter((item: any) => item.source === 'huaren');
    const seedFormatted = huarenSeedItems.map(item => ({
      id: item.id,
      title: formatTitleWithSource(item as ChineseGossipItem),
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt,
    }));
    
    res.status(200).json({
      status: 'ok' as const,
      items: seedFormatted,
      count: seedFormatted.length,
      asOf: errorAtISO,
      source: SOURCE_INFO.REDDIT,
      ttlSeconds: ttlMsToSeconds(CHINESE_GOSSIP_CACHE_TTL),
      cache_hit: false,
      fetched_at: errorAtISO,
      fallback: 'seed',
    });
  }
}
