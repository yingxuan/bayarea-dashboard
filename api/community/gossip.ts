/**
 * Vercel Serverless Function: /api/community/gossip
 * Fetches gossip posts from 1point3acres (forum-98) and TeamBlind
 * 
 * Requirements:
 * - Always return >= 3 items per source
 * - Never show fake placeholder items
 * - Multi-layer fallback: Live → Cache → Seed
 * - Unified ModulePayload<T> structure
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
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
} from '../utils.js';

const GOSSIP_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const WARM_SEED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days for warm seed
const FETCH_TIMEOUT = 10000; // 10 seconds
const WARM_SEED_SIZE = 20; // Keep last 20 real posts as warm seed

// Source URLs
const ONEPOINT3ACRES_URL = 'https://www.1point3acres.com/bbs/forum-98-1.html';
const TEAMBLIND_URL = 'https://www.teamblind.com/trending'; // Public/Trending page

// Warm seed cache keys
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

/**
 * Built-in seed data (only used when warm seed is empty - first deployment)
 * These are real, accessible thread URLs from 1point3acres forum-98
 */
const BUILTIN_SEED_1P3A: GossipItem[] = [
  {
    title: '湾区生活讨论',
    url: 'https://www.1point3acres.com/bbs/forum-98-1.html', // Forum list page as last resort
    meta: { source: '1point3acres' },
  },
];

/**
 * Built-in seed data for TeamBlind (only used when warm seed is empty)
 * These are real, accessible URLs
 */
const BUILTIN_SEED_BLIND: GossipItem[] = [
  {
    title: 'Blind Discussions',
    url: 'https://www.teamblind.com/trending', // Trending page as last resort
    meta: { source: 'blind' },
  },
];

/**
 * Save warm seed (real posts from successful live fetch)
 */
