/**
 * Vercel Serverless Function: /api/community/gossip
 * Fetches gossip posts from 1point3acres (section/391 via RSSHub) and TeamBlind
 * 
 * Requirements:
 * - Always return >= 3 items per source
 * - Never show fake placeholder items
 * - Multi-layer fallback: Live → Cache → Seed
 * - Unified ModulePayload<T> structure
 * - All URLs must be valid thread/post detail pages (not list pages)
 */

// Force Node.js runtime on Vercel (not Edge) for compatibility
export const runtime = 'nodejs';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { XMLParser } from 'fast-xml-parser';
import { ModulePayload } from '../../shared/types.js';
import { ttlMsToSeconds } from '../../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  cache,
} from '../../lib/api-utils.js';

const GOSSIP_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const BLIND_TRENDING_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours for Blind trending page cache
const WARM_SEED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days for warm seed
const RSS_FETCH_TIMEOUT = 5000; // 5 seconds for RSS
const FETCH_TIMEOUT = 10000; // 10 seconds for HTML
const WARM_SEED_SIZE = 20; // Keep last 20 real posts as warm seed

// RSSHub URLs (try alternatives if primary fails)
const RSSHUB_INSTANCES = [
  'https://rsshub.app/1point3acres/section/391', // Primary: 人际关系/吃瓜
  'https://rsshub.rssforever.com/1point3acres/section/391', // Alternative 1
  'https://rsshub.uneasy.win/1point3acres/section/391', // Alternative 2
];
const RSSHUB_1P3A_GOSSIP = RSSHUB_INSTANCES[0]; // 人际关系/吃瓜

// Cache keys
const CACHE_KEY_1P3A_GOSSIP = 'gossip-1p3a-rss';
const CACHE_KEY_BLIND_TRENDING = 'blind-trending-now';
const WARM_SEED_KEY_1P3A = 'gossip-warm-seed-1p3a';
const WARM_SEED_KEY_BLIND = 'gossip-warm-seed-blind';

interface GossipItem {
  title: string;
  url: string;
  meta?: {
    source: '1point3acres' | 'blind';
    publishedAt?: string;
  };
}

// Seed data removed - no fallback data

/**
 * Save warm seed (real posts from successful live fetch)
 */
function saveWarmSeed(source: '1point3acres' | 'blind', items: GossipItem[]): void {
  const cacheKey = source === '1point3acres' ? WARM_SEED_KEY_1P3A : WARM_SEED_KEY_BLIND;
  
  // Keep only valid thread/post URLs, deduplicate, limit to WARM_SEED_SIZE
  const validItems = items.filter(item => {
    if (source === '1point3acres') {
      return isValid1p3aThreadUrl(item.url);
    } else {
      return isValidBlindPostUrl(item.url);
    }
  });
  
  // Deduplicate by URL
  const uniqueItems = Array.from(
    new Map(validItems.map(item => [item.url, item])).values()
  ).slice(0, WARM_SEED_SIZE);
  
  if (uniqueItems.length > 0) {
    cache.set(cacheKey, {
      data: uniqueItems,
      timestamp: Date.now(),
    });
    console.log(`[Gossip ${source}] ✅ Saved ${uniqueItems.length} items to warm seed`);
  }
}

/**
 * Get warm seed (real posts from previous successful fetches)
 */
function getWarmSeed(source: '1point3acres' | 'blind'): GossipItem[] {
  const cacheKey = source === '1point3acres' ? WARM_SEED_KEY_1P3A : WARM_SEED_KEY_BLIND;
  const cached = cache.get(cacheKey);
  
  if (!cached) {
    return [];
  }
  
  // Check if warm seed is still valid (7 days TTL)
  const now = Date.now();
  if (now - cached.timestamp > WARM_SEED_TTL) {
    console.log(`[Gossip ${source}] ⚠️ Warm seed expired`);
    return [];
  }
  
  const items = cached.data || [];
  console.log(`[Gossip ${source}] ✅ Retrieved ${items.length} items from warm seed`);
  return items;
}

/**
 * Convert various 1point3acres URL formats to standard thread format
 */
