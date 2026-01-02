/**
 * Vercel Serverless Function: /api/community/leeks
 * Fetches latest discussions from community sources (1point3acres + Wenxuecity)
 * 
 * Requirements:
 * - Return 8 items total: 5 from 1point3acres + 3 from Wenxuecity (no merging)
 * - Never show "暂无内容"
 * - Cache TTL: 1point3acres 10 minutes, Wenxuecity 30 minutes
 * - On failure return "unavailable" status with reason
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
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
} from '../utils.js';

const ONEPOINT3ACRES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const WENXUECITY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const FORUM_URL = 'https://www.1point3acres.com/bbs/forum.php?mod=forumdisplay&fid=291&filter=author&orderby=dateline';
const FETCH_TIMEOUT = 5000; // 5 seconds

// Wenxuecity blog URL
const BLOG_URL = 'https://blog.wenxuecity.com/myoverview/80634/';
const REAL_POST_URL_PATTERN = /\/myblog\/80634\/\d{6}\/\d+\.html/;
const EXCLUDED_KEYWORDS = ['阅读全文', '阅读', '评论', '更多', '查看', '浏览'];

// Unified community item interface
interface CommunityItem {
  source: '1point3acres' | 'wenxuecity';
  sourceLabel: string; // "一亩三分地" or "文学城"
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
  {
    source: 'wenxuecity',
    sourceLabel: '文学城',
    title: '去文学城博客看看最新文章',
    url: BLOG_URL,
  },
];

/**
 * Detect charset from buffer (first 4KB) and headers
 */
