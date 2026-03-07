/**
 * Vercel Serverless Function: /api/community/gossip
 * Fetches gossip posts from 1point3acres (section/391 via RSSHub) and 微博热搜
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
import { decode as iconvDecode } from 'iconv-lite';
import { XMLParser } from 'fast-xml-parser';
import { ModulePayload } from '../../shared/types.js';
import { ttlMsToSeconds } from '../../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  cache,
} from '../../lib/api-utils.js';

const GOSSIP_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const WEIBO_CACHE_TTL = 60 * 60 * 1000; // 1 hour for Weibo hot search
const WARM_SEED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days for warm seed
const RSS_FETCH_TIMEOUT = 5000; // 5 seconds for RSS
const FETCH_TIMEOUT = 10000; // 10 seconds for HTML
const WARM_SEED_SIZE = 20; // Keep last 20 real posts as warm seed

// RSSHub URLs for 1point3acres (try alternatives if primary fails)
const RSSHUB_INSTANCES = [
  'https://rsshub.app/1point3acres/section/391', // Primary: 人际关系/吃瓜
  'https://rsshub.rssforever.com/1point3acres/section/391', // Alternative 1
  'https://rsshub.uneasy.win/1point3acres/section/391', // Alternative 2
];

// RSSHub URLs for 知乎热榜 (/weibo/search/hot requires Puppeteer and fails on all public instances)
const RSSHUB_WEIBO_INSTANCES = [
  'https://rsshub.rssforever.com/zhihu/hot',
  'https://rsshub.app/zhihu/hot',
  'https://rsshub.uneasy.win/zhihu/hot',
];

// Cache keys
const CACHE_KEY_1P3A_GOSSIP = 'gossip-1p3a-rss';
const CACHE_KEY_WEIBO = 'gossip-zhihu-hot';
const WARM_SEED_KEY_1P3A = 'gossip-warm-seed-1p3a';
const WARM_SEED_KEY_WEIBO = 'gossip-warm-seed-zhihu';

interface GossipItem {
  title: string;
  url: string;
  meta?: {
    source: '1point3acres' | 'weibo';
    publishedAt?: string;
  };
}

// Seed data removed - no fallback data

/**
 * Save warm seed (real posts from successful live fetch)
 */