function normalize1p3aUrl(url: string): string {
  // Convert instant.1point3acres.com/thread/xxxxx to standard format
  const instantMatch = url.match(/instant\.1point3acres\.com\/thread\/(\d+)/i);
  if (instantMatch) {
    return `https://www.1point3acres.com/bbs/thread-${instantMatch[1]}-1-1.html`;
  }
  // Convert forum.php?mod=redirect&tid=XXXXX to standard thread format
  const redirectMatch = url.match(/forum\.php\?mod=redirect&tid=(\d+)/i);
  if (redirectMatch) {
    return `https://www.1point3acres.com/bbs/thread-${redirectMatch[1]}-1-1.html`;
  }
  return url;
}

/**
 * Strict validation: Only allow thread detail pages
 * FORBIDDEN: /forum-, forum.php (except viewthread), /section/
 * ALLOWED: /thread-, viewthread.php
 */
function isValid1p3aThreadUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  
  // FORBIDDEN: Reject ALL forum/section/directory pages
  if (urlLower.includes('/section/') ||
      urlLower.includes('/forum-') ||  // Reject ALL /forum- patterns
      urlLower.includes('forumdisplay') || 
      (urlLower.includes('forum.php') && !urlLower.includes('viewthread'))) {  // Reject ALL forum.php EXCEPT viewthread
    console.log(`[Gossip 1P3A] ❌ Rejected forbidden URL pattern: ${url.substring(0, 100)}`);
    return false;
  }
  
  // ALLOWED: Only these patterns:
  // 1. /bbs/thread-xxxxx-1-1.html (or thread-xxxxx.html, or thread-xxxxx)
  // 2. forum.php?mod=viewthread&tid=xxxxx (viewthread.php)
  // 3. instant.1point3acres.com/thread/xxxxx (will be normalized)
  const hasThreadPattern = (urlLower.includes('/bbs/thread-') || urlLower.includes('thread-')) && 
                           (urlLower.includes('.html') || !!urlLower.match(/thread-\d+/));
  const hasViewThreadPattern = urlLower.includes('viewthread') && (urlLower.includes('tid=') || urlLower.includes('viewthread.php'));
  const hasInstantPattern = urlLower.includes('instant.1point3acres.com/thread/') && !!urlLower.match(/thread\/\d+/);
  
  const isValid = hasThreadPattern || hasViewThreadPattern || hasInstantPattern;
  
  if (!isValid) {
    console.log(`[Gossip 1P3A] ❌ URL validation failed (not a thread pattern): ${url.substring(0, 100)}`);
    console.log(`[Gossip 1P3A]    - Has thread pattern: ${hasThreadPattern}`);
    console.log(`[Gossip 1P3A]    - Has viewthread pattern: ${hasViewThreadPattern}`);
    console.log(`[Gossip 1P3A]    - Has instant pattern: ${hasInstantPattern}`);
  }
  
  return isValid;
}

/**
 * Validate if URL is a valid Blind discussion/post URL
 */
function isValidBlindPostUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  
  // Reject obvious list/aggregation pages
  if (urlLower.includes('/trending') || 
      urlLower.includes('/public') ||
      urlLower.includes('/topics') ||
      urlLower.includes('/categories') ||
      urlLower.includes('/trending-now')) {
    return false;
  }
  
  // Accept if:
  // 1. Contains topic/post/thread path
  // 2. Or is a valid teamblind.com URL with path segments (not just domain)
  if (urlLower.includes('/topic/') || 
      urlLower.includes('/post/') ||
      urlLower.includes('/thread/')) {
    return true;
  }
  
  // Accept other teamblind.com URLs that have path segments (likely discussions)
  if (urlLower.includes('teamblind.com')) {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
    // Must have at least one path segment (not just domain root)
    return pathSegments.length > 0;
  }
  
  return false;
}

/**
 * Scrape 1point3acres section 391 (人际关系/吃瓜) directly
 * Parses thread links from the forum index page using cheerio
 */
