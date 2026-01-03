/**
 * Vercel Serverless Function: /api/community/leeks
 * Fetches latest discussions from 1point3acres
 * 
 * Requirements:
 * - Return 5 items from 1point3acres
 * - Never show "暂无内容"
 * - Cache TTL: 1point3acres 10 minutes
 * - On failure return "unavailable" status with reason
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { CACHE_TTL, ttlMsToSeconds } from '../../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  normalizeCachedResponse,
  normalizeStaleResponse,
  cache,
} from '../utils.js';

const ONEPOINT3ACRES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes - for non-empty results only
const LAST_NON_EMPTY_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours - for last_non_empty cache
const FORUM_URL = 'https://www.1point3acres.com/bbs/forum.php?mod=forumdisplay&fid=291&filter=author&orderby=dateline';
const FETCH_TIMEOUT = 10000; // 10 seconds (increased for stability)

// Unified community item interface
interface CommunityItem {
  source: '1point3acres';
  sourceLabel: string; // "一亩三分地"
  title: string;
  url: string;
  publishedAt?: string; // ISO date string
}

// Legacy interface for backward compatibility (will be converted to CommunityItem)
interface LeekItem {
  title: string;
  url: string;
}

// Seed data as last resort fallback
const SEED_DATA: CommunityItem[] = [
  {
    source: '1point3acres',
    sourceLabel: '一亩三分地',
    title: '去一亩三分地看看最新讨论',
    url: FORUM_URL,
  },
  {
    source: '1point3acres',
    sourceLabel: '一亩三分地',
    title: '查看投资理财板块',
    url: FORUM_URL,
  },
];

/**
 * Check if decoded text contains common mojibake patterns
 * Detects patterns like: "ɣʵһ仰ܸߣʽѡ¿", "Јڡţ", "뵼ȻůгΪ", etc.
 */
