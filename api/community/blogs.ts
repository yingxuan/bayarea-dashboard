/**
 * Vercel Serverless Function: /api/community/blogs
 * Fetches latest blog posts from Wenxuecity
 * 
 * Requirements:
 * - Always return 5 items
 * - Never show "暂无内容"
 * - Cache TTL: 45 minutes
 * - Fallback: stale cache → seed data
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
} from '../utils.js';

const BLOGS_CACHE_TTL = 45 * 60 * 1000; // 45 minutes
const BLOG_URL = 'https://blog.wenxuecity.com/myoverview/80634/';
const FETCH_TIMEOUT = 5000; // 5 seconds

// Real post URL pattern: /myblog/80634/YYYYMM/NN.html
const REAL_POST_URL_PATTERN = /\/myblog\/80634\/\d{6}\/\d+\.html/;

interface BlogItem {
  title: string;
  url: string;
  meta?: string; // Optional date or other metadata
  publishedAt?: string; // ISO date string
  sourceUrl: string; // Original overview page URL
}

// Functional link keywords to exclude
const EXCLUDED_KEYWORDS = ['阅读全文', '阅读', '评论', '更多', '查看', '浏览'];

/**
 * Detect charset from buffer (first 4KB) and headers
 */
function detectCharset(buffer: Buffer, contentType: string): string {
  // Priority 1: Check Content-Type header
  if (contentType.includes('charset=')) {
    const match = contentType.match(/charset=([^;]+)/i);
    if (match) {
      const charset = match[1].trim().toLowerCase();
      console.log(`[Blog Community] Detected charset from Content-Type: ${charset}`);
      return charset;
    }
  }
  
  // Priority 2: Scan first 4KB for meta charset tag
  const preview = buffer.slice(0, Math.min(4096, buffer.length)).toString('latin1');
  const metaCharsetMatch = preview.match(/<meta[^>]*charset\s*=\s*["']?([^"'\s>]+)/i);
  if (metaCharsetMatch) {
    const charset = metaCharsetMatch[1].toLowerCase().replace(/['"]/g, '');
    console.log(`[Blog Community] Detected charset from HTML meta: ${charset}`);
    return charset;
  }
  
  // Priority 3: Fallback to UTF-8 (most common)
  console.log('[Blog Community] No charset detected, using UTF-8 as fallback');
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

    // Get response as raw bytes (Buffer)
    const buf = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    
    // Detect charset
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
        html = iconv.decode(buf, detectedCharset).toString();
      }
      console.log(`[Blog Community] Successfully decoded HTML using ${encodingUsed}`);
    } catch (decodeError) {
      // Fallback to UTF-8
      html = buf.toString('utf-8');
      encodingUsed = 'utf-8';
      console.warn(`[Blog Community] Decode with ${detectedCharset} failed, using UTF-8`);
    }
    
    // Check for replacement characters and try GBK if needed
    if (html.includes('') || html.match(/[\uFFFD]/)) {
      console.warn('[Blog Community] HTML contains replacement characters, trying GBK');
      try {
        html = iconv.decode(buf, 'gbk');
        encodingUsed = 'gbk';
        console.log('[Blog Community] Successfully re-decoded HTML using GBK');
      } catch (error) {
        console.error('[Blog Community] GBK re-decode failed, keeping original');
      }
    }
    
    if (!html || html.length < 100) {
      throw new Error('Decoded HTML is too short or empty');
    }
    
    console.log(`[Blog Community] Final encoding: ${encodingUsed}, HTML length: ${html.length}`);
    
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
 * Extract published date from text near the link
 */
function extractPublishedAt($link: cheerio.Cheerio<any>): string | undefined {
  // Look for date patterns like (2025-01-15 12:30:45) or 2025-01-15
  const $parent = $link.parent();
  const $siblings = $link.siblings();
  const $container = $link.closest('div, li, td, th');
  
  // Search in parent, siblings, and container
  const searchText = [
    $parent.text(),
    $siblings.text(),
    $container.text(),
  ].join(' ');
  
  // Match patterns: (YYYY-MM-DD HH:MM:SS) or YYYY-MM-DD
  const dateMatch = searchText.match(/(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/);
  if (dateMatch) {
    try {
      const dateStr = dateMatch[1];
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (error) {
      // Ignore parse errors
    }
  }
  
  return undefined;
}

/**
 * Parse HTML and extract blog posts from the "博文" section
 */
function parseBlogPosts(html: string): BlogItem[] {
  const $ = cheerio.load(html);
  
  const items: BlogItem[] = [];
  const seenUrls = new Set<string>();
  
  // Step 1: Find the "博文" section header
  let foundSection: cheerio.Cheerio<any> | null = null;
  
  // Try to find header with text "博文"
  $('h1, h2, h3, h4, h5, h6, .title, .header, [class*="title"], [class*="header"]').each((_, element) => {
    const $header = $(element);
    const headerText = $header.text().trim();
    
    if (headerText === '博文' || headerText.includes('博文')) {
      // Found the section, get the next sibling or parent's next content
      const $nextSiblings = $header.nextUntil('h1, h2, h3, h4, h5, h6, .pagination, [class*="pagination"]');
      
      // If no next siblings, try parent's children after this header
      if ($nextSiblings.length === 0) {
        const $parent = $header.parent();
        const headerIndex = $parent.children().toArray().findIndex(el => el === element);
        if (headerIndex >= 0) {
          foundSection = $parent.children().slice(headerIndex + 1);
        } else {
          foundSection = $nextSiblings;
        }
      } else {
        foundSection = $nextSiblings;
      }
      
      // Stop searching
      return false;
    }
  });
  
  // If "博文" section not found, try fallback: scan entire page for URL pattern
  if (!foundSection || foundSection.length === 0) {
    console.warn('[Blog Community] "博文" section not found, using fallback: URL-pattern-only scan');
    return parseBlogPostsFallback($);
  }
  
  // At this point, foundSection is guaranteed to be non-null and have length > 0
  const $blogSection = foundSection;
  
  console.log(`[Blog Community] Found "博文" section, scanning ${$blogSection.length} elements`);
  
  // Step 2: Find all links in the blog section that match the real post URL pattern
  $blogSection.find('a').each((_: number, element: any) => {
    const $link = $(element);
    const href = $link.attr('href');
    
    if (!href) return;
    
    // Build absolute URL
    let url: string;
    try {
      const urlObj = new URL(href, BLOG_URL);
      url = urlObj.toString();
    } catch (error) {
      // Fallback to manual construction
      if (href.startsWith('/')) {
        url = `https://blog.wenxuecity.com${href}`;
      } else if (href.startsWith('http')) {
        url = href;
      } else {
        url = `${BLOG_URL}${href}`;
      }
    }
    
    // Must match real post URL pattern
    if (!REAL_POST_URL_PATTERN.test(url)) {
      return;
    }
    
    // Skip duplicates
    if (seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);
    
    // Get title (anchor text)
    let title = $link.text().trim();
    
    // Skip if no title
    if (!title || title.length === 0) {
      return;
    }
    
    // Normalize title
    title = title.replace(/\s+/g, ' ').trim();
    
    // Filter out functional/navigation links
    const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword => title.includes(keyword));
    if (hasExcludedKeyword) {
      console.log(`[Blog Community] Filtered out functional link: ${title.substring(0, 50)}`);
      return;
    }
    
    // Reject titles with replacement characters
    if (title.includes('') || title.match(/[\uFFFD]/)) {
      return;
    }
    
    // Extract published date
    const publishedAt = extractPublishedAt($link);
    
    items.push({
      title: `【文学城博客】${title}`,
      url,
      publishedAt,
      sourceUrl: BLOG_URL,
    });
    
    console.log(`[Blog Community] Added item ${items.length}: ${title.substring(0, 50)}`);
    
    // Stop at 6 items
    if (items.length >= 6) {
      return false;
    }
  });
  
  // If we got items from the "博文" section, return them
  if (items.length > 0) {
    console.log(`[Blog Community] Found ${items.length} items from "博文" section`);
    return items.slice(0, 6);
  }
  
  // Fallback: URL-pattern-only scan
  console.warn('[Blog Community] No items found in "博文" section, using fallback');
  return parseBlogPostsFallback($);
}

/**
 * Fallback parser: scan entire page for links matching the URL pattern
 */
function parseBlogPostsFallback($: cheerio.CheerioAPI): BlogItem[] {
  const items: BlogItem[] = [];
  const seenUrls = new Set<string>();
  
  console.log('[Blog Community] Fallback: scanning entire page for URL pattern');
  
  $('a').each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    
    if (!href) return;
    
    // Build absolute URL
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
        return; // Skip invalid URLs
      }
    }
    
    // Must match real post URL pattern
    if (!REAL_POST_URL_PATTERN.test(url)) {
      return;
    }
    
    // Skip duplicates
    if (seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);
    
    // Get title
    let title = $link.text().trim();
    if (!title || title.length === 0) {
      return;
    }
    
    // Normalize title
    title = title.replace(/\s+/g, ' ').trim();
    
    // Filter out functional links
    const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword => title.includes(keyword));
    if (hasExcludedKeyword) {
      return;
    }
    
    // Reject titles with replacement characters
    if (title.includes('') || title.match(/[\uFFFD]/)) {
      return;
    }
    
    // Extract published date
    const publishedAt = extractPublishedAt($link);
    
    items.push({
      title: `【文学城博客】${title}`,
      url,
      publishedAt,
      sourceUrl: BLOG_URL,
    });
    
    console.log(`[Blog Community] Fallback: Added item ${items.length}: ${title.substring(0, 50)}`);
    
    if (items.length >= 6) {
      return false;
    }
  });
  
  console.log(`[Blog Community] Fallback found ${items.length} items`);
  return items.slice(0, 6);
}