function saveWarmSeed(source: '1point3acres' | 'blind', items: GossipItem[]): void {
  const cacheKey = source === '1point3acres' ? WARM_SEED_KEY_1P3A : WARM_SEED_KEY_BLIND;
  
  // Keep only valid thread/post URLs, deduplicate, limit to WARM_SEED_SIZE
  const validItems = items.filter(item => {
    if (source === '1point3acres') {
      return isValidThreadUrl(item.url);
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
 * Check if decoded text contains common mojibake patterns
 */
function hasMojibake(text: string): boolean {
  // Common UTF-8 mojibake patterns when GBK is decoded as UTF-8
  const mojibakePatterns = [
    /Ã[¤-ÿ]/g,
    /å…/g,
    /ä¸/g,
    /Ã©/g,
    /Ã§/g,
    /Ã­/g,
  ];
  
  if (mojibakePatterns.some(pattern => pattern.test(text))) {
    return true;
  }
  
  // Check for suspicious character combinations
  const suspiciousChars = [
    /[ɣʵһܸߣʽѡ¿]/g,
    /[ЈڡţӭŴ»]/g,
    /[˼·]/g,
    /[뵼ȻůгΪ鶨]/g,
  ];
  
  if (suspiciousChars.some(pattern => pattern.test(text))) {
    return true;
  }
  
  // Additional check: if text has very few Chinese characters but many non-ASCII non-Chinese chars
  const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const nonAsciiNonChineseCount = (text.match(/[^\x00-\x7F\u4e00-\u9fff]/g) || []).length;
  const totalLength = text.length;
  
  if (totalLength > 10) {
    const chineseRatio = chineseCharCount / totalLength;
    const weirdCharRatio = nonAsciiNonChineseCount / totalLength;
    
    if (chineseRatio < 0.05 && weirdCharRatio > 0.2) {
      return true;
    }
  }
  
  return false;
}

/**
 * Custom error types for better error handling
 */
class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedError';
  }
}

class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Check if HTML indicates anti-bot blocking
 * Only return true if ALL conditions are met:
 * 1. HTML contains Cloudflare challenge keywords
 * 2. No thread links found in HTML
 */
function isBlocked(html: string): boolean {
  const htmlLower = html.toLowerCase();
  const blockedKeywords = [
    'cloudflare',
    'just a moment',
    'challenge',
    'checking your browser',
    'enable javascript',
    '<noscript>',
    'cf-challenge',
  ];
  
  const hasBlockedKeywords = blockedKeywords.some(keyword => htmlLower.includes(keyword));
  
  // Only consider blocked if BOTH: has blocked keywords AND no thread links
  if (hasBlockedKeywords) {
    const hasThreads = hasThreadLinks(html);
    return !hasThreads; // Blocked if keywords present but no threads
  }
  
  return false;
}

/**
 * Fetch HTML from 1point3acres forum with proper encoding detection
 * Improved request strategy: Get cookie first, then fetch forum page
 */
async function fetchForumHTML(url: string): Promise<{ html: string; status: number; finalUrl: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    // Step 1: Get cookie from main page
    const mainPageResponse = await fetch('https://www.1point3acres.com/bbs/', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });
    
    // Extract cookies from main page response
    const cookies = mainPageResponse.headers.get('set-cookie') || '';
    const cookieHeader = cookies.split(',').map(c => c.split(';')[0].trim()).join('; ');
    
    // Step 2: Fetch forum page with cookie
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.1point3acres.com/bbs/',
        'Cookie': cookieHeader,
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);
    
    const finalUrl = response.url;
    const status = response.status;
    
    // Check for blocking HTTP status codes
    if (status === 403 || status === 429 || status === 503) {
      // Will check HTML content later to confirm blocking
      console.warn(`[Gossip 1P3A] ⚠️ HTTP ${status} received, will check HTML content`);
    } else if (!response.ok) {
      throw new Error(`HTTP error! status: ${status}`);
    }

    // Fetch raw bytes (DO NOT use response.text())
    const ab = await response.arrayBuffer();
    const buf = Buffer.from(ab);
    
    // Detect charset from HTML meta
    const sniff = buf.slice(0, Math.min(16384, buf.length)).toString('latin1');
    const charsetMatch = sniff.match(/charset\s*=\s*["']?\s*([a-z0-9\-_]+)/i);
    let detectedCharset = charsetMatch ? charsetMatch[1].toLowerCase() : null;
    
    // Normalize charset
    let encoding: string;
    if (detectedCharset && (detectedCharset.includes('gbk') || detectedCharset.includes('gb2312') || detectedCharset.includes('gb18030'))) {
      encoding = 'gb18030';
      console.log(`[Gossip 1P3A] Detected charset: ${detectedCharset} -> using gb18030`);
    } else if (detectedCharset && (detectedCharset.includes('utf-8') || detectedCharset.includes('utf8'))) {
      encoding = 'utf-8';
      console.log(`[Gossip 1P3A] Detected charset: ${detectedCharset} -> using utf-8`);
    } else {
      // Default to gb18030 for Chinese forums if not detected
      encoding = 'gb18030';
      console.log(`[Gossip 1P3A] No charset detected, defaulting to gb18030 (Chinese forum)`);
    }
    
    // Decode using iconv-lite
    let html: string;
    if (encoding === 'utf-8') {
      html = buf.toString('utf-8');
    } else {
      html = iconv.decode(buf, encoding);
    }
    
    // Check for mojibake and retry if needed
    const htmlSample = html.substring(0, Math.min(5000, html.length));
    const hasMojibakeInHtml = hasMojibake(htmlSample);
    
    if (hasMojibakeInHtml && encoding !== 'gb18030') {
      console.warn('[Gossip 1P3A] Mojibake detected in HTML, retrying with gb18030...');
      html = iconv.decode(buf, 'gb18030');
      encoding = 'gb18030';
    }
    
    // Final validation
    if (!html || html.length < 100) {
      throw new Error('Decoded HTML is too short or empty');
    }
    
    console.log(`[Gossip 1P3A] Final encoding: ${encoding}, HTML length: ${html.length}`);
    
    return { html, status, finalUrl };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Check if HTML contains thread links (for 1point3acres)
 */
function hasThreadLinks(html: string): boolean {
  // Check for thread-xxxxxx-1-1.html or forum.php?mod=viewthread&tid=xxxx
  const threadPatterns = [
    /thread-\d+-1-1\.html/i,
    /forum\.php\?mod=viewthread&tid=\d+/i,
    /href=["'][^"']*thread-\d+/i, // Thread links in href attributes
    /href=["'][^"']*viewthread/i,  // Viewthread links
  ];
  
  return threadPatterns.some(pattern => pattern.test(html));
}

/**
 * Validate if URL is a valid thread URL (not a forum list page)
 */
function isValidThreadUrl(url: string): boolean {
  // Must be a thread URL, not a forum list page
  const urlLower = url.toLowerCase();
  
  // Reject forum list pages
  if (urlLower.includes('forum-98') || 
      urlLower.includes('forumdisplay') || 
      urlLower.includes('forum.php?mod=forumdisplay') ||
      urlLower.includes('/guide') ||
      urlLower.includes('/forum/') && !urlLower.includes('thread') && !urlLower.includes('viewthread')) {
    return false;
  }
  
  // Must contain thread identifier
  return urlLower.includes('thread-') || 
         urlLower.includes('viewthread') || 
         urlLower.includes('mod=viewthread');
}

/**
 * Validate if URL is a valid Blind discussion/post URL
 * Less strict: only reject obvious list/aggregation pages
 */
function isValidBlindPostUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  
  // Reject obvious list/aggregation pages
  if (urlLower.includes('/trending') || 
      urlLower.includes('/public') ||
      urlLower.includes('/topics') ||
      urlLower.includes('/categories')) {
    return false;
  }
  
  // Accept if:
  // 1. Contains topic/post/thread path
  // 2. Or is a valid teamblind.com URL with path segments (not just domain)
  // 3. Not just the root domain
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
 * Fetch 1point3acres forum-98 posts
 */
async function fetch1P3A(nocache: boolean = false): Promise<ModulePayload<GossipItem>> {
  const cacheKey = 'gossip-1p3a';
  const fetchedAt = new Date().toISOString();
  const ttlSeconds = ttlMsToSeconds(GOSSIP_CACHE_TTL);
  
  // Try live fetch
  try {
    console.log(`[Gossip 1P3A] 🔍 Fetching live: ${ONEPOINT3ACRES_URL}`);
    
    // Fetch HTML with proper encoding handling (same as leeks.ts)
    const { html, status, finalUrl } = await fetchForumHTML(ONEPOINT3ACRES_URL);
    
    // Debug: Log first 500 chars of HTML
    const htmlPreview = html.substring(0, 500);
    console.log(`[Gossip 1P3A] 📊 HTTP Status: ${status}, Final URL: ${finalUrl}`);
    console.log(`[Gossip 1P3A] 📄 HTML Preview (first 500 chars): ${htmlPreview}`);
    
    // Check for blocking: (HTTP 403/429/503 OR challenge keywords) AND no thread links
    const hasBlockingStatus = status === 403 || status === 429 || status === 503;
    const hasChallengeKeywords = html.toLowerCase().includes('cloudflare') || 
                                 html.toLowerCase().includes('cf-challenge') ||
                                 html.toLowerCase().includes('just a moment') ||
                                 html.toLowerCase().includes('checking your browser');
    const hasThreads = hasThreadLinks(html);
    
    if ((hasBlockingStatus || hasChallengeKeywords) && !hasThreads) {
      // Confirmed blocking
      console.warn(`[Gossip 1P3A] ⚠️ Blocked by anti-bot (status: ${status}, hasChallenge: ${hasChallengeKeywords}, hasThreads: ${hasThreads})`);
      throw new BlockedError(`Blocked by anti-bot: HTTP ${status}`);
    }
    
    // Check if HTML is too short (likely error page)
    if (html.length < 1000) {
      console.warn(`[Gossip 1P3A] ⚠️ HTML too short (${html.length} chars)`);
      throw new ParseError('HTML too short');
    }
    
    // Check if has thread links (if no blocking detected but no threads, it's a parse error)
    if (!hasThreads) {
      console.warn(`[Gossip 1P3A] ⚠️ No thread links found (but not blocked)`);
      throw new ParseError('No thread links found in HTML');
    }
    
    // Parse HTML using the same approach as leeks.ts
    const $ = cheerio.load(html);
    
    const items: GossipItem[] = [];
    const seenUrls = new Set<string>();
    
    // Extract from normalthread_ tbody (exclude sticky posts) - same as leeks.ts
    const postBodies = $('tbody[id^="normalthread_"]').filter((_, element) => {
      const $tbody = $(element);
      const id = $tbody.attr('id') || '';
      const className = $tbody.attr('class') || '';
      
      // Filter out sticky posts
      if (id.includes('stick') || className.includes('stick')) {
        return false;
      }
      
      return true;
    });
    
    console.log(`[Gossip 1P3A] Found ${postBodies.length} normalthread tbody elements (after filtering sticky)`);
    
    // Extract posts using the same logic as leeks.ts
    postBodies.each((_, element) => {
      const $tbody = $(element);
      
      // Find title link (same strategy as leeks.ts)
      let $titleLink = $tbody.find('a.s.xst').first();
      if ($titleLink.length === 0) {
        $titleLink = $tbody.find('a[href*="thread-"]').first();
      }
      
      if ($titleLink.length === 0) return;
      
      const href = $titleLink.attr('href');
      if (!href) return;
      
      // Filter out forumdisplay links
      if (href.includes('forumdisplay') || href.includes('forum.php?mod=forumdisplay')) {
        return;
      }
      
      // Only accept thread URLs (check href pattern first)
      const isThreadHref = (href.includes('thread-') || 
                           href.includes('mod=viewthread') || 
                           href.includes('viewthread')) &&
                           !href.includes('forumdisplay');
      
      if (!isThreadHref) {
        return;
      }
      
      // Normalize URL (same as leeks.ts)
      let url: string;
      try {
        url = new URL(href, 'https://www.1point3acres.com/bbs/').toString();
      } catch {
        if (href.startsWith('/')) {
          url = `https://www.1point3acres.com${href}`;
        } else if (href.startsWith('http')) {
          url = href;
        } else {
          url = `https://www.1point3acres.com/bbs/${href}`;
        }
      }
      
      // Double-check URL validation using the global function
      if (!isValidThreadUrl(url)) {
        return;
      }
      
      // Skip duplicates
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      
      // Extract title with multiple strategies (same as leeks.ts)
      let title = $titleLink.attr('title')?.trim();
      if (!title || title.length === 0) {
        title = $titleLink.text().replace(/\s+/g, ' ').trim();
      }
      if (!title || title.length === 0) {
        title = $titleLink.find('*').text().replace(/\s+/g, ' ').trim();
      }
      
      if (!title || title.length < 3) return;
      
      // Remove common prefixes
      title = title.replace(/^【.*?】\s*/, '').trim();
      title = title.replace(/^\[.*?\]\s*/, '').trim();
      
      // Filter out sticky/announcement prefixes
      const stickyPrefixes = ['[置顶]', '置顶', '[公告]', '公告'];
      if (stickyPrefixes.some(prefix => title.startsWith(prefix))) {
        return;
      }
      
      // Filter out functional/navigation links
      const functionalKeywords = ['查看', '浏览', '去', '看看', '更多', '查看更多', '浏览更多', '去一亩三分地看看'];
      const lowerTitle = title.toLowerCase();
      if (functionalKeywords.some(keyword => lowerTitle.includes(keyword) && title.length < 20)) {
        return;
      }
      
      items.push({
        title,
        url,
        meta: {
          source: '1point3acres',
          publishedAt: fetchedAt,
        },
      });
    });
    
    // Remove duplicates and validate all URLs are thread URLs
    const uniqueItems = Array.from(
      new Map(items.map(item => [item.url, item])).values()
    ).filter(item => {
      // Double-check: ensure all items are valid thread URLs
      if (!isValidThreadUrl(item.url)) {
        console.warn(`[Gossip 1P3A] Filtered invalid thread URL in final list: ${item.url}`);
        return false;
      }
      return true;
    });
    
    console.log(`[Gossip 1P3A] ✅ Fetched ${uniqueItems.length} valid thread items from live`);
    
    // If we have >= 3 items, return live data
    if (uniqueItems.length >= 3) {
      // Save to warm seed for future fallback
      saveWarmSeed('1point3acres', uniqueItems);
      
      // Cache the result
      const payload: ModulePayload<GossipItem> = {
        source: 'live',
        status: 'ok',
        fetchedAt,
        ttlSeconds,
        items: uniqueItems.slice(0, 10), // Limit to 10 items
      };
      
      setCache(cacheKey, payload);
      return payload;
    }
    
    // If < 3 items, try cache
    console.warn(`[Gossip 1P3A] ⚠️ Only ${uniqueItems.length} items (< 3), trying cache...`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isBlockedError = error instanceof BlockedError;
    const isParseError = error instanceof ParseError;
    
    console.error(`[Gossip 1P3A] ❌ Live fetch failed: ${errorMsg} (type: ${isBlockedError ? 'BlockedError' : isParseError ? 'ParseError' : 'Other'})`);
    
    // For BlockedError, directly go to fallback chain
    if (isBlockedError) {
      console.log(`[Gossip 1P3A] 🔄 BlockedError detected, starting fallback: cache → stale cache → warm seed → built-in seed`);
    } else {
      // For ParseError or other errors, also try fallback
      console.log(`[Gossip 1P3A] 🔄 Starting fallback: cache → stale cache → warm seed → built-in seed`);
    }
  }
  
  // Try cache (only if not nocache)
  if (!nocache) {
    const cached = getCachedData(cacheKey, GOSSIP_CACHE_TTL, false);
    if (cached && cached.data && cached.data.items && cached.data.items.length >= 3) {
      console.log(`[Gossip 1P3A] ✅ Using cache (${cached.data.items.length} items)`);
      return {
        ...cached.data,
        source: 'cache' as const,
        status: (cached.data.status === 'ok' ? 'ok' : 'degraded') as 'ok' | 'degraded',
        note: 'Using cached data',
      };
    }
    
    // Try stale cache
    const stale = getStaleCache(cacheKey);
    if (stale && stale.data && stale.data.items && stale.data.items.length >= 3) {
      console.log(`[Gossip 1P3A] ✅ Using stale cache (${stale.data.items.length} items)`);
      return {
        ...stale.data,
        source: 'cache' as const,
        status: 'degraded' as const,
        note: 'Using stale cache',
      };
    }
  }
  
  // Step 3: Try warm seed (real posts from previous successful fetches)
  const warmSeed = getWarmSeed('1point3acres');
  if (warmSeed.length >= 3) {
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
  
  // Step 4: Pad with warm seed if available (even if < 3)
  if (warmSeed.length > 0) {
    console.log(`[Gossip 1P3A] ⚠️ Warm seed has ${warmSeed.length} items (< 3), using all available`);
    return {
      source: 'seed',
      status: 'degraded',
      fetchedAt,
      ttlSeconds: 0,
      note: `warm seed (${warmSeed.length} items)`,
      items: warmSeed,
    };
  }
  
  // Step 5: Built-in seed (only on first deployment, should not happen after warm seed is populated)
  console.log(`[Gossip 1P3A] ⚠️ Using built-in seed (warm seed empty, first deployment?)`);
  console.log(`[Gossip 1P3A] 📋 Returning ${BUILTIN_SEED_1P3A.length} built-in seed items`);
  return {
    source: 'seed',
    status: 'failed',
    fetchedAt,
    ttlSeconds: 0,
    note: 'Live fetch failed, no warm seed available',
    items: BUILTIN_SEED_1P3A,
  };
}

/**
 * Fetch TeamBlind Public/Trending posts
 */
async function fetchBlind(nocache: boolean = false): Promise<ModulePayload<GossipItem>> {
  const cacheKey = 'gossip-blind';
  const fetchedAt = new Date().toISOString();
  const ttlSeconds = ttlMsToSeconds(GOSSIP_CACHE_TTL);
  
  // Try live fetch
  try {
    console.log(`[Gossip Blind] 🔍 Fetching live: ${TEAMBLIND_URL}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    
    const response = await fetch(TEAMBLIND_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[Gossip Blind] ❌ HTTP error: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Check if blocked
    if (isBlocked(html)) {
      console.warn(`[Gossip Blind] ⚠️ Blocked by anti-bot`);
      throw new Error('Blocked by anti-bot');
    }
    
    // Check if HTML is too short
    if (html.length < 1000) {
      console.warn(`[Gossip Blind] ⚠️ HTML too short (${html.length} chars)`);
      throw new Error('HTML too short');
    }
    
    // Parse HTML - TeamBlind structure may vary
    const $ = cheerio.load(html);
    const items: GossipItem[] = [];
    const seenUrls = new Set<string>();
    
    // Try to find post links (common patterns for Blind)
    $('a[href*="/topic/"], a[href*="/post/"], a[href*="/thread/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const title = $el.text().trim();
      
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
        console.log(`[Gossip Blind] Filtered out non-post URL: ${url.substring(0, 100)}`);
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
    
    // Remove duplicates and validate all URLs are post URLs
    const uniqueItems = Array.from(
      new Map(items.map(item => [item.url, item])).values()
    ).filter(item => {
      // Double-check: ensure all items are valid post URLs
      if (!isValidBlindPostUrl(item.url)) {
        console.warn(`[Gossip Blind] Filtered invalid post URL in final list: ${item.url}`);
        return false;
      }
      return true;
    });
    
    console.log(`[Gossip Blind] ✅ Fetched ${uniqueItems.length} valid post items from live`);
    
    // If we have >= 3 items, return live data
    if (uniqueItems.length >= 3) {
      // Save to warm seed for future fallback
      saveWarmSeed('blind', uniqueItems);
      
      // Cache the result
      const payload: ModulePayload<GossipItem> = {
        source: 'live',
        status: 'ok',
        fetchedAt,
        ttlSeconds,
        items: uniqueItems.slice(0, 10), // Limit to 10 items
      };
      
      setCache(cacheKey, payload);
      return payload;
    }
    
    // If < 3 items, try cache
    console.warn(`[Gossip Blind] ⚠️ Only ${uniqueItems.length} items, trying cache...`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Gossip Blind] ❌ Live fetch failed: ${errorMsg}`);
    console.log(`[Gossip Blind] 🔄 Starting fallback: cache → stale cache → warm seed → built-in seed`);
  }
  
  // Try cache (only if not nocache)
  if (!nocache) {
    const cached = getCachedData(cacheKey, GOSSIP_CACHE_TTL, false);
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
    const stale = getStaleCache(cacheKey);
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
  
  // Last resort: built-in seed (only on first deployment)
  console.log(`[Gossip Blind] ⚠️ Using built-in seed (warm seed empty)`);
  return {
    source: 'seed',
    status: 'failed',
    fetchedAt,
    ttlSeconds: 0,
    note: 'Live fetch failed, no warm seed available',
    items: BUILTIN_SEED_BLIND,
  };
}

/**
 * Main handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
          return isValidThreadUrl(item.url);
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
      
      // Last resort: built-in seed
      const builtinSeed = source === '1point3acres' ? BUILTIN_SEED_1P3A : BUILTIN_SEED_BLIND;
      const needed = 3 - validItems.length;
      const padded = [...validItems, ...builtinSeed.slice(0, needed)];
      
      return {
        ...payload,
        items: padded,
        status: payload.status === 'ok' ? 'degraded' : payload.status,
        note: payload.note 
          ? `${payload.note}; padded with ${needed} built-in seed items`
          : `Padded with ${needed} built-in seed items`,
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
      : BUILTIN_SEED_1P3A;
    
    const fallbackBlind = warmSeedBlind.length >= 3
      ? warmSeedBlind.slice(0, 10)
      : BUILTIN_SEED_BLIND;
    
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