function hasMojibake(text: string): boolean {
  // Common UTF-8 mojibake patterns when GBK is decoded as UTF-8:
  // "Ã¤Â¸Â­" (中), "å…" (等), "ä¸" (中), "Ã©" (é), etc.
  const mojibakePatterns = [
    /Ã[¤-ÿ]/g,           // UTF-8 mojibake pattern
    /å…/g,               // Common pattern
    /ä¸/g,               // Common pattern
    /Ã©/g,               // Common pattern
    /Ã§/g,               // Common pattern
    /Ã­/g,               // Common pattern
  ];
  
  if (mojibakePatterns.some(pattern => pattern.test(text))) {
    return true;
  }
  
  // Check for suspicious character combinations that indicate GBK misread as UTF-8
  // Patterns from user's actual garbled titles:
  // "ɣʵһ仰ܸߣʽѡ¿", "Јڡţ", "뵼ȻůгΪ", "˼·"
  const suspiciousChars = [
    /[ɣʵһܸߣʽѡ¿]/g,      // From "ɣʵһ仰ܸߣʽѡ¿"
    /[ЈڡţӭŴ»]/g,         // From "Јڡţ vs DRc1»ӭwŴ"
    /[˼·]/g,              // From "KWEB ˼·"
    /[뵼ȻůгΪ鶨]/g,        // From "뵼ȻůгΪ 2026 鶨»"
  ];
  
  if (suspiciousChars.some(pattern => pattern.test(text))) {
    return true;
  }
  
  // Additional check: if text has very few Chinese characters but many non-ASCII non-Chinese chars
  // This indicates encoding issues
  const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const nonAsciiNonChineseCount = (text.match(/[^\x00-\x7F\u4e00-\u9fff]/g) || []).length;
  const totalLength = text.length;
  
  // If less than 5% Chinese chars but more than 20% non-ASCII non-Chinese chars, likely mojibake
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
 * Fetch HTML from 1point3acres forum
 * Detect charset from HTML meta and decode correctly
 */
async function fetchForumHTML(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(FORUM_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.1point3acres.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 1) Fetch raw bytes (MANDATORY)
    // DO NOT use response.text()
    const ab = await response.arrayBuffer();
    const buf = Buffer.from(ab);
    
    // 2) Detect charset from bytes (MANDATORY)
    // Read the first ~16KB as latin1 (ONLY for sniffing)
    const sniff = buf.slice(0, Math.min(16384, buf.length)).toString('latin1');
    
    // Find charset in HTML meta: /charset\s*=\s*["']?\s*([a-z0-9\-_]+)/i
    const charsetMatch = sniff.match(/charset\s*=\s*["']?\s*([a-z0-9\-_]+)/i);
    let detectedCharset = charsetMatch ? charsetMatch[1].toLowerCase() : null;
    
    // Normalize charset
    let encoding: string;
    if (detectedCharset && (detectedCharset.includes('gbk') || detectedCharset.includes('gb2312') || detectedCharset.includes('gb18030'))) {
      encoding = 'gb18030';
      console.log(`[1point3acres] Detected charset: ${detectedCharset} -> using gb18030`);
    } else if (detectedCharset && (detectedCharset.includes('utf-8') || detectedCharset.includes('utf8'))) {
      encoding = 'utf-8';
      console.log(`[1point3acres] Detected charset: ${detectedCharset} -> using utf-8`);
    } else {
      // Default to gb18030 for Chinese forums if not detected
      encoding = 'gb18030';
      console.log(`[1point3acres] No charset detected, defaulting to gb18030 (Chinese forum)`);
    }
    
    // 3) Decode ONCE using iconv-lite
    // NEVER call res.text()
    let html: string;
    if (encoding === 'utf-8') {
      html = buf.toString('utf-8');
    } else {
      html = iconv.decode(buf, encoding);
    }
    
    // 4) Add a hard proof log (dev-only) and auto-retry if mojibake detected
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[1point3acres] Detected charset: ${detectedCharset || 'none'}, using encoding: ${encoding}`);
      console.log(`[1point3acres] First 300 chars of HTML: ${html.substring(0, 300)}`);
    }
    
    // Check if decoded HTML contains mojibake patterns (like ɣܸЈŴ etc)
    // Sample a portion to check
    const htmlSample = html.substring(0, Math.min(5000, html.length));
    const hasMojibakeInHtml = hasMojibake(htmlSample);
    
    if (hasMojibakeInHtml && encoding !== 'gb18030') {
      console.warn('[1point3acres] Mojibake detected in HTML, retrying with gb18030...');
      html = iconv.decode(buf, 'gb18030');
      encoding = 'gb18030';
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[1point3acres] Retried with gb18030, first 300 chars: ${html.substring(0, 300)}`);
      }
    }
    
    // Final validation: check if we have valid HTML structure
    if (!html || html.length < 100) {
      throw new Error('Decoded HTML is too short or empty');
    }
    
    console.log(`[1point3acres] Final encoding: ${encoding}, HTML length: ${html.length}`);
    
    return html;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Parse HTML and extract forum posts
 * Robust parsing with filtering for sticky posts, navigation links, etc.
 */
function parseForumPosts(html: string): CommunityItem[] {
  const $ = cheerio.load(html);
  
  const items: CommunityItem[] = [];
  const seenTitles = new Set<string>();
  const baseUrl = 'https://www.1point3acres.com/bbs/';
  
  let foundNormalthreadCount = 0;
  let extractedCount = 0;
  let filteredCount = 0;

  // Step 1: Only extract from normalthread_ tbody (exclude sticky posts)
  const postBodies = $('tbody[id^="normalthread_"]').filter((_, element) => {
    const $tbody = $(element);
    const id = $tbody.attr('id') || '';
    const className = $tbody.attr('class') || '';
    
    // Filter out sticky posts
    if (id.includes('stick') || className.includes('stick')) {
      filteredCount++;
      return false;
    }
    
    return true;
  });
  
  foundNormalthreadCount = postBodies.length;
  console.log(`[Leek Community] Found ${foundNormalthreadCount} normalthread tbody elements (after filtering sticky)`);

  /**
   * Extract post from a tbody element
   */
  function extractPostFromTbody($tbody: cheerio.Cheerio<any>): CommunityItem | null {
    // D) Extract titles robustly (MANDATORY)
    // 1) Find title anchor:
    //    - const a = $(tbody).find("a.s.xst").first();
    //    - if empty, fallback: $(tbody).find('a[href*="thread-"]').first()
    let $titleLink = $tbody.find('a.s.xst').first();
    
    if ($titleLink.length === 0) {
      $titleLink = $tbody.find('a[href*="thread-"]').first();
    }
    
    if ($titleLink.length === 0) {
      // Debug: log why no link found
      const allLinks = $tbody.find('a').length;
      if (allLinks > 0) {
        console.log(`[1point3acres] No title link found, but found ${allLinks} total links in tbody`);
      }
      filteredCount++;
      return null;
    }
    
    const href = $titleLink.attr('href');
    if (!href) {
      console.log(`[1point3acres] Title link found but no href attribute`);
      filteredCount++;
      return null;
    }
    
    // Filter out forumdisplay links
    if (href.includes('forumdisplay') || href.includes('forum.php?mod=forumdisplay')) {
      filteredCount++;
      return null;
    }
    
    // STRICT URL validation: must contain thread- or mod=viewthread or viewthread
    // Do NOT accept forumdisplay or other non-thread URLs
    const isValidThreadUrl = (href.includes('thread-') || 
                             href.includes('mod=viewthread') || 
                             href.includes('viewthread')) &&
                             !href.includes('forumdisplay');
    
    if (!isValidThreadUrl) {
      filteredCount++;
      console.log(`[1point3acres] Filtered out invalid URL (doesn't match thread pattern): ${href.substring(0, 100)}`);
      return null;
    }
    
    // E) Absolute URL (MANDATORY)
    // href like "thread-1159907-1-1.html"
    // url = new URL(href, "https://www.1point3acres.com/bbs/").toString()
    let url: string;
    try {
      url = new URL(href, 'https://www.1point3acres.com/bbs/').toString();
    } catch (error) {
      // Fallback to manual construction
      if (href.startsWith('/')) {
        url = `https://www.1point3acres.com${href}`;
      } else if (href.startsWith('http')) {
        url = href;
      } else {
        url = `https://www.1point3acres.com/bbs/${href}`;
      }
    }
    
    // Extract title with multiple strategies (stop at first non-empty)
    let title: string | undefined;
    let extractionStrategy = '';
    
    // Strategy 1: title attribute
    title = $titleLink.attr('title')?.trim();
    if (title && title.length > 0) {
      extractionStrategy = 'title-attr';
    }
    
    // Strategy 2: text() method
    if (!title || title.length === 0) {
      title = $titleLink.text().replace(/\s+/g, ' ').trim();
      if (title && title.length > 0) {
        extractionStrategy = 'text';
      }
    }
    
    // Strategy 3: find all child elements and get their text
    if (!title || title.length === 0) {
      title = $titleLink.find('*').text().replace(/\s+/g, ' ').trim();
      if (title && title.length > 0) {
        extractionStrategy = 'children-text';
      }
    }
    
    // Strategy 4: direct text nodes (contents with nodeType 3)
    if (!title || title.length === 0) {
      const textNodes: string[] = [];
      $titleLink.contents().each((_: number, node: any) => {
        // Cheerio node type: 'text' for text nodes
        if (node.type === 'text' || (node as any).nodeType === 3) {
          const text = (node as any).data || (node as any).nodeValue;
          if (text && typeof text === 'string') {
            const trimmed = text.trim();
            if (trimmed) {
              textNodes.push(trimmed);
            }
          }
        }
      });
      title = textNodes.join(' ').replace(/\s+/g, ' ').trim();
      if (title && title.length > 0) {
        extractionStrategy = 'direct-text-nodes';
      }
    }
    
    // Skip if title is still empty (don't count as filtered)
    if (!title || title.length === 0) {
      return null; // Skip, don't increment filteredCount
    }
    
    // Log which strategy succeeded (for debugging)
    if (extractionStrategy && process.env.NODE_ENV !== 'production') {
      console.log(`[1point3acres] Title extracted using strategy: ${extractionStrategy}, title: ${title.substring(0, 50)}`);
    }
    
    
    // Remove common prefixes (UI will add 【一亩三分地】)
    title = title.replace(/^【.*?】\s*/, '').trim();
    title = title.replace(/^\[.*?\]\s*/, '').trim();
    
    // Filter out sticky/announcement prefixes
    const stickyPrefixes = ['[置顶]', '置顶', '[公告]', '公告'];
    for (const prefix of stickyPrefixes) {
      if (title.startsWith(prefix)) {
        filteredCount++;
        return null;
      }
    }
    
    // Check for replacement characters, but be very lenient
    // Only reject if title is completely empty after cleaning
    const hasReplacementChars = title.includes('') || title.match(/[\uFFFD]/);
    if (hasReplacementChars) {
      // Remove replacement chars and check if enough valid content remains
      const cleanedTitle = title.replace(/[\uFFFD]/g, '').trim();
      // Only reject if cleaned title is too short (less than 2 chars)
      if (cleanedTitle.length < 2) {
        filteredCount++;
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[1point3acres] Filtered out title with too many replacement chars: ${title.substring(0, 50)}`);
        }
        return null;
      }
      // Use cleaned title
      title = cleanedTitle;
    }
    
    // REMOVED: "no readable content" check - it was too strict and filtered out valid Chinese titles
    
    // Filter out functional/navigation links
    const functionalKeywords = ['查看', '浏览', '去', '看看', '更多', '查看更多', '浏览更多', '去一亩三分地看看'];
    const lowerTitle = title.toLowerCase();
    const hasFunctionalKeyword = functionalKeywords.some(keyword => 
      title.includes(keyword) || lowerTitle.includes(keyword.toLowerCase())
    );
    
    if (hasFunctionalKeyword) {
      filteredCount++;
      return null;
    }
    
    // Filter very short titles (likely operation links)
    // But be lenient - allow titles with at least 2 characters (Chinese titles can be short)
    if (title.length < 2) {
      filteredCount++;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[1point3acres] Filtered out very short title: "${title}"`);
      }
      return null;
    }
    
    // Skip duplicates
    const normalizedTitle = title.toLowerCase().trim();
    if (seenTitles.has(normalizedTitle)) {
      filteredCount++;
      return null;
    }
    seenTitles.add(normalizedTitle);
    
    extractedCount++;
    
    // Final validation: ensure title is not empty after all processing
    if (!title || title.trim().length === 0) {
      filteredCount++;
      return null;
    }
    
    return {
      source: '1point3acres' as const,
      sourceLabel: '一亩三分地',
      title: title.trim(), // Don't add prefix here, UI will add [sourceLabel]
      url,
      publishedAt: undefined, // Forum posts don't have publishedAt in the list
    };
  }

  // Process post bodies - fetch TOP 5 newest only
  let processedCount = 0;
  let firstFailureLogged = false;
  
  postBodies.each((_, element) => {
    if (items.length >= 5) {
      return false; // Stop at 5
    }
    
    processedCount++;
    const $tbody = $(element);
    const post = extractPostFromTbody($tbody);
    
    if (post) {
      items.push(post);
      console.log(`[1point3acres] Added item ${items.length}: ${post.title.substring(0, 50)}`);
      
      // 4) Add a hard proof log (dev-only)
      if (items.length === 1 && process.env.NODE_ENV !== 'production') {
        const firstTitle = post.title;
        const hasMojibakeInTitle = hasMojibake(firstTitle);
        
        console.log(`[1point3acres] First extracted title: "${firstTitle}"`);
        console.log(`[1point3acres] First title has mojibake: ${hasMojibakeInTitle}`);
        
        // If first title contains mojibake patterns, throw an error so we don't silently ship garbage
        if (hasMojibakeInTitle) {
          const errorMsg = `[1point3acres] CRITICAL: First extracted title contains mojibake patterns! Title: "${firstTitle}"`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
      }
    } else if (!firstFailureLogged) {
      // Debug first failure: log why it was filtered
      firstFailureLogged = true;
      let $titleLink = $tbody.find('a.s.xst').first();
      if ($titleLink.length === 0) {
        $titleLink = $tbody.find('a[href*="thread-"][class*="xst"]').first();
      }
      if ($titleLink.length === 0) {
        $titleLink = $tbody.find('a[href*="viewthread"]').first();
      }
      if ($titleLink.length > 0) {
        const href = $titleLink.attr('href') || 'no href';
        let testTitle = $titleLink.attr('title')?.trim() || $titleLink.text().replace(/\s+/g, ' ').trim();
        
        // Test which filter would reject it
        if (testTitle) {
          const originalTitle = testTitle;
          testTitle = testTitle.replace(/^【.*?】\s*/, '').replace(/^\[.*?\]\s*/, '').trim();
          const hasReplacement = testTitle.includes('') || testTitle.match(/[\uFFFD]/);
          const hasStickyPrefix = ['[置顶]', '置顶', '[公告]', '公告'].some(p => testTitle.startsWith(p));
          const hasFunctionalKeyword = ['查看', '浏览', '去', '看看', '更多'].some(k => testTitle.includes(k));
          const isTooShort = testTitle.length < 2;
          
          console.log(`[1point3acres] Failed to extract post #${processedCount}, href: ${href.substring(0, 80)}`);
          console.log(`[1point3acres] Original title: ${originalTitle.substring(0, 100)}`);
          console.log(`[1point3acres] Processed title: ${testTitle.substring(0, 100)}`);
          console.log(`[1point3acres] Title length: ${testTitle.length}`);
          console.log(`[1point3acres] Filter reasons: replacement=${hasReplacement}, sticky=${hasStickyPrefix}, functional=${hasFunctionalKeyword}, short=${isTooShort}`);
          
          // Also try to extract using the same strategies as in the function
          let extractedTitle = $titleLink.attr('title')?.trim();
          if (!extractedTitle) extractedTitle = $titleLink.text().replace(/\s+/g, ' ').trim();
          console.log(`[1point3acres] Extracted title (for comparison): ${extractedTitle?.substring(0, 100)}`);
        }
      }
    }
  });
  
  console.log(`[1point3acres] Processed ${processedCount} tbody elements, extracted ${items.length} items`);
  
  // Debug logging (only in dev)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[1point3acres] Debug stats:`, {
      foundNormalthreadCount,
      extractedCount,
      filteredCount,
      finalItemsCount: items.length,
    });
  }
  
  console.log(`[1point3acres] Total items found: ${items.length}`);
  
  // If 0 items, this is a failure (not success)
  if (items.length === 0) {
    console.warn('[1point3acres] No posts extracted - this is a failure');
  }
  
  return items.slice(0, 5); // Return TOP 5 only
}