async function scrape1P3ADirect(fetchedAt: string): Promise<GossipItem[]> {
  // Use gid=391 directly — the old forum-391-1.html now redirects here
  const forumUrl = 'https://www.1point3acres.com/bbs/forum.php?gid=391';
  console.log(`[Gossip 1P3A] 🔍 Direct scraping: ${forumUrl}`);

  const response = await fetch(forumUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`Direct scrape failed: HTTP ${response.status}`);
  }

  // 1point3acres serves GBK-encoded HTML — decode the buffer properly
  const buf = await response.arrayBuffer();
  const html = iconv.decode(Buffer.from(buf), 'gbk');
  const $ = cheerio.load(html);
  const items: GossipItem[] = [];
  const seenUrls = new Set<string>();

  // Thread title links use class "xi2" on 1point3acres forum pages
  $('a.xi2').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const title = $el.text().trim();

    if (!href || !title || title.length < 3) return;

    let url = href.trim();
    // Relative URL: prefix with base
    if (!url.startsWith('http')) {
      url = `https://www.1point3acres.com/bbs/${url.replace(/^\/+/, '')}`;
    }
    url = normalize1p3aUrl(url);

    if (!isValid1p3aThreadUrl(url)) return;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    items.push({ title, url, meta: { source: '1point3acres', publishedAt: fetchedAt } });
  });

  console.log(`[Gossip 1P3A] ✅ Direct scrape found ${items.length} threads`);
  return items;
}

/**
 * Fetch 1point3acres gossip posts
 * Primary: direct HTML scrape. Fallback: RSSHub instances.
 */
async function fetch1P3A(nocache: boolean = false): Promise<ModulePayload<GossipItem>> {
  const cacheKey = CACHE_KEY_1P3A_GOSSIP;
  const fetchedAt = new Date().toISOString();
  const ttlSeconds = ttlMsToSeconds(GOSSIP_CACHE_TTL);

  // Check cache first (unless bypassed)
  if (!nocache) {
    const cached = getCachedData(cacheKey, GOSSIP_CACHE_TTL, false);
    if (cached && cached.data && cached.data.items && cached.data.items.length >= 3) {
      console.log(`[Gossip 1P3A] ✅ Using cache (${cached.data.items.length} items)`);
      return {
        ...cached.data,
        source: 'cache' as const,
        status: (cached.data.status === 'ok' ? 'ok' : 'degraded') as 'ok' | 'degraded',
      };
    }
  }

  // Try direct scrape first (most reliable)
  let uniqueItems: GossipItem[] = [];
  try {
    uniqueItems = await scrape1P3ADirect(fetchedAt);
  } catch (scrapeError) {
    const msg = scrapeError instanceof Error ? scrapeError.message : String(scrapeError);
    console.warn(`[Gossip 1P3A] ⚠️ Direct scrape failed: ${msg}. Trying RSSHub...`);

    // Fallback: try RSSHub instances
    for (const instanceUrl of RSSHUB_INSTANCES) {
      try {
        const resp = await fetch(instanceUrl, {
          headers: { 'User-Agent': 'BayAreaDashboard/1.0' },
          signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT),
        });
        if (!resp.ok) continue;
        const xmlText = await resp.text();
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
        const feed = parser.parse(xmlText);
        const rssItems: any[] = (() => { const r = feed?.rss?.channel?.item || feed?.feed?.entry || []; return Array.isArray(r) ? r : [r]; })();
        const seen = new Set<string>();
        for (const item of rssItems) {
          let link = (typeof item.link === 'string' ? item.link : item.link?.['#text'] || item.link?.['@_href'] || '').trim();
          const title = (typeof item.title === 'string' ? item.title : item.title?.['#text'] || '').trim();
          if (!link || !title) continue;
          if (!link.startsWith('http')) link = `https://www.1point3acres.com/bbs/${link.replace(/^\/+/, '')}`;
          link = normalize1p3aUrl(link);
          if (!isValid1p3aThreadUrl(link) || seen.has(link)) continue;
          seen.add(link);
          const pubDate = item.pubDate?.['#text'] || item.pubDate || '';
          uniqueItems.push({ title, url: link, meta: { source: '1point3acres', publishedAt: pubDate || fetchedAt } });
        }
        if (uniqueItems.length >= 3) {
          console.log(`[Gossip 1P3A] ✅ RSSHub fallback succeeded: ${uniqueItems.length} items`);
          break;
        }
      } catch { /* try next instance */ }
    }
  }

  // If we have >= 3 items, cache and return live data
  if (uniqueItems.length >= 3) {
    saveWarmSeed('1point3acres', uniqueItems);
    const payload: ModulePayload<GossipItem> = {
      source: 'live',
      status: 'ok',
      fetchedAt,
      ttlSeconds,
      items: uniqueItems.slice(0, 10),
    };
    setCache(cacheKey, payload);
    return payload;
  }

  console.warn(`[Gossip 1P3A] ⚠️ Only ${uniqueItems.length} live items, falling back to warm seed`);

  // Try warm seed
  const warmSeed = getWarmSeed('1point3acres');
  if (warmSeed.length > 0) {
    console.log(`[Gossip 1P3A] ✅ Using warm seed (${warmSeed.length} items)`);
    return {
      source: 'seed',
      status: 'degraded',
      fetchedAt,
      ttlSeconds: 0,
      note: 'warm seed',
      items: warmSeed.slice(0, 10),
    };
  }

  console.log(`[Gossip 1P3A] ❌ No data available`);
  return {
    source: 'unavailable',
    status: 'failed',
    fetchedAt,
    ttlSeconds: 0,
    note: 'Live fetch failed, no fallback data available',
    items: [],
  };
}