/**
 * Fetch and parse blog posts
 */
async function fetchBlogPosts(): Promise<BlogItem[]> {
  try {
    const html = await fetchBlogHTML();
    const items = parseBlogPosts(html);
    
    // Never return mock data - return empty array if no items found
    // The handler will return "unavailable" status
    return items.slice(0, 6);
  } catch (error) {
    console.error('[Blog Community] Error fetching blog:', error);
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'blog-community';

    // Check cache
    const cached = getCachedData(cacheKey, BLOGS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(
        cachedData,
        { name: 'Wenxuecity', url: BLOG_URL },
        ttlMsToSeconds(BLOGS_CACHE_TTL),
        'blog-community'
      );
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
      });
    }

    if (nocache) {
      console.log('[API /api/community/blogs] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data
    const items = await fetchBlogPosts();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(BLOGS_CACHE_TTL);

    // If no items found, return unavailable status (never return mock data)
    if (items.length === 0) {
      console.warn('[API /api/community/blogs] No posts found, returning unavailable status');
      return res.status(200).json({
        status: 'unavailable' as const,
        items: [],
        count: 0,
        asOf: fetchedAtISO,
        source: { name: 'Wenxuecity', url: BLOG_URL },
        ttlSeconds,
        cache_hit: false,
        fetched_at: fetchedAtISO,
        reason: 'No posts found matching URL pattern /myblog/80634/YYYYMM/NN.html',
      });
    }

    // Try to get additional items from stale cache if needed
    let finalItems = items;
    if (finalItems.length < 6) {
      const stale = getStaleCache(cacheKey);
      if (stale && stale.data.items && Array.isArray(stale.data.items)) {
        const staleItems = stale.data.items as BlogItem[];
        const existingUrls = new Set(finalItems.map(i => i.url));
        const additionalItems = staleItems
          .filter(i => !existingUrls.has(i.url) && REAL_POST_URL_PATTERN.test(i.url))
          .slice(0, 6 - finalItems.length);
        finalItems = [...finalItems, ...additionalItems];
      }
    }

    const response: any = {
      status: 'ok' as const,
      items: finalItems.slice(0, 6),
      count: Math.min(finalItems.length, 6),
      asOf: fetchedAtISO,
      source: { name: 'Wenxuecity', url: BLOG_URL },
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
    console.error('[API /api/community/blogs] Error:', error);

    // Try stale cache
    const cacheKey = 'blog-community';
    const stale = getStaleCache(cacheKey);

    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(
        staleData,
        { name: 'Wenxuecity', url: BLOG_URL },
        ttlMsToSeconds(BLOGS_CACHE_TTL),
        'blog-community'
      );

      let items = staleData.items || [];
      if (!Array.isArray(items)) {
        items = [];
      }
      
      // Filter stale items to only include real post URLs
      items = items.filter((item: any) => 
        item.url && REAL_POST_URL_PATTERN.test(item.url)
      );

      // If no valid items in stale cache, return unavailable
      if (items.length === 0) {
        console.warn('[API /api/community/blogs] Stale cache has no valid items, returning unavailable');
        return res.status(200).json({
          status: 'unavailable' as const,
          items: [],
          count: 0,
          asOf: new Date().toISOString(),
          source: { name: 'Wenxuecity', url: BLOG_URL },
          ttlSeconds: ttlMsToSeconds(BLOGS_CACHE_TTL),
          cache_hit: false,
          fetched_at: new Date().toISOString(),
          reason: 'Stale cache has no valid posts',
        });
      }

      return res.status(200).json({
        ...staleData,
        items: items.slice(0, 6),
        count: Math.min(items.length, 6),
        cache_hit: true,
        stale: true,
      });
    }

    // Last resort: return unavailable (never return mock data)
    console.warn('[API /api/community/blogs] All sources failed, returning unavailable status');
    const errorAtISO = new Date().toISOString();

    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: { name: 'Wenxuecity', url: BLOG_URL },
      ttlSeconds: ttlMsToSeconds(BLOGS_CACHE_TTL),
      cache_hit: false,
      fetched_at: errorAtISO,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