/**
 * Get last non-empty cache for a source (6h TTL)
 */
function getLastNonEmptyCache(sourceKey: string): CommunityItem[] | null {
  const cacheKey = `leek-community-${sourceKey}-last-non-empty`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < LAST_NON_EMPTY_CACHE_TTL) {
    const items = cached.data.items || [];
    if (Array.isArray(items) && items.length > 0) {
      console.log(`[Leek Community] Using last non-empty cache for ${sourceKey} (${items.length} items)`);
      return items;
    }
  }
  
  return null;
}

/**
 * Save last non-empty cache for a source (6h TTL)
 */
function saveLastNonEmptyCache(sourceKey: string, items: CommunityItem[]): void {
  if (items.length > 0) {
    const cacheKey = `leek-community-${sourceKey}-last-non-empty`;
    cache.set(cacheKey, {
      data: { items },
      timestamp: Date.now(),
    });
    console.log(`[Leek Community] Saved last non-empty cache for ${sourceKey} (${items.length} items)`);
  }
}

/**
 * Fetch 1point3acres posts (TOP 5 newest)
 */
async function fetch1point3acresPosts(): Promise<{ items: CommunityItem[]; status: 'ok' | 'unavailable'; reason?: string }> {
  try {
    console.log('[1point3acres] Fetching posts...');
    const html = await fetchForumHTML();
    const items = parseForumPosts(html);
    
    // Return TOP 5 only
    const top5 = items.slice(0, 5);
    
    // H) No empty caching - Do NOT cache results if extractedCount == 0
    if (top5.length === 0) {
      console.warn('[1point3acres] No posts found, trying last_non_empty cache...');
      const lastNonEmpty = getLastNonEmptyCache('1point3acres');
      if (lastNonEmpty) {
        console.log(`[1point3acres] Using last non-empty cache (${lastNonEmpty.length} items)`);
        return {
          items: lastNonEmpty.slice(0, 5),
          status: 'ok',
        };
      }
      
      return {
        items: [],
        status: 'unavailable',
        reason: 'No posts found and no last_non_empty cache',
      };
    }
    
    // Save to last_non_empty cache (only if we have items)
    saveLastNonEmptyCache('1point3acres', top5);
    
    return {
      items: top5,
      status: 'ok',
    };
  } catch (error) {
    console.error('[1point3acres] Error fetching posts:', error);
    
    // If error is about mojibake, DO NOT use last_non_empty cache (it might also have mojibake)
    // Only use last_non_empty cache for network/parsing errors, not encoding errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isMojibakeError = errorMessage.includes('mojibake') || errorMessage.includes('CRITICAL');
    
    if (isMojibakeError) {
      console.error('[1point3acres] Mojibake detected - NOT using last_non_empty cache to avoid propagating garbage');
      return {
        items: [],
        status: 'unavailable',
        reason: errorMessage,
      };
    }
    
    // Try last_non_empty cache on other errors (network, parsing, etc.)
    const lastNonEmpty = getLastNonEmptyCache('1point3acres');
    if (lastNonEmpty) {
      console.log(`[1point3acres] Fetch failed (non-mojibake error), using last non-empty cache (${lastNonEmpty.length} items)`);
      return {
        items: lastNonEmpty.slice(0, 5),
        status: 'ok',
      };
    }
    
    return {
      items: [],
      status: 'unavailable',
      reason: errorMessage,
    };
  }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey1point3acres = 'leek-community-1point3acres';

    // Check cache
    const cached1point3acres = getCachedData(cacheKey1point3acres, ONEPOINT3ACRES_CACHE_TTL, nocache);

    if (cached1point3acres) {
      const data1point3acres = cached1point3acres.data;
      
      return res.status(200).json({
        status: 'ok' as const,
        sources: {
          '1point3acres': data1point3acres,
        },
        items: data1point3acres.items || [],
        count: data1point3acres.items?.length || 0,
        cache_hit: true,
        cache_mode: 'normal',
      });
    }

    // Log cache bypass
    if (nocache) {
      console.log('[API /api/community/leeks] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data (cached1point3acres is falsy here since we returned early if it existed)
    const result1point3acres = fetch1point3acresPosts();

    const result = await result1point3acres;
    const fetchedAtISO = new Date().toISOString();

    // Prepare response for 1point3acres
    const response1point3acres: any = {
      status: result.status,
      items: result.items.slice(0, 5),
      count: Math.min(result.items.length, 5),
      asOf: fetchedAtISO,
      source: { name: '1point3acres', url: FORUM_URL },
      ttlSeconds: ttlMsToSeconds(ONEPOINT3ACRES_CACHE_TTL),
      reason: result.status === 'unavailable' ? result.reason : undefined,
    };

    // 7) Cache policy: Never cache extractedCount == 0
    // If extracted titles look mojibake, treat as failure and do NOT cache
    const hasMojibakeInItems = result.items.some(item => hasMojibake(item.title));
    
    if (result.status === 'ok' && result.items.length > 0 && !hasMojibakeInItems) {
      setCache(cacheKey1point3acres, response1point3acres);
      saveLastNonEmptyCache('1point3acres', result.items);
    } else {
      if (hasMojibakeInItems) {
        console.warn(`[API /api/community/leeks] Not caching 1point3acres - items contain mojibake`);
      } else {
        console.warn(`[API /api/community/leeks] Not caching 1point3acres (status: ${result.status}, items: ${result.items.length})`);
      }
    }

    const response: any = {
      status: 'ok' as const,
      sources: {
        '1point3acres': response1point3acres,
      },
      items: response1point3acres.items,
      count: response1point3acres.items.length,
      asOf: fetchedAtISO,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      cache_mode: nocache ? 'bypass' : 'normal',
    };

    // 6) Response encoding: Ensure API uses res.json(...) and sets Content-Type: application/json; charset=utf-8
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/community/leeks] Error:', error);

    // Try to return stale cache
    const cacheKey1point3acres = 'leek-community-1point3acres';
    const stale1point3acres = getStaleCache(cacheKey1point3acres);

    const data1point3acres = stale1point3acres 
      ? stale1point3acres.data 
      : { items: [], status: 'unavailable' as const, reason: 'Cache expired and fetch failed' };

    return res.status(200).json({
      status: 'ok' as const,
      sources: {
        '1point3acres': data1point3acres,
      },
      items: data1point3acres.items || [],
      count: data1point3acres.items?.length || 0,
      cache_hit: true,
      stale: true,
    });
  }
}