function saveWarmSeed(source: '1point3acres' | 'weibo', items: GossipItem[]): void {
  const cacheKey = source === '1point3acres' ? WARM_SEED_KEY_1P3A : WARM_SEED_KEY_WEIBO;

  // Keep only valid thread/post URLs, deduplicate, limit to WARM_SEED_SIZE
  const validItems = items.filter(item => {
    if (source === '1point3acres') {
      return isValid1p3aThreadUrl(item.url);
    } else {
      return item.url.startsWith('http');
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
function getWarmSeed(source: '1point3acres' | 'weibo'): GossipItem[] {
  const cacheKey = source === '1point3acres' ? WARM_SEED_KEY_1P3A : WARM_SEED_KEY_WEIBO;
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
  const html = iconvDecode(Buffer.from(buf), 'gbk');
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
 * Fetch 微博热搜 via RSSHub
 */
async function fetchWeibo(nocache: boolean = false): Promise<ModulePayload<GossipItem>> {
  const cacheKey = CACHE_KEY_WEIBO;
  const fetchedAt = new Date().toISOString();
  const ttlSeconds = ttlMsToSeconds(WEIBO_CACHE_TTL);

  // Check cache first
  if (!nocache) {
    const cached = getCachedData(cacheKey, WEIBO_CACHE_TTL, false);
    if (cached && cached.data && cached.data.items && cached.data.items.length >= 3) {
      console.log(`[Gossip Weibo] ✅ Using cache (${cached.data.items.length} items)`);
      return {
        ...cached.data,
        source: 'cache' as const,
        status: (cached.data.status === 'ok' ? 'ok' : 'degraded') as 'ok' | 'degraded',
      };
    }
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
  let uniqueItems: GossipItem[] = [];

  for (const instanceUrl of RSSHUB_WEIBO_INSTANCES) {
    try {
      const resp = await fetch(instanceUrl, {
        headers: { 'User-Agent': 'BayAreaDashboard/1.0' },
        signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT),
      });
      if (!resp.ok) continue;
      const xmlText = await resp.text();
      const feed = parser.parse(xmlText);
      const rssItems: any[] = (() => {
        const r = feed?.rss?.channel?.item || feed?.feed?.entry || [];
        return Array.isArray(r) ? r : [r];
      })();
      const seen = new Set<string>();
      for (const item of rssItems) {
        let link = (typeof item.link === 'string' ? item.link : item.link?.['#text'] || item.link?.['@_href'] || '').trim();
        const title = (typeof item.title === 'string' ? item.title : item.title?.['#text'] || '').trim();
        if (!link || !title) continue;
        if (!link.startsWith('http')) continue;
        if (seen.has(link)) continue;
        seen.add(link);
        const pubDate = item.pubDate?.['#text'] || item.pubDate || '';
        uniqueItems.push({ title, url: link, meta: { source: 'weibo', publishedAt: pubDate || fetchedAt } });
      }
      if (uniqueItems.length >= 3) {
        console.log(`[Gossip Weibo] ✅ RSSHub succeeded: ${uniqueItems.length} items from ${instanceUrl}`);
        break;
      }
    } catch { /* try next instance */ }
  }

  if (uniqueItems.length >= 3) {
    saveWarmSeed('weibo', uniqueItems);
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

  console.warn(`[Gossip Weibo] ⚠️ Only ${uniqueItems.length} live items, falling back to warm seed`);

  const warmSeed = getWarmSeed('weibo');
  if (warmSeed.length > 0) {
    return {
      source: 'seed',
      status: 'degraded',
      fetchedAt,
      ttlSeconds: 0,
      note: 'warm seed',
      items: warmSeed.slice(0, 10),
    };
  }

  console.log(`[Gossip Weibo] ❌ No data available`);
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
    const [result1P3A, resultWeibo] = await Promise.all([
      fetch1P3A(nocache),
      fetchWeibo(nocache),
    ]);

    // Ensure each source has >= 3 items
    const ensureMinItems = (
      payload: ModulePayload<GossipItem>,
      source: '1point3acres' | 'weibo'
    ): ModulePayload<GossipItem> => {
      const validItems = payload.items.filter(item =>
        source === '1point3acres' ? isValid1p3aThreadUrl(item.url) : item.url.startsWith('http')
      );

      if (validItems.length >= 3) {
        return { ...payload, items: validItems };
      }

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

      return {
        ...payload,
        items: validItems.slice(0, 10),
        status: validItems.length >= 3 ? payload.status : 'degraded' as const,
        note: validItems.length < 3
          ? `Only ${validItems.length} items available (minimum 3 required)`
          : payload.note,
      };
    };

    const final1P3A = ensureMinItems(result1P3A, '1point3acres');
    const finalWeibo = ensureMinItems(resultWeibo, 'weibo');

    // Combine results
    const response = {
      status: 'ok' as const,
      sources: {
        '1point3acres': final1P3A,
        'weibo': finalWeibo,
      },
      fetchedAt: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/community/gossip] Error:', error);

    const errorAt = new Date().toISOString();
    const warmSeed1P3A = getWarmSeed('1point3acres');
    const warmSeedWeibo = getWarmSeed('weibo');

    res.status(200).json({
      status: 'ok' as const,
      sources: {
        '1point3acres': {
          source: 'seed' as const,
          status: warmSeed1P3A.length >= 3 ? 'degraded' as const : 'failed' as const,
          fetchedAt: errorAt,
          ttlSeconds: 0,
          note: warmSeed1P3A.length >= 3 ? 'warm seed' : 'Error occurred, no fallback data',
          items: warmSeed1P3A.length >= 3 ? warmSeed1P3A.slice(0, 10) : [],
        },
        'weibo': {
          source: 'seed' as const,
          status: warmSeedWeibo.length >= 3 ? 'degraded' as const : 'failed' as const,
          fetchedAt: errorAt,
          ttlSeconds: 0,
          note: warmSeedWeibo.length >= 3 ? 'warm seed' : 'Error occurred, no fallback data',
          items: warmSeedWeibo.length >= 3 ? warmSeedWeibo.slice(0, 10) : [],
        },
      },
      fetchedAt: errorAt,
    });
  }
}

export default handleGossip;