function detectCharset(buffer: Buffer, contentType: string): string {
  // Priority 1: Check Content-Type header
  if (contentType.includes('charset=')) {
    const match = contentType.match(/charset=([^;]+)/i);
    if (match) {
      const charset = match[1].trim().toLowerCase();
      console.log(`[Leek Community] Detected charset from Content-Type: ${charset}`);
      return charset;
    }
  }
  
  // Priority 2: Scan first 4KB for meta charset tag
  const preview = buffer.slice(0, Math.min(4096, buffer.length)).toString('latin1');
  const metaCharsetMatch = preview.match(/<meta[^>]*charset\s*=\s*["']?([^"'\s>]+)/i);
  if (metaCharsetMatch) {
    const charset = metaCharsetMatch[1].toLowerCase().replace(/['"]/g, '');
    console.log(`[Leek Community] Detected charset from HTML meta: ${charset}`);
    return charset;
  }
  
  // Priority 3: Fallback to GBK (common for Chinese forums)
  console.log('[Leek Community] No charset detected, using GBK as fallback');
  return 'gbk';
}

/**
 * Fetch HTML from 1point3acres forum
 * Handles Chinese encoding (GBK/GB2312 to UTF-8) with proper detection
 */
async function fetchForumHTML(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(FORUM_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BayAreaDash/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get response as raw bytes (Buffer)
    const buf = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    
    // Detect charset using priority: Content-Type -> HTML meta -> GBK fallback
    let detectedCharset = detectCharset(buf, contentType);
    
    // Normalize charset name
    if (detectedCharset.includes('gb2312')) {
      detectedCharset = 'gb2312';
    } else if (detectedCharset.includes('gb') || detectedCharset.includes('gbk')) {
      detectedCharset = 'gbk';
    } else if (detectedCharset.includes('utf-8') || detectedCharset.includes('utf8')) {
      detectedCharset = 'utf-8';
    }
    
    // Decode using detected charset
    let html: string;
    let encodingUsed = detectedCharset;
    
    try {
      if (detectedCharset === 'utf-8' || detectedCharset === 'utf8') {
        html = buf.toString('utf-8');
      } else {
        // Use iconv-lite for GBK/GB2312
        html = iconv.decode(buf, detectedCharset);
      }
      console.log(`[Leek Community] Successfully decoded HTML using ${encodingUsed}`);
    } catch (decodeError) {
      // If decode fails, try GBK as fallback
      console.warn(`[Leek Community] Decode with ${detectedCharset} failed, trying GBK:`, decodeError);
      try {
        html = iconv.decode(buf, 'gbk');
        encodingUsed = 'gbk';
        console.log('[Leek Community] Successfully decoded HTML using GBK fallback');
      } catch (gbkError) {
        // Last resort: UTF-8
        html = buf.toString('utf-8');
        encodingUsed = 'utf-8';
        console.warn('[Leek Community] Using UTF-8 as last resort (may have encoding issues)');
      }
    }
    
    // Final validation: check for replacement characters
    if (html.includes('') || html.match(/[\uFFFD]/)) {
      console.warn('[Leek Community] HTML contains replacement characters, forcing GBK decode');
      try {
        html = iconv.decode(buf, 'gbk');
        encodingUsed = 'gbk';
        console.log('[Leek Community] Successfully re-decoded HTML using GBK');
      } catch (error) {
        console.error('[Leek Community] GBK re-decode also failed, keeping original');
      }
    }
    
    // Final validation: check if we have valid HTML structure
    if (!html || html.length < 100) {
      throw new Error('Decoded HTML is too short or empty');
    }
    
    console.log(`[Leek Community] Final encoding: ${encodingUsed}, HTML length: ${html.length}`);
    
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
  const $ = cheerio.load(html, {
    decodeEntities: true,
    normalizeWhitespace: false,
  });
  
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
  function extractPostFromTbody($tbody: cheerio.Cheerio): CommunityItem | null {
    // Primary selector: a.s.xst
    let $titleLink = $tbody.find('a.s.xst').first();
    
    // Fallback selectors if primary doesn't exist
    if ($titleLink.length === 0) {
      $titleLink = $tbody.find('th a[href*="viewthread"]').first();
    }
    if ($titleLink.length === 0) {
      $titleLink = $tbody.find('a[href*="thread-"]').first();
    }
    
    if ($titleLink.length === 0) {
      return null;
    }
    
    const href = $titleLink.attr('href');
    if (!href) {
      return null;
    }
    
    // Filter out forumdisplay links
    if (href.includes('forumdisplay') || href.includes('forum.php?mod=forumdisplay')) {
      filteredCount++;
      return null;
    }
    
    // Validate URL: must contain thread- or mod=viewthread or viewthread
    const isValidThreadUrl = href.includes('thread-') || 
                             href.includes('mod=viewthread') || 
                             href.includes('viewthread');
    
    if (!isValidThreadUrl) {
      filteredCount++;
      return null;
    }
    
    // Build absolute URL using URL constructor
    let url: string;
    try {
      const urlObj = new URL(href, baseUrl);
      url = urlObj.toString();
    } catch (error) {
      // Fallback to manual construction
      if (href.startsWith('/')) {
        url = `https://www.1point3acres.com${href}`;
      } else if (href.startsWith('http')) {
        url = href;
      } else {
        url = `${baseUrl}${href}`;
      }
    }
    
    // Get and clean title
    let title = $titleLink.text().replace(/\s+/g, ' ').trim();
    
    // Skip if no title
    if (!title || title.length === 0) {
      return null;
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
    
    // Strict check: reject any title with replacement characters
    if (title.includes('') || title.match(/[\uFFFD]/)) {
      filteredCount++;
      return null;
    }
    
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
    
    // Filter short titles (likely operation links)
    if (title.length < 6) {
      filteredCount++;
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
    return {
      source: '1point3acres' as const,
      sourceLabel: '一亩三分地',
      title: title, // Don't add prefix here, UI will add [sourceLabel]
      url,
      publishedAt: undefined, // Forum posts don't have publishedAt in the list
    };
  }

  // Process post bodies - fetch TOP 5 newest only
  postBodies.each((_, element) => {
    if (items.length >= 5) {
      return false; // Stop at 5
    }
    
    const $tbody = $(element);
    const post = extractPostFromTbody($tbody);
    
    if (post) {
      items.push(post);
      console.log(`[1point3acres] Added item ${items.length}: ${post.title.substring(0, 50)}`);
    }
  });
  
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
  return items.slice(0, 5); // Return TOP 5 only
}

/**
 * Detect charset from buffer (first 4KB) and headers (for Wenxuecity)
 */
function detectCharsetForBlog(buffer: Buffer, contentType: string): string {
  if (contentType.includes('charset=')) {
    const match = contentType.match(/charset=([^;]+)/i);
    if (match) {
      const charset = match[1].trim().toLowerCase();
      return charset;
    }
  }
  
  const preview = buffer.slice(0, Math.min(4096, buffer.length)).toString('latin1');
  const metaCharsetMatch = preview.match(/<meta[^>]*charset\s*=\s*["']?([^"'\s>]+)/i);
  if (metaCharsetMatch) {
    return metaCharsetMatch[1].toLowerCase().replace(/['"]/g, '');
  }
  
  return 'utf-8';
}

/**
 * Fetch HTML from Wenxuecity blog
 */
async function fetchBlogHTML(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(BLOG_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BayAreaDash/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buf = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    
    let detectedCharset = detectCharsetForBlog(buf, contentType);
    
    if (detectedCharset.includes('gb2312')) {
      detectedCharset = 'gb2312';
    } else if (detectedCharset.includes('gb') || detectedCharset.includes('gbk')) {
      detectedCharset = 'gbk';
    } else if (detectedCharset.includes('utf-8') || detectedCharset.includes('utf8')) {
      detectedCharset = 'utf-8';
    }
    
    let html: string;
    let encodingUsed = detectedCharset;
    
    try {
      if (detectedCharset === 'utf-8' || detectedCharset === 'utf8') {
        html = buf.toString('utf-8');
      } else {
        html = iconv.decode(buf, detectedCharset);
      }
    } catch (decodeError) {
      html = buf.toString('utf-8');
      encodingUsed = 'utf-8';
    }
    
    if (html.includes('') || html.match(/[\uFFFD]/)) {
      try {
        html = iconv.decode(buf, 'gbk');
        encodingUsed = 'gbk';
      } catch (error) {
        // Keep original
      }
    }
    
    if (!html || html.length < 100) {
      throw new Error('Decoded HTML is too short or empty');
    }
    
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
 * Extract published date from text near the link (for Wenxuecity)
 */
function extractPublishedAtFromLink($link: cheerio.Cheerio): string | undefined {
  const $parent = $link.parent();
  const $siblings = $link.siblings();
  const $container = $link.closest('div, li, td, th');
  
  const searchText = [
    $parent.text(),
    $siblings.text(),
    $container.text(),
  ].join(' ');
  
  const dateMatch = searchText.match(/(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/);
  if (dateMatch) {
    try {
      const dateStr = dateMatch[1];
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (error) {
      // Ignore
    }
  }
  
  return undefined;
}

/**
 * Parse Wenxuecity blog posts from HTML
 */
function parseWenxuecityPosts(html: string): CommunityItem[] {
  const $ = cheerio.load(html, {
    decodeEntities: true,
    normalizeWhitespace: false,
  });
  
  const items: CommunityItem[] = [];
  const seenUrls = new Set<string>();
  
  // Find "博文" section
  let $blogSection: cheerio.Cheerio | null = null;
  
  $('h1, h2, h3, h4, h5, h6, .title, .header, [class*="title"], [class*="header"]').each((_, element) => {
    const $header = $(element);
    const headerText = $header.text().trim();
    
    if (headerText === '博文' || headerText.includes('博文')) {
      $blogSection = $header.nextUntil('h1, h2, h3, h4, h5, h6, .pagination, [class*="pagination"]');
      if ($blogSection.length === 0) {
        const $parent = $header.parent();
        const headerIndex = $parent.children().toArray().findIndex(el => el === element);
        if (headerIndex >= 0) {
          $blogSection = $parent.children().slice(headerIndex + 1);
        }
      }
      return false;
    }
  });
  
  // If no "博文" section, fallback to URL-pattern scan
  if (!$blogSection || $blogSection.length === 0) {
    console.warn('[Wenxuecity] "博文" section not found, using fallback scan');
    return parseWenxuecityPostsFallback($);
  }
  
  // Extract links from blog section
  $blogSection.find('a').each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    
    if (!href) return;
    
    let url: string;
    try {
      const urlObj = new URL(href, BLOG_URL);
      url = urlObj.toString();
    } catch (error) {
      if (href.startsWith('/')) {
        url = `https://blog.wenxuecity.com${href}`;
      } else if (href.startsWith('http')) {
        url = href;
      } else {
        url = `${BLOG_URL}${href}`;
      }
    }
    
    if (!REAL_POST_URL_PATTERN.test(url)) {
      return;
    }
    
    if (seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);
    
    let title = $link.text().trim();
    if (!title || title.length === 0) {
      return;
    }
    
    title = title.replace(/\s+/g, ' ').trim();
    
    const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword => title.includes(keyword));
    if (hasExcludedKeyword) {
      return;
    }
    
    if (title.includes('') || title.match(/[\uFFFD]/)) {
      return;
    }
    
    const publishedAt = extractPublishedAtFromLink($link);
    
    items.push({
      source: 'wenxuecity' as const,
      sourceLabel: '文学城',
      title,
      url,
      publishedAt,
    });
    
    if (items.length >= 3) {
      return false; // Stop at 3
    }
  });
  
  if (items.length > 0) {
    return items.slice(0, 3); // Return TOP 3 only
  }
  
  // Fallback
  return parseWenxuecityPostsFallback($).slice(0, 3);
}

/**
 * Fallback parser for Wenxuecity: URL-pattern-only scan
 */
function parseWenxuecityPostsFallback($: cheerio.CheerioAPI): CommunityItem[] {
  const items: CommunityItem[] = [];
  const seenUrls = new Set<string>();
  
  $('a').each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    
    if (!href) return;
    
    let url: string;
    try {
      const urlObj = new URL(href, BLOG_URL);
      url = urlObj.toString();
    } catch (error) {
      if (href.startsWith('/')) {
        url = `https://blog.wenxuecity.com${href}`;
      } else if (href.startsWith('http')) {
        url = href;
      } else {
        return;
      }
    }
    
    if (!REAL_POST_URL_PATTERN.test(url)) {
      return;
    }
    
    if (seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);
    
    let title = $link.text().trim();
    if (!title || title.length === 0) {
      return;
    }
    
    title = title.replace(/\s+/g, ' ').trim();
    
    const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword => title.includes(keyword));
    if (hasExcludedKeyword) {
      return;
    }
    
    if (title.includes('') || title.match(/[\uFFFD]/)) {
      return;
    }
    
    const publishedAt = extractPublishedAtFromLink($link);
    
    items.push({
      source: 'wenxuecity' as const,
      sourceLabel: '文学城',
      title,
      url,
      publishedAt,
    });
    
    if (items.length >= 3) {
      return false; // Stop at 3
    }
  });
  
  return items.slice(0, 3); // Return TOP 3 only
}

/**
 * Merge and deduplicate community items from all sources
 */
function mergeCommunityItems(
  forumItems: CommunityItem[],
  blogItems: CommunityItem[]
): CommunityItem[] {
  const allItems = [...forumItems, ...blogItems];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const uniqueItems: CommunityItem[] = [];
  
  // Sort by publishedAt (desc), fallback to source order
  allItems.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    }
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return 0; // Keep original order if no dates
  });
  
  // Deduplicate by URL and normalized title
  for (const item of allItems) {
    const normalizedTitle = item.title.toLowerCase().trim();
    
    // Skip if duplicate URL or very similar title
    if (seenUrls.has(item.url)) {
      continue;
    }
    
    if (seenTitles.has(normalizedTitle)) {
      continue;
    }
    
    seenUrls.add(item.url);
    seenTitles.add(normalizedTitle);
    uniqueItems.push(item);
    
    if (uniqueItems.length >= 6) {
      break;
    }
  }
  
  return uniqueItems.slice(0, 6);
}

/**
 * Fetch 1point3acres posts (TOP 5 newest)
 */
async function fetch1point3acresPosts(): Promise<{ items: CommunityItem[]; status: 'ok' | 'unavailable'; reason?: string }> {
  try {
    const html = await fetchForumHTML();
    const items = parseForumPosts(html);
    
    // Return TOP 5 only
    const top5 = items.slice(0, 5);
    
    if (top5.length === 0) {
      return {
        items: [],
        status: 'unavailable',
        reason: 'No posts found',
      };
    }
    
    return {
      items: top5,
      status: 'ok',
    };
  } catch (error) {
    console.error('[1point3acres] Error fetching posts:', error);
    return {
      items: [],
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch Wenxuecity posts (TOP 3 newest)
 */
async function fetchWenxuecityPostsWithStatus(): Promise<{ items: CommunityItem[]; status: 'ok' | 'unavailable'; reason?: string }> {
  try {
    const html = await fetchBlogHTML();
    const items = parseWenxuecityPosts(html);
    
    // Return TOP 3 only
    const top3 = items.slice(0, 3);
    
    if (top3.length === 0) {
      return {
        items: [],
        status: 'unavailable',
        reason: 'No posts found',
      };
    }
    
    return {
      items: top3,
      status: 'ok',
    };
  } catch (error) {
    console.error('[Wenxuecity] Error fetching posts:', error);
    return {
      items: [],
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Unknown error',
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
    const cacheKeyWenxuecity = 'leek-community-wenxuecity';

    // Check cache for both sources
    const cached1point3acres = getCachedData(cacheKey1point3acres, ONEPOINT3ACRES_CACHE_TTL, nocache);
    const cachedWenxuecity = getCachedData(cacheKeyWenxuecity, WENXUECITY_CACHE_TTL, nocache);

    if (cached1point3acres && cachedWenxuecity) {
      const data1point3acres = cached1point3acres.data;
      const dataWenxuecity = cachedWenxuecity.data;
      
      return res.status(200).json({
        status: 'ok' as const,
        sources: {
          '1point3acres': data1point3acres,
          'wenxuecity': dataWenxuecity,
        },
        items: [
          ...(data1point3acres.items || []),
          ...(dataWenxuecity.items || []),
        ],
        count: (data1point3acres.items?.length || 0) + (dataWenxuecity.items?.length || 0),
        cache_hit: true,
        cache_mode: 'normal',
      });
    }

    // Log cache bypass
    if (nocache) {
      console.log('[API /api/community/leeks] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data from both sources in parallel
    const [result1point3acres, resultWenxuecity] = await Promise.all([
      cached1point3acres ? Promise.resolve({ items: cached1point3acres.data.items || [], status: 'ok' as const }) : fetch1point3acresPosts(),
      cachedWenxuecity ? Promise.resolve({ items: cachedWenxuecity.data.items || [], status: 'ok' as const }) : fetchWenxuecityPostsWithStatus(),
    ]);

    const fetchedAtISO = new Date().toISOString();

    // Prepare response for 1point3acres
    const response1point3acres: any = {
      status: result1point3acres.status,
      items: result1point3acres.items.slice(0, 5),
      count: Math.min(result1point3acres.items.length, 5),
      asOf: fetchedAtISO,
      source: { name: '1point3acres', url: FORUM_URL },
      ttlSeconds: ttlMsToSeconds(ONEPOINT3ACRES_CACHE_TTL),
      reason: result1point3acres.status === 'unavailable' ? result1point3acres.reason : undefined,
    };

    // Prepare response for Wenxuecity
    const responseWenxuecity: any = {
      status: resultWenxuecity.status,
      items: resultWenxuecity.items.slice(0, 3),
      count: Math.min(resultWenxuecity.items.length, 3),
      asOf: fetchedAtISO,
      source: { name: 'wenxuecity', url: BLOG_URL },
      ttlSeconds: ttlMsToSeconds(WENXUECITY_CACHE_TTL),
      reason: resultWenxuecity.status === 'unavailable' ? resultWenxuecity.reason : undefined,
    };

    // Update caches
    if (result1point3acres.status === 'ok') {
      setCache(cacheKey1point3acres, response1point3acres);
    }
    if (resultWenxuecity.status === 'ok') {
      setCache(cacheKeyWenxuecity, responseWenxuecity);
    }

    // Combine items: 5 from 1point3acres + 3 from Wenxuecity
    const allItems = [
      ...response1point3acres.items,
      ...responseWenxuecity.items,
    ];

    const response: any = {
      status: 'ok' as const,
      sources: {
        '1point3acres': response1point3acres,
        'wenxuecity': responseWenxuecity,
      },
      items: allItems,
      count: allItems.length,
      asOf: fetchedAtISO,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      cache_mode: nocache ? 'bypass' : 'normal',
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/community/leeks] Error:', error);

    // Try to return stale cache
    const cacheKey1point3acres = 'leek-community-1point3acres';
    const cacheKeyWenxuecity = 'leek-community-wenxuecity';
    const stale1point3acres = getStaleCache(cacheKey1point3acres);
    const staleWenxuecity = getStaleCache(cacheKeyWenxuecity);

    const data1point3acres = stale1point3acres ? stale1point3acres.data : { items: [], status: 'unavailable' as const, reason: 'Cache expired and fetch failed' };
    const dataWenxuecity = staleWenxuecity ? staleWenxuecity.data : { items: [], status: 'unavailable' as const, reason: 'Cache expired and fetch failed' };

    return res.status(200).json({
      status: 'ok' as const,
      sources: {
        '1point3acres': data1point3acres,
        'wenxuecity': dataWenxuecity,
      },
      items: [
        ...(data1point3acres.items || []),
        ...(dataWenxuecity.items || []),
      ],
      count: (data1point3acres.items?.length || 0) + (dataWenxuecity.items?.length || 0),
      cache_hit: true,
      stale: true,
    });
  }
}
