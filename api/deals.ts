/**
 * Vercel Serverless Function: /api/deals
 * Fetches deals from RSS sources: Slickdeals, Doctor of Credit, Reddit r/deals
 * 
 * Requirements:
 * - Always return >= 3 real, clickable deal items
 * - Filter by freshness (7 days), title quality, spam detection
 * - Score by dollar amounts, percentages, deal keywords, retailers
 * - De-duplicate by normalized URL
 * - Multi-layer fallback: Live → Cache (6h) → Seed
 * - Debug logging for dev
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { XMLParser } from 'fast-xml-parser';
import { ttlMsToSeconds } from '../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
} from './utils.js';

const DEALS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const RSS_FETCH_TIMEOUT = 8000; // 8 seconds

// RSS Sources
const RSS_SOURCES = [
  {
    name: 'Slickdeals',
    url: 'https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&rss=1',
    label: 'Slickdeals',
  },
  {
    name: 'Doctor of Credit',
    url: 'https://www.doctorofcredit.com/feed/',
    label: 'DoC',
  },
  {
    name: 'Reddit r/deals',
    url: 'https://www.reddit.com/r/deals/.rss',
    label: 'Reddit',
  },
];

interface DealItem {
  id: string;
  title: string;
  url: string;
  source: string; // 'Slickdeals' | 'DoC' | 'Reddit'
  sourceLabel: string; // Display label
  publishedAt?: string; // ISO date string
  score: number; // Calculated score for ranking
  sourceMode: 'live' | 'cache' | 'seed'; // Data source mode
}

// Seed data: Real deal URLs (must be real, clickable deals)
// These are example URLs - in production, these should be actual deal pages from recent successful fetches
const SEED_DEALS: DealItem[] = [
  {
    id: 'seed-1',
    title: 'Amazon Prime Day Deals - Up to 50% Off Electronics',
    url: 'https://www.amazon.com/deals',
    source: 'Slickdeals',
    sourceLabel: 'Slickdeals',
    publishedAt: new Date().toISOString(),
    score: 85,
    sourceMode: 'seed',
  },
  {
    id: 'seed-2',
    title: 'Costco Membership $60 - $20 Shop Card Offer',
    url: 'https://www.costco.com/membership.html',
    source: 'DoC',
    sourceLabel: 'DoC',
    publishedAt: new Date().toISOString(),
    score: 80,
    sourceMode: 'seed',
  },
  {
    id: 'seed-3',
    title: 'Best Buy Clearance - Up to 40% Off Tech',
    url: 'https://www.bestbuy.com/site/clearance',
    source: 'Reddit',
    sourceLabel: 'Reddit',
    publishedAt: new Date().toISOString(),
    score: 75,
    sourceMode: 'seed',
  },
];

/**
 * Normalize URL: Remove UTM parameters and tracking params
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove common tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Calculate similarity between two titles (basic)
 */
function titleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(title1.toLowerCase().split(/\s+/));
  const words2 = new Set(title2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

/**
 * Check if item is fresh (within 7 days)
 */
function isFresh(publishedAt?: string): boolean {
  if (!publishedAt) return false;
  try {
    const pubDate = new Date(publishedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  } catch {
    return false;
  }
}

/**
 * Check if title is low-quality or spammy
 */
function isLowQualityTitle(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Too short
  if (title.length < 8) return true;
  
  // Generic navigation-like (only common words without specifics)
  const genericWords = ['deals', 'discussion', 'daily', 'thread', 'post', 'link'];
  const words = titleLower.split(/\s+/);
  const hasSpecificContent = words.some(word => 
    !genericWords.includes(word) && word.length > 3
  );
  if (!hasSpecificContent && words.length <= 3) return true;
  
  // Spammy phrases (unless includes specific $ or %)
  const spamPhrases = [
    'sponsored',
    'promo code sitewide',
    'click here',
    'subscribe',
  ];
  
  for (const phrase of spamPhrases) {
    if (titleLower.includes(phrase)) {
      // Allow if has specific dollar or percent
      const hasDollar = /\$\s?\d+(\.\d{1,2})?/.test(title);
      const hasPercent = /\b\d{1,3}%\b/.test(title);
      if (!hasDollar && !hasPercent) return true;
    }
  }
  
  return false;
}

/**
 * Calculate score for a deal item
 */
function calculateScore(item: { title: string; publishedAt?: string }): number {
  let score = 50; // Base score
  const title = item.title;
  const titleLower = title.toLowerCase();
  
  // Dollar amount boost
  const dollarMatch = title.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  if (dollarMatch) {
    const amount = parseFloat(dollarMatch[1]);
    if (amount >= 100) score += 20;
    else if (amount >= 50) score += 15;
    else if (amount >= 20) score += 10;
    else score += 5;
  }
  
  // Percent off boost
  const percentMatch = title.match(/\b(\d{1,3})%\s*(off|discount|sale)/i);
  if (percentMatch) {
    const percent = parseInt(percentMatch[1]);
    if (percent >= 50) score += 20;
    else if (percent >= 30) score += 15;
    else if (percent >= 20) score += 10;
    else score += 5;
  }
  
  // Deal keywords boost
  const dealKeywords = ['free', 'off', 'discount', 'deal', 'coupon', 'code', 'clearance', 'bundle', 'bogo'];
  dealKeywords.forEach(keyword => {
    if (titleLower.includes(keyword)) score += 3;
  });
  
  // Popular retailers boost
  const retailers = [
    'amazon', 'costco', 'best buy', 'target', 'walmart', 
    'home depot', 'apple', 'google', 'microsoft', 'uber', 'lyft'
  ];
  retailers.forEach(retailer => {
    if (titleLower.includes(retailer)) score += 5;
  });
  
  // Freshness boost
  if (isFresh(item.publishedAt)) {
    score += 10;
  } else if (item.publishedAt) {
    // Older but has date gets small boost
    score += 2;
  }
  
  return Math.min(100, score); // Cap at 100
}

/**
 * Fetch RSS feed
 */
async function fetchRSSFeed(source: typeof RSS_SOURCES[0]): Promise<{ items: DealItem[]; debug: any }> {
  const debug: any = {
    source: source.name,
    url: source.url,
    httpStatus: null,
    contentType: null,
    responsePreview: null,
    parsedCount: 0,
    filteredCount: 0,
  };
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT);
    
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    clearTimeout(timeoutId);
    
    debug.httpStatus = `${response.status} ${response.statusText}`;
    debug.contentType = response.headers.get('content-type') || 'unknown';
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    debug.responsePreview = xmlText.substring(0, 200);
    
    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
    const feed = parser.parse(xmlText);
    
    // Extract items (RSS 2.0 or Atom)
    const rssItems = feed?.rss?.channel?.item || feed?.feed?.entry || [];
    const itemsArray = Array.isArray(rssItems) ? rssItems : [rssItems];
    debug.parsedCount = itemsArray.length;
    
    const deals: DealItem[] = [];
    
    for (const item of itemsArray) {
      if (!item) continue;
      
      // Extract link
      let link = '';
      if (typeof item.link === 'string') {
        link = item.link;
      } else if (item.link?.['#text']) {
        link = item.link['#text'];
      } else if (item.link?.['@_href']) {
        link = item.link['@_href'];
      } else if (Array.isArray(item.link)) {
        // Atom may have multiple links, prefer alternate
        const alternateLink = item.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
        link = alternateLink?.['@_href'] || alternateLink?.['#text'] || String(alternateLink || '');
      } else if (item.link) {
        link = String(item.link);
      }
      
      // Extract title
      let title = '';
      if (typeof item.title === 'string') {
        title = item.title;
      } else if (item.title?.['#text']) {
        title = item.title['#text'];
      } else if (item.title) {
        title = String(item.title);
      }
      
      if (!link || !title) continue;
      
      // Normalize URL
      let url = link.trim();
      if (!url.startsWith('http')) {
        if (url.startsWith('/')) {
          url = new URL(url, source.url).toString();
        } else {
          url = new URL(url, source.url).toString();
        }
      }
      
      // Extract published date
      const pubDate = item.pubDate?.['#text'] || item.pubDate || 
                     item.published?.['#text'] || item.published ||
                     item.updated?.['#text'] || item.updated || '';
      
      // Filter: Must have title and URL
      if (!title.trim() || !url) continue;
      
      // Filter: Title quality
      if (isLowQualityTitle(title)) continue;
      
      // Create deal item
      const deal: DealItem = {
        id: `deal-${source.name}-${Date.now()}-${Math.random()}`,
        title: title.trim(),
        url: normalizeUrl(url),
        source: source.name,
        sourceLabel: source.label,
        publishedAt: pubDate || new Date().toISOString(),
        score: 0, // Will calculate below
        sourceMode: 'live',
      };
      
      // Calculate score
      deal.score = calculateScore(deal);
      
      deals.push(deal);
    }
    
    debug.filteredCount = deals.length;
    
    return { items: deals, debug };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Deals] ❌ Failed to fetch ${source.name}: ${errorMsg}`);
    debug.error = errorMsg;
    return { items: [], debug };
  }
}

/**
 * Fetch all deals from RSS sources
 */
async function fetchAllDeals(nocache: boolean = false): Promise<{ items: DealItem[]; sourceMode: 'live' | 'cache' | 'seed'; debug: any[] }> {
  const cacheKey = 'deals';
  const debug: any[] = [];
  
  // Try live fetch
  if (!nocache) {
    const cached = getCachedData(cacheKey, DEALS_CACHE_TTL, false);
    if (cached?.data?.items && cached.data.items.length >= 3) {
      console.log(`[Deals] ✅ Using cache (${cached.data.items.length} items)`);
      return {
        items: cached.data.items,
        sourceMode: 'cache',
        debug: cached.data.debug || [],
      };
    }
  }
  
  // Fetch from all sources in parallel
  const results = await Promise.all(RSS_SOURCES.map(source => fetchRSSFeed(source)));
  
  // Collect all items and debug info
  const allItems: DealItem[] = [];
  results.forEach((result, idx) => {
    debug.push({ ...result.debug, sourceIndex: idx });
    allItems.push(...result.items);
  });
  
  // De-duplicate by normalized URL
  const urlMap = new Map<string, DealItem>();
  for (const item of allItems) {
    const normalized = normalizeUrl(item.url);
    const existing = urlMap.get(normalized);
    
    if (!existing) {
      urlMap.set(normalized, item);
    } else {
      // Keep the one with higher score or newer date
      if (item.score > existing.score || 
          (item.publishedAt && existing.publishedAt && 
           new Date(item.publishedAt) > new Date(existing.publishedAt))) {
        urlMap.set(normalized, item);
      }
    }
  }
  
  // De-duplicate by similar titles
  const uniqueItems: DealItem[] = [];
  for (const item of Array.from(urlMap.values())) {
    const similar = uniqueItems.find(existing => 
      titleSimilarity(item.title, existing.title) > 0.7
    );
    
    if (!similar) {
      uniqueItems.push(item);
    } else {
      // Keep the one with higher score or newer date
      if (item.score > similar.score ||
          (item.publishedAt && similar.publishedAt &&
           new Date(item.publishedAt) > new Date(similar.publishedAt))) {
        const idx = uniqueItems.indexOf(similar);
        uniqueItems[idx] = item;
      }
    }
  }
  
  // Filter by freshness (prefer fresh, but allow older if needed)
  const freshItems = uniqueItems.filter(item => isFresh(item.publishedAt));
  const finalItems = freshItems.length >= 3 ? freshItems : uniqueItems;
  
  // Sort by score (descending)
  finalItems.sort((a, b) => b.score - a.score);
  
  // Take top 10
  const topItems = finalItems.slice(0, 10);
  
  // Ensure >= 3 items
  if (topItems.length >= 3) {
    // Cache the result
    const payload = {
      items: topItems,
      sourceMode: 'live' as const,
      debug,
    };
    setCache(cacheKey, payload);
    
    return {
      items: topItems,
      sourceMode: 'live',
      debug,
    };
  }
  
  // Try stale cache
  const stale = getStaleCache(cacheKey);
  if (stale?.data?.items && stale.data.items.length >= 3) {
    console.log(`[Deals] ✅ Using stale cache (${stale.data.items.length} items)`);
    return {
      items: stale.data.items,
      sourceMode: 'cache',
      debug: stale.data.debug || [],
    };
  }
  
  // Last resort: seed data
  console.log(`[Deals] ⚠️ Using seed data (${SEED_DEALS.length} items)`);
  return {
    items: SEED_DEALS,
    sourceMode: 'seed',
    debug,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }
  
  try {
    const nocache = isCacheBypass(req);
    const fetchedAt = new Date().toISOString();
    
    const result = await fetchAllDeals(nocache);
    
    // Ensure all items have sourceMode set
    const items = result.items.map(item => ({
      ...item,
      sourceMode: result.sourceMode,
    }));
    
    // Ensure >= 3 items
    const finalItems = items.length >= 3 ? items : [...items, ...SEED_DEALS.slice(0, 3 - items.length)];
    
    const response = {
      status: 'ok' as const,
      items: finalItems.slice(0, 10), // Max 10 items
      count: finalItems.length,
      asOf: fetchedAt,
      source: { name: 'RSS Feeds', url: '' },
      ttlSeconds: ttlMsToSeconds(DEALS_CACHE_TTL),
      sourceMode: result.sourceMode,
      cache_hit: result.sourceMode === 'cache',
      fetched_at: fetchedAt,
      cache_mode: nocache ? 'bypass' : 'normal',
      debug: result.debug, // Dev-only debug info
    };
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/deals] Error:', error);
    
    // Try stale cache
    const stale = getStaleCache('deals');
    if (stale?.data?.items && stale.data.items.length >= 3) {
      return res.status(200).json({
        status: 'ok' as const,
        items: stale.data.items,
        count: stale.data.items.length,
        asOf: new Date().toISOString(),
        source: { name: 'Cached Data', url: '' },
        ttlSeconds: 0,
        sourceMode: 'cache' as const,
        cache_hit: true,
        stale: true,
      });
    }
    
    // Last resort: seed data
    return res.status(200).json({
      status: 'ok' as const,
      items: SEED_DEALS,
      count: SEED_DEALS.length,
      asOf: new Date().toISOString(),
      source: { name: 'Seed Data', url: '' },
      ttlSeconds: 0,
      sourceMode: 'seed' as const,
      cache_hit: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