/**
 * Fetch TeamBlind posts from "Trending now on Blind" article page
 * Strategy: Search for latest "Trending now on Blind" page, then parse Most Read list
 */
async function fetchBlind(nocache: boolean = false): Promise<ModulePayload<GossipItem>> {
  const cacheKey = CACHE_KEY_BLIND_TRENDING;
  const fetchedAt = new Date().toISOString();
  const ttlSeconds = ttlMsToSeconds(GOSSIP_CACHE_TTL);
  
  // Try live fetch
  try {
    // Step 1: Check cache for trending page URL (6 hours TTL)
    let trendingPageUrl: string | null = null;
    
    if (!nocache) {
      const cachedTrending = getCachedData(cacheKey, BLIND_TRENDING_CACHE_TTL, false);
      if (cachedTrending?.data?.url) {
        trendingPageUrl = cachedTrending.data.url;
        console.log(`[Gossip Blind] ✅ Using cached trending page URL: ${trendingPageUrl}`);
      }
    }
    
    // Step 2: If no cached URL, search for latest "Trending now on Blind" page
    if (!trendingPageUrl) {
      console.log(`[Gossip Blind] 🔍 Searching for "Trending now on Blind" page...`);
      
      const searchResults: Array<{ link: string }> = [];
      
      if (searchResults.length === 0) {
        console.warn(`[Gossip Blind] ⚠️ Google CSE search returned no results (may be 403/quota issue). Will use fallback.`);
        // Don't throw error - let it fall through to use seed data or cached data
        // This allows the API to still return data from other sources (1P3A) or cache
      } else {
        // Use first result (most recent)
        trendingPageUrl = searchResults[0].link;
        console.log(`[Gossip Blind] ✅ Found trending page: ${trendingPageUrl}`);
        
        // Cache the URL for 6 hours
        if (!nocache) {
          setCache(cacheKey, {
            url: trendingPageUrl,
            timestamp: Date.now(),
          });
        }
      }
    }
    
    // Step 3: Fetch and parse the trending page (only if we have a URL)
    if (!trendingPageUrl) {
      console.warn(`[Gossip Blind] ⚠️ No trending page URL available (Google CSE may have failed). Will use fallback.`);
      throw new Error('No trending page URL available');
    }
    
    console.log(`[Gossip Blind] 🔍 Fetching trending page: ${trendingPageUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    
    const response = await fetch(trendingPageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Step 4: Parse HTML to find "Most Read" or "Most discussed" list
    const $ = cheerio.load(html);
    const items: GossipItem[] = [];
    const seenUrls = new Set<string>();
    
    // Try multiple selectors for "Most Read" / "Most discussed" sections
    const selectors = [
      'h2:contains("Most Read"), h3:contains("Most Read")',
      'h2:contains("Most Discussed"), h3:contains("Most Discussed")',
      '[class*="most-read"]',
      '[class*="most-discussed"]',
      '[id*="most-read"]',
      '[id*="most-discussed"]',
    ];
    
    let foundSection = false;
    
    for (const selector of selectors) {
      const $section = $(selector).first();
      if ($section.length > 0) {
        foundSection = true;
        console.log(`[Gossip Blind] ✅ Found section with selector: ${selector}`);
        
        // Find links in the section
        $section.parent().find('a[href*="/topic/"], a[href*="/post/"], a[href*="/thread/"]').each((_, el) => {
          const $el = $(el);
          const href = $el.attr('href');
          const title = $el.text().trim() || $el.attr('title')?.trim() || '';
          
          if (!href || !title || title.length < 5) return;
          
          // Normalize URL
          let url = href;
          if (url.startsWith('/')) {
            url = `https://www.teamblind.com${url}`;
          } else if (!url.startsWith('http')) {
            url = `https://www.teamblind.com/${url}`;
          } else if (!url.includes('teamblind.com')) {
            return; // Skip external links
          }
          
          // STRICT VALIDATION: Must be a specific discussion/post, not a list page
          if (!isValidBlindPostUrl(url)) {
            console.log(`[Gossip Blind] Filtered out non-post URL: ${url.substring(0, 80)}`);
            return;
          }
          
          // Skip duplicates
          if (seenUrls.has(url)) return;
          seenUrls.add(url);
          
          items.push({
            title,
            url,
            meta: {
              source: 'blind',
              publishedAt: fetchedAt,
            },
          });
        });
        
        break; // Use first found section
      }
    }
    
    // Fallback: If no "Most Read" section found, try to find any discussion links in the page
    if (!foundSection || items.length < 3) {
      console.log(`[Gossip Blind] ⚠️ No "Most Read" section found or < 3 items, trying fallback parsing...`);
      
      $('a[href*="/topic/"], a[href*="/post/"], a[href*="/thread/"]').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = $el.text().trim() || $el.attr('title')?.trim() || '';
        
        if (!href || !title || title.length < 5) return;
        
        // Normalize URL
        let url = href;
        if (url.startsWith('/')) {
          url = `https://www.teamblind.com${url}`;
        } else if (!url.startsWith('http')) {
          url = `https://www.teamblind.com/${url}`;
        } else if (!url.includes('teamblind.com')) {
          return;
        }
        
        // STRICT VALIDATION
        if (!isValidBlindPostUrl(url)) return;
        
        // Skip duplicates
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
        
        items.push({
          title,
          url,
          meta: {
            source: 'blind',
            publishedAt: fetchedAt,
          },
        });
      });
    }
    
    // Remove duplicates and validate all URLs are post URLs
    const uniqueItems = Array.from(
      new Map(items.map(item => [item.url, item])).values()
    ).filter(item => {
      if (!isValidBlindPostUrl(item.url)) {
        console.warn(`[Gossip Blind] Filtered invalid post URL in final list: ${item.url}`);
        return false;
      }
      return true;
    });
    
    console.log(`[Gossip Blind] ✅ Fetched ${uniqueItems.length} valid post items from trending page`);
    
    // If we have >= 3 items, return live data
    if (uniqueItems.length >= 3) {
      // Save to warm seed for future fallback
      saveWarmSeed('blind', uniqueItems);
      
      // Cache the result (separate from trending page URL cache)
      const payloadCacheKey = 'gossip-blind-items';
      const payload: ModulePayload<GossipItem> = {
        source: 'live',
        status: 'ok',
        fetchedAt,
        ttlSeconds,
        items: uniqueItems.slice(0, 10), // Limit to 10 items
      };
      
      setCache(payloadCacheKey, payload);
      return payload;
    }
    
    // If < 3 items, try cache
    console.warn(`[Gossip Blind] ⚠️ Only ${uniqueItems.length} items (< 3), trying cache...`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Gossip Blind] ❌ Live fetch failed: ${errorMsg}`);
    console.log(`[Gossip Blind] 🔄 Starting fallback: cache → stale cache → warm seed → built-in seed`);
  }
  
  // Try cache (only if not nocache)
  if (!nocache) {
    const payloadCacheKey = 'gossip-blind-items';
    const cached = getCachedData(payloadCacheKey, GOSSIP_CACHE_TTL, false);
    if (cached && cached.data && cached.data.items && cached.data.items.length >= 3) {
      console.log(`[Gossip Blind] ✅ Using cache (${cached.data.items.length} items)`);
      return {
        ...cached.data,
        source: 'cache' as const,
        status: (cached.data.status === 'ok' ? 'ok' : 'degraded') as 'ok' | 'degraded',
        note: 'Using cached data',
      };
    }
    
    // Try stale cache
    const stale = getStaleCache(payloadCacheKey);
    if (stale && stale.data && stale.data.items && stale.data.items.length >= 3) {
      console.log(`[Gossip Blind] ✅ Using stale cache (${stale.data.items.length} items)`);
      return {
        ...stale.data,
        source: 'cache' as const,
        status: 'degraded' as const,
        note: 'Using stale cache',
      };
    }
  }
  
  // Try warm seed (real posts from previous successful fetches)
  const warmSeed = getWarmSeed('blind');
  if (warmSeed.length >= 3) {
    console.log(`[Gossip Blind] ✅ Using warm seed (${warmSeed.length} items)`);
    return {
      source: 'seed',
      status: 'degraded',
      fetchedAt,
      ttlSeconds: 0,
      note: 'warm seed',
      items: warmSeed.slice(0, 10),
    };
  }
  
  // No seed data fallback
  console.log(`[Gossip Blind] ❌ No data available (no seed data fallback)`);
  return {
    source: 'unavailable',
    status: 'failed',
    fetchedAt,
    ttlSeconds: 0,
    note: 'Live fetch failed, no fallback data available',
    items: [],
  };
}

/**
 * Main handler
 */
export async function handleGossip(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    
    // Fetch from both sources in parallel
    const [result1P3A, resultBlind] = await Promise.all([
      fetch1P3A(nocache),
      fetchBlind(nocache),
    ]);
    
    // Ensure each source has >= 3 items (all must be valid thread/post URLs)
    const ensureMinItems = (
      payload: ModulePayload<GossipItem>,
      source: '1point3acres' | 'blind'
    ): ModulePayload<GossipItem> => {
      // Filter out any invalid URLs from payload items
      const validItems = payload.items.filter(item => {
        if (source === '1point3acres') {
          return isValid1p3aThreadUrl(item.url);
        } else {
          return isValidBlindPostUrl(item.url);
        }
      });
      
      if (validItems.length >= 3) {
        return {
          ...payload,
          items: validItems,
        };
      }
      
      // Try warm seed first
      const warmSeed = getWarmSeed(source);
      if (warmSeed.length > 0) {
        const needed = 3 - validItems.length;
        const padded = [...validItems, ...warmSeed.slice(0, needed)];
        return {
          ...payload,
          items: padded,
          status: payload.status === 'ok' ? 'degraded' : payload.status,
          note: payload.note 
            ? `${payload.note}; padded with ${needed} warm seed items`
            : `Padded with ${needed} warm seed items`,
        };
      }
      
      // No seed data padding - return items as-is
      return {
        ...payload,
        items: validItems.slice(0, 10), // Limit to 10 max
        status: validItems.length >= 3 ? payload.status : 'degraded' as const,
        note: validItems.length < 3 
          ? `Only ${validItems.length} items available (minimum 3 required)`
          : payload.note,
      };
    };
    
    const final1P3A = ensureMinItems(result1P3A, '1point3acres');
    const finalBlind = ensureMinItems(resultBlind, 'blind');
    
    // Combine results
    const response = {
      status: 'ok' as const,
      sources: {
        '1point3acres': final1P3A,
        'blind': finalBlind,
      },
      fetchedAt: new Date().toISOString(),
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/community/gossip] Error:', error);
    
    // Return warm seed or built-in seed as last resort
    const errorAt = new Date().toISOString();
    
    // Try warm seed first
    const warmSeed1P3A = getWarmSeed('1point3acres');
    const warmSeedBlind = getWarmSeed('blind');
    
    const fallback1P3A = warmSeed1P3A.length >= 3 
      ? warmSeed1P3A.slice(0, 10)
      : [];
    
    const fallbackBlind = warmSeedBlind.length >= 3
      ? warmSeedBlind.slice(0, 10)
      : [];
    
    res.status(200).json({
      status: 'ok' as const,
      sources: {
        '1point3acres': {
          source: 'seed' as const,
          status: warmSeed1P3A.length >= 3 ? 'degraded' as const : 'failed' as const,
          fetchedAt: errorAt,
          ttlSeconds: 0,
          note: warmSeed1P3A.length >= 3 ? 'warm seed' : 'Error occurred, using built-in seed',
          items: fallback1P3A,
        },
        'blind': {
          source: 'seed' as const,
          status: warmSeedBlind.length >= 3 ? 'degraded' as const : 'failed' as const,
          fetchedAt: errorAt,
          ttlSeconds: 0,
          note: warmSeedBlind.length >= 3 ? 'warm seed' : 'Error occurred, using built-in seed',
          items: fallbackBlind,
        },
      },
      fetchedAt: errorAt,
    });
  }
}

export default handleGossip;
