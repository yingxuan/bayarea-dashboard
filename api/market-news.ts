/**
 * Vercel Serverless Function: /api/market-news
 * Fetches Chinese US stock news from reliable RSS sources
 * 
 * Requirements:
 * - Always return 3 items (or use last_non_empty cache)
 * - Never show empty results
 * - Source chain: RSS1 → RSS2 → HTML fallback → last_non_empty cache
 * - Cache TTL: 7.5 minutes (5-10 min range) for non-empty results only
 * - last_non_empty cache: 6 hours TTL
 * - No translation needed (already Chinese)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { CACHE_TTL, ttlMsToSeconds } from '../shared/config.js';
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
} from './utils.js';

const MARKET_NEWS_CACHE_TTL = 7.5 * 60 * 1000; // 7.5 minutes (5-10 min range) - for non-empty results only
const LAST_NON_EMPTY_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours - for last_non_empty cache
const FETCH_TIMEOUT = 10000; // 10 seconds

// Reliable Chinese US stock RSS sources (only 新浪财经美股)
const RSS_SOURCES = [
  {
    name: '新浪财经美股',
    url: 'https://rss.sina.com.cn/finance/usstock.xml',
    type: 'rss' as const,
  },
];

// HTML fallback sources (if RSS fails)
const HTML_FALLBACK_SOURCES = [
  {
    name: '新浪财经美股',
    url: 'https://finance.sina.com.cn/stock/usstock/',
    type: 'html' as const,
  },
];

// Get GEMINI_API_KEY from environment
// In Vercel: automatically available via process.env
// In local dev: loaded via dotenv/config in server/index.ts
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface MarketNewsItem {
  title: string;        // Chinese headline
  url: string;
  source: string;       // Source name (e.g., "新浪财经美股")
  publishedAt?: string; // ISO 8601 date string
  sourceUrl?: string;   // Original source URL
}

// Empty seed data - we should never use placeholder categories
// If fetch fails, use stale cache instead
const SEED_DATA: MarketNewsItem[] = [];

/**
 * Generate cache key for translation based on English titles hash
 */
function getTranslationCacheKey(titles: string[]): string {
  const titlesStr = titles.sort().join('|||');
  const hash = createHash('sha256').update(titlesStr).digest('hex');
  return `market-news-translation:${hash}`;
}

/**
 * Translate titles using Gemini API (batch translation)
 * Falls back to English if Gemini fails
 */
async function translateTitlesWithGemini(titles: string[]): Promise<string[]> {
  console.log('[Market News] translateTitlesWithGemini called with titles:', titles);
  console.log('[Market News] GEMINI_API_KEY exists:', !!GEMINI_API_KEY);
  console.log('[Market News] GEMINI_API_KEY length:', GEMINI_API_KEY?.length || 0);
  
  if (!GEMINI_API_KEY) {
    console.warn('[Market News] GEMINI_API_KEY not configured, using English titles');
    console.warn('[Market News] Available env vars:', Object.keys(process.env).filter(k => k.includes('GEMINI')));
    return titles; // Fallback to English
  }

  // Check translation cache
  const cacheKey = getTranslationCacheKey(titles);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRANSLATION_CACHE_TTL) {
    console.log('[Market News] Using cached translation');
    return cached.data;
  }

  try {
    console.log('[Market News] Initializing Gemini API...');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Try models in order: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
    // Note: User requested gemini-2.5-pro but it may not be available yet
    let model;
    const modelNames = ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    
    for (const modelName of modelNames) {
      try {
        model = genAI.getGenerativeModel({ model: modelName });
        console.log(`[Market News] Successfully initialized model: ${modelName}`);
        break;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[Market News] Model ${modelName} failed:`, errorMsg);
        // Continue to next model
      }
    }
    
    if (!model) {
      throw new Error('All Gemini models failed to initialize');
    }

    const prompt = `Translate these English news headlines to Chinese (zh-CN). Keep company names and tickers in English. Return ONLY a JSON array.

${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Output format: ["中文标题1", "中文标题2", "中文标题3"]`;

    console.log('[Market News] Sending request to Gemini API...');
    console.log('[Market News] Prompt:', prompt.substring(0, 200) + '...');

    // Use Promise.race for timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT);
    });

    const result = await Promise.race([
      model.generateContent(prompt),
      timeoutPromise,
    ]);

    console.log('[Market News] Received response from Gemini');
    const response = await result.response;
    const text = response.text().trim();
    console.log('[Market News] Gemini response text (first 200 chars):', text.substring(0, 200));

    // Parse JSON array from response
    let translatedTitles: string[];
    try {
      // Extract JSON array from response (might have markdown code blocks)
      let jsonStr = text.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      
      // Find JSON array in text
      const jsonMatch = jsonStr.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        translatedTitles = JSON.parse(jsonMatch[0]);
      } else {
        translatedTitles = JSON.parse(jsonStr);
      }

      // Validate: must be array with same length
      if (!Array.isArray(translatedTitles) || translatedTitles.length !== titles.length) {
        console.error(`[Market News] Invalid Gemini response: expected ${titles.length} items, got ${translatedTitles.length}`);
        throw new Error('Invalid response format');
      }
      
      // Validate: all items must be strings
      if (!translatedTitles.every(t => typeof t === 'string' && t.length > 0)) {
        console.error('[Market News] Invalid Gemini response: not all items are valid strings');
        throw new Error('Invalid response format');
      }

      // Cache the result
      cache.set(cacheKey, { data: translatedTitles, timestamp: Date.now() });

      console.log('[Market News] Successfully translated titles with Gemini');
      return translatedTitles;
    } catch (parseError) {
      console.error('[Market News] Failed to parse Gemini response:', parseError);
      console.error('[Market News] Response text:', text);
      return titles; // Fallback to English
    }
  } catch (error) {
    console.error('[Market News] Gemini translation failed:', error);
    if (error instanceof Error) {
      console.error('[Market News] Error message:', error.message);
      console.error('[Market News] Error stack:', error.stack);
    }
    return titles; // Fallback to English (do NOT output wrong Chinese)
  }
}

/**
 * Legacy translation function (fallback only, not used if Gemini is available)
 */
function translateTitle(titleEn: string): string {
  const originalTitle = titleEn;
  let title = titleEn.toLowerCase().trim();
  
  // Common financial terms mapping (longer phrases first)
  const phraseTranslations: Array<[RegExp, string]> = [
    [/stock market/i, '股市'],
    [/federal reserve/i, '美联储'],
    [/interest rate/i, '利率'],
    [/tech stock/i, '科技股'],
    [/stock price/i, '股价'],
    [/market update/i, '市场更新'],
    [/market analysis/i, '市场分析'],
    [/earnings report/i, '财报'],
    [/breaking news/i, '突发新闻'],
    [/financial news/i, '财经新闻'],
  ];
  
  // Apply phrase translations first
  for (const [pattern, zh] of phraseTranslations) {
    title = title.replace(pattern, zh);
  }
  
  // Word-level translations
  const wordTranslations: Record<string, string> = {
    'stock': '股票',
    'market': '市场',
    'fed': '美联储',
    'rate': '利率',
    'rates': '利率',
    'inflation': '通胀',
    'earnings': '财报',
    'revenue': '营收',
    'profit': '利润',
    'tech': '科技',
    'ai': '人工智能',
    'nvidia': '英伟达',
    'apple': '苹果',
    'microsoft': '微软',
    'google': '谷歌',
    'meta': 'Meta',
    'tesla': '特斯拉',
    'amazon': '亚马逊',
    'update': '更新',
    'analysis': '分析',
    'performance': '表现',
    'policy': '政策',
    'impact': '影响',
    'indicator': '指标',
    'indicators': '指标',
    'economic': '经济',
    'economy': '经济',
    'today': '今日',
    'breaking': '突发',
    'news': '新闻',
    'drops': '下跌',
    'drops': '下跌',
    'rises': '上涨',
    'rises': '上涨',
    'gains': '上涨',
    'gains': '上涨',
    'falls': '下跌',
    'falls': '下跌',
    'surges': '飙升',
    'surges': '飙升',
    'plunges': '暴跌',
    'plunges': '暴跌',
  };

  // Replace words (whole word only)
  for (const [en, zh] of Object.entries(wordTranslations)) {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    title = title.replace(regex, zh);
  }

  // If translation didn't change much (less than 30% Chinese characters), use a more aggressive approach
  const chineseCharCount = (title.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalCharCount = title.length;
  const chineseRatio = totalCharCount > 0 ? chineseCharCount / totalCharCount : 0;
  
  if (chineseRatio < 0.3 && title === originalTitle.toLowerCase()) {
    // Try to create a simple Chinese title from key words
    const keyWords = title.split(/\s+/).filter(w => w.length > 2);
    const translatedWords: string[] = [];
    
    for (const word of keyWords) {
      if (wordTranslations[word.toLowerCase()]) {
        translatedWords.push(wordTranslations[word.toLowerCase()]);
      } else {
        translatedWords.push(word);
      }
    }
    
    if (translatedWords.some(w => /[\u4e00-\u9fa5]/.test(w))) {
      return translatedWords.join(' ');
    }
    
    // Last resort: return English with a prefix
    return `市场新闻: ${originalTitle}`;
  }

  // Clean up: remove extra spaces, capitalize first letter if needed
  title = title.replace(/\s+/g, ' ').trim();
  
  // If we have Chinese characters, return as is
  if (/[\u4e00-\u9fa5]/.test(title)) {
    return title;
  }
  
  // Otherwise return original with prefix
  return `市场新闻: ${originalTitle}`;
}

/**
 * Check if a news item is related to US stocks ONLY
 * Includes: 美股/纳指/标普/道指/科技股/英伟达/苹果/特斯拉/财报/美联储
 * Excludes: A股/港股/沪深/上证/深成/创业板
 */
function isUSStockRelated(title: string, description?: string): boolean {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  // EXCLUDE keywords (must NOT contain these) - strict exclusion
  const excludeKeywords = [
    'a股', 'a股市场', '沪深', '上证', '深证', '深成', '创业板', '科创板',
    '港股', '恒生', 'h股', '香港股市',
    '商品', '期货', '原油', '黄金', '白银', '铜', '铁矿石', 'commodity',
    '人民币', 'rmb', 'cny', '汇率', '外汇',
    '欧洲', '欧股', 'euro', 'eur',
    '日本', '日股', '日经', 'nikkei',
    '英国', '英股', 'ftse',
  ];
  
  // If contains exclude keywords, reject
  if (excludeKeywords.some(keyword => text.includes(keyword))) {
    return false;
  }
  
  // INCLUDE keywords (must contain at least one)
  const includeKeywords = [
    '美股', '纳斯达克', '纳指', '道琼斯', '道指', '标普', 'sp500', 'spx', 'nasdaq', 'dow',
    '美国股市', '美股市场', '美国市场', '华尔街',
    '科技股', '英伟达', 'nvidia', 'nvda', '苹果', 'apple', 'aapl', '特斯拉', 'tesla', 'tsla',
    '财报', 'earnings', '美联储', 'fed', 'federal reserve', 'fomc',
    'microsoft', 'msft', 'google', 'googl', 'meta', 'fb', 'amazon', 'amzn',
  ];
  
  // Must contain at least one include keyword
  const hasIncludeKeyword = includeKeywords.some(keyword => text.includes(keyword));
  
  // Additional check: if mentions "美国" or "us " in context of stocks
  const hasUSContext = (text.includes('美国') || text.includes(' us ') || text.includes('united states')) 
    && !text.includes('中国') && !text.includes('china');
  
  return hasIncludeKeyword || hasUSContext;
}

/**
 * Parse RSS XML and extract news items
 */
function parseRSSFeed(xml: string): MarketNewsItem[] {
  const items: MarketNewsItem[] = [];
  let totalItemsFound = 0;
  
  try {
    console.log(`[Market News] RSS XML length: ${xml.length} characters`);
    
    // Extract all <item> tags
    const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
    
    for (const match of itemMatches) {
      totalItemsFound++;
      const itemXml = match[1];
      
      // Extract title
      const titleMatch = itemXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
                         itemXml.match(/<title[^>]*>(.*?)<\/title>/i);
      if (!titleMatch) {
        console.log(`[Market News] Item ${totalItemsFound}: No title found`);
        continue;
      }
      
      let title = titleMatch[1].trim();
      
      // Decode HTML entities (handle CDATA content)
      title = title
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
      
      if (!title || title.length < 5) {
        console.log(`[Market News] Item ${totalItemsFound}: Title too short: "${title}"`);
        continue;
      }
      
      // Extract link/url
      const linkMatch = itemXml.match(/<link[^>]*>(.*?)<\/link>/i) ||
                        itemXml.match(/<link[^>]*href="([^"]+)"/i);
      if (!linkMatch) {
        console.log(`[Market News] Item ${totalItemsFound}: No link found for "${title.substring(0, 30)}"`);
        continue;
      }
      
      const url = linkMatch[1].trim();
      if (!url || !url.startsWith('http')) {
        console.log(`[Market News] Item ${totalItemsFound}: Invalid URL: "${url}"`);
        continue;
      }
      
      // Extract description (optional, for filtering)
      const descMatch = itemXml.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/i) ||
                         itemXml.match(/<description[^>]*>(.*?)<\/description>/i);
      const description = descMatch ? descMatch[1].trim() : undefined;
      
      // Extract published date
      const pubDateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i) ||
                           itemXml.match(/<published[^>]*>(.*?)<\/published>/i);
      let publishedAt: string | undefined;
      if (pubDateMatch) {
        try {
          const date = new Date(pubDateMatch[1].trim());
          if (!isNaN(date.getTime())) {
            publishedAt = date.toISOString();
          }
        } catch (e) {
          // Ignore date parsing errors
        }
      }
      if (!publishedAt) {
        publishedAt = new Date().toISOString();
      }
      
      // Filter for US stock related news
      if (!isUSStockRelated(title, description)) {
        console.log(`[Market News] Item ${totalItemsFound} filtered out: "${title.substring(0, 50)}"`);
        continue;
      }
      
      console.log(`[Market News] Item ${totalItemsFound} accepted: "${title.substring(0, 50)}"`);
      items.push({
        title: title,
        url: url,
        source: 'RSS Source', // Will be set by caller
        publishedAt: publishedAt,
      });
    }
  } catch (error) {
    console.error('[Market News] RSS parsing error:', error);
    if (error instanceof Error) {
      console.error('[Market News] Error details:', error.message, error.stack);
    }
  }
  
  console.log(`[Market News] Total items in RSS: ${totalItemsFound}`);
  console.log(`[Market News] Parsed ${items.length} US stock related items from RSS`);
  
  // Sort by published date (newest first)
  items.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA; // Descending order (newest first)
  });
  
  // Return top 3 most recent
  const top3 = items.slice(0, 3);
  console.log(`[Market News] Selected top 3 items:`, top3.map(i => i.title));
  return top3;
}

/**
 * Fetch RSS feed from a source
 */
async function fetchRSSFeed(sourceName: string, sourceUrl: string): Promise<MarketNewsItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  
  try {
    console.log(`[Market News] Fetching RSS from ${sourceName}: ${sourceUrl}`);
    
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*;q=0.9',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xml = await response.text();
    
    if (!xml || xml.length < 100) {
      throw new Error('RSS feed is too short or empty');
    }
    
    console.log(`[Market News] Successfully fetched RSS from ${sourceName}, XML length: ${xml.length}`);
    const items = parseRSSFeed(xml);
    
    // Set source name for all items
    items.forEach(item => {
      item.source = sourceName;
      item.sourceUrl = sourceUrl;
    });
    
    console.log(`[Market News] Fetched ${items.length} items from ${sourceName}`);
    return items;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    console.error(`[Market News] Error fetching RSS from ${sourceName}:`, error);
    throw error;
  }
}

/**
 * Fetch HTML from Google Finance
 * @deprecated No longer used - only 华尔街见闻 is used as data source
 */
async function fetchGoogleFinanceHTML(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(GOOGLE_FINANCE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    
    if (!html || html.length < 100) {
      throw new Error('HTML is too short or empty');
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
 * Parse Google Finance HTML and extract "Today's financial news" headlines
 * @deprecated No longer used - only 华尔街见闻 is used as data source
 */
function parseGoogleFinanceNews(html: string): MarketNewsItem[] {
  const $ = cheerio.load(html, {
    decodeEntities: true,
    normalizeWhitespace: false,
  });

  const items: MarketNewsItem[] = [];
  const seenUrls = new Set<string>();

  // Look for "Today's financial news" section
  // Try to find section header first
  let $newsSection: cheerio.Cheerio | null = null;
  
  // Common selectors for news section
  const sectionSelectors = [
    'h2:contains("Today\'s financial news")',
    'h2:contains("Financial news")',
    'h3:contains("Today\'s financial news")',
    'h3:contains("Financial news")',
    '[data-section="news"]',
    '.news-section',
    '[class*="news"]',
  ];

  for (const selector of sectionSelectors) {
    try {
      const $header = $(selector).first();
      if ($header.length > 0) {
        // Get next siblings or parent's children
        $newsSection = $header.nextUntil('h1, h2, h3, h4, section').add($header.siblings());
        if ($newsSection.length === 0) {
          $newsSection = $header.parent().find('a');
        }
        break;
      }
    } catch (error) {
      // Selector might not support :contains, skip
      continue;
    }
  }

  // If section not found, scan entire page for news links
  const $searchArea = $newsSection && $newsSection.length > 0 ? $newsSection : $('body');

  // Try multiple selectors for news headlines
  const linkSelectors = [
    'a[href*="/news/"]',
    'a[href*="news"]',
    'article a',
    '[data-news-item] a',
    '.news-item a',
    'h3 a',
    'h4 a',
  ];

  for (const selector of linkSelectors) {
    $searchArea.find(selector).each((_, element) => {
      if (items.length >= 10) {
        return false; // Collect more for filtering
      }

      const $link = $(element);
      const href = $link.attr('href');
      let titleEn = $link.text().trim();

      if (!href || !titleEn || titleEn.length < 10) {
        return;
      }

      // Build absolute URL
      let url: string;
      try {
        if (href.startsWith('http')) {
          url = href;
        } else if (href.startsWith('/')) {
          url = `https://www.google.com${href}`;
        } else {
          url = new URL(href, GOOGLE_FINANCE_URL).toString();
        }
      } catch (error) {
        return;
      }

      // Filter out non-news URLs (more lenient)
      if (!url.includes('/news/') && !url.includes('news') && !url.includes('article') && !url.includes('finance') && !url.includes('google.com/finance')) {
        return;
      }

      // Skip duplicates
      if (seenUrls.has(url)) {
        return;
      }
      seenUrls.add(url);

      // Clean title
      titleEn = titleEn.replace(/\s+/g, ' ').trim();
      if (titleEn.length < 10) {
        return;
      }

      // Filter out navigation/functional links
      const functionalKeywords = ['read more', 'view all', 'see more', 'more news', '查看更多', '阅读全文', 'more', 'view', 'read'];
      const lowerTitle = titleEn.toLowerCase();
      if (functionalKeywords.some(keyword => lowerTitle === keyword || lowerTitle === ` ${keyword} ` || lowerTitle.startsWith(keyword + ' ') || lowerTitle.endsWith(' ' + keyword))) {
        return;
      }

      // Don't translate here - will batch translate later
      items.push({
        title: titleEn, // Will be translated in batch
        title_en: titleEn,
        url,
        source: 'Google Finance',
      });
    });

    if (items.length >= 10) {
      break;
    }
  }

  console.log(`[Market News] Extracted ${items.length} items from Google Finance`);
  
  // Ensure we have at least 3 items by trying more generic selectors
  if (items.length < 3) {
    console.log(`[Market News] Only found ${items.length} items, trying more generic selectors`);
    
    // Try to find any links with financial keywords
    $('a').each((_, element) => {
      if (items.length >= 3) {
        return false;
      }

      const $link = $(element);
      const href = $link.attr('href');
      let titleEn = $link.text().trim();

      if (!href || !titleEn || titleEn.length < 15) {
        return;
      }

      // Must contain financial/market keywords
      const financialKeywords = ['stock', 'market', 'finance', 'trading', 'invest', 'economy', 'fed', 'rate', 'inflation', 'gdp', 'earnings', 'revenue', 'profit', 'tech', 'ai', 'nvidia', 'apple', 'microsoft', 'google', 'meta', 'tesla'];
      const lowerTitle = titleEn.toLowerCase();
      if (!financialKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return;
      }

      let url: string;
      try {
        if (href.startsWith('http')) {
          url = href;
        } else if (href.startsWith('/')) {
          url = `https://www.google.com${href}`;
        } else {
          return;
        }
      } catch (error) {
        return;
      }

      if (seenUrls.has(url)) {
        return;
      }
      seenUrls.add(url);

      titleEn = titleEn.replace(/\s+/g, ' ').trim();
      
      const functionalKeywords = ['read more', 'view all', 'see more', 'more news', '查看更多', '阅读全文', 'more'];
      const lowerTitle2 = titleEn.toLowerCase();
      if (functionalKeywords.some(keyword => lowerTitle2 === keyword || lowerTitle2.includes(` ${keyword} `))) {
        return;
      }

      // Don't translate here - will batch translate later
      items.push({
        title: titleEn, // Will be translated in batch
        title_en: titleEn,
        url,
        source: 'Google Finance',
      });
    });
  }
  
  return items.slice(0, 3); // Return top 3 only
}

/**
 * Fetch HTML page and extract news headlines
 */
async function fetchHTMLNews(sourceName: string, sourceUrl: string): Promise<MarketNewsItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  
  try {
    console.log(`[Market News] Fetching HTML from ${sourceName}: ${sourceUrl}`);
    
    const response = await fetch(sourceUrl, {
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
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const items: MarketNewsItem[] = [];
    const seenUrls = new Set<string>();
    
    // Common selectors for news headlines (adjust based on actual site structure)
    const selectors = [
      'a[href*="/news/"]',
      'a[href*="article"]',
      '.news-item a',
      '.article-title a',
      'h3 a',
      'h4 a',
      '[class*="news"] a',
      '[class*="article"] a',
    ];
    
    for (const selector of selectors) {
      $(selector).each((_, element) => {
        if (items.length >= 20) return false; // Collect enough for filtering
        
        const $link = $(element);
        const href = $link.attr('href');
        const title = $link.text().trim();
        
        if (!href || !title || title.length < 10) return;
        
        // Build absolute URL
        let url: string;
        try {
          if (href.startsWith('http')) {
            url = href;
          } else if (href.startsWith('/')) {
            url = new URL(href, sourceUrl).toString();
          } else {
            url = new URL(href, sourceUrl).toString();
          }
        } catch {
          return;
        }
        
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
        
        // Filter for US stock related
        if (!isUSStockRelated(title)) return;
        
        items.push({
          title: title,
          url: url,
          source: sourceName,
          sourceUrl: sourceUrl,
          publishedAt: new Date().toISOString(),
        });
      });
      
      if (items.length >= 20) break;
    }
    
    // Sort by date (newest first) and return top 3
    items.sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
    
    console.log(`[Market News] Fetched ${items.length} items from ${sourceName} HTML`);
    return items.slice(0, 3);
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[Market News] Error fetching HTML from ${sourceName}:`, error);
    throw error;
  }
}

/**
 * Get last non-empty cache (6h TTL)
 */
function getLastNonEmptyCache(): MarketNewsItem[] | null {
  const cacheKey = 'market-news-last-non-empty';
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < LAST_NON_EMPTY_CACHE_TTL) {
    const items = cached.data.items || [];
    if (Array.isArray(items) && items.length >= 3) {
      console.log(`[Market News] Using last non-empty cache (${items.length} items)`);
      return items.slice(0, 3);
    }
  }
  
  return null;
}

/**
 * Save last non-empty cache (6h TTL)
 */
function saveLastNonEmptyCache(items: MarketNewsItem[]): void {
  if (items.length >= 3) {
    const cacheKey = 'market-news-last-non-empty';
    cache.set(cacheKey, {
      data: { items: items.slice(0, 3) },
      timestamp: Date.now(),
    });
    console.log(`[Market News] Saved last non-empty cache (${items.length} items)`);
  }
}

/**
 * Fetch market news with source chain: RSS1 → RSS2 → HTML → last_non_empty
 */
async function fetchMarketNews(): Promise<MarketNewsItem[]> {
  // Try RSS sources first
  for (const rssSource of RSS_SOURCES) {
    try {
      const items = await fetchRSSFeed(rssSource.name, rssSource.url);
      if (items.length >= 3) {
        console.log(`[Market News] Successfully fetched ${items.length} items from ${rssSource.name}`);
        saveLastNonEmptyCache(items);
        return items.slice(0, 3);
      } else if (items.length > 0) {
        console.log(`[Market News] Got ${items.length} items from ${rssSource.name}, trying next source...`);
        // Continue to next source to try to get 3 items
      }
    } catch (error) {
      console.warn(`[Market News] RSS source ${rssSource.name} failed:`, error);
      // Continue to next source
    }
  }
  
  // Try HTML fallback sources
  for (const htmlSource of HTML_FALLBACK_SOURCES) {
    try {
      const items = await fetchHTMLNews(htmlSource.name, htmlSource.url);
      if (items.length >= 3) {
        console.log(`[Market News] Successfully fetched ${items.length} items from ${htmlSource.name} HTML`);
        saveLastNonEmptyCache(items);
        return items.slice(0, 3);
      } else if (items.length > 0) {
        console.log(`[Market News] Got ${items.length} items from ${htmlSource.name} HTML, trying next source...`);
        // Continue to next source
      }
    } catch (error) {
      console.warn(`[Market News] HTML source ${htmlSource.name} failed:`, error);
      // Continue to next source
    }
  }
  
  // Last resort: use last non-empty cache
  const lastNonEmpty = getLastNonEmptyCache();
  if (lastNonEmpty) {
    console.log(`[Market News] Using last non-empty cache as fallback`);
    return lastNonEmpty;
  }
  
  // If all sources fail and no cache, return empty (handler will handle this)
  console.warn(`[Market News] All sources failed and no last_non_empty cache available`);
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'market-news';

    // Check cache
    const cached = getCachedData(cacheKey, MARKET_NEWS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      const sourceName = cachedData.source?.name || cachedData.items?.[0]?.source || 'Unknown';
      const sourceUrl = cachedData.source?.url || cachedData.items?.[0]?.sourceUrl || '';
      normalizeCachedResponse(
        cachedData,
        { name: sourceName, url: sourceUrl },
        ttlMsToSeconds(MARKET_NEWS_CACHE_TTL),
        'market-news'
      );
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
      console.log('[API /api/market-news] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data using source chain
    const items = await fetchMarketNews();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(MARKET_NEWS_CACHE_TTL);

    let finalItems = items;
    
    // Ensure we have exactly 3 items
    if (finalItems.length >= 3) {
      console.log(`[API /api/market-news] Successfully fetched ${finalItems.length} items`);
    } else if (finalItems.length > 0) {
      console.warn(`[API /api/market-news] Only got ${finalItems.length} items (less than 3)`);
      // Try to get last_non_empty cache to fill
      const lastNonEmpty = getLastNonEmptyCache();
      if (lastNonEmpty) {
        const existingUrls = new Set(finalItems.map(i => i.url));
        const additionalItems = lastNonEmpty.filter(i => !existingUrls.has(i.url));
        finalItems = [...finalItems, ...additionalItems].slice(0, 3);
        console.log(`[API /api/market-news] Filled to ${finalItems.length} items using last_non_empty cache`);
      }
    } else {
      // No items from source chain - use last_non_empty cache
      console.warn('[API /api/market-news] No items from source chain, using last_non_empty cache');
      const lastNonEmpty = getLastNonEmptyCache();
      if (lastNonEmpty) {
        finalItems = lastNonEmpty;
        console.log(`[API /api/market-news] Using ${finalItems.length} items from last_non_empty cache`);
      } else {
        // Last resort: try stale cache
        const stale = getStaleCache(cacheKey);
        if (stale && stale.data.items && Array.isArray(stale.data.items) && stale.data.items.length >= 3) {
          finalItems = stale.data.items.slice(0, 3);
          console.log(`[API /api/market-news] Using ${finalItems.length} items from stale cache`);
        } else {
          console.error('[API /api/market-news] All sources failed and no cache available');
          finalItems = [];
        }
      }
    }
    
    // Determine source name from items
    const sourceName = finalItems.length > 0 ? finalItems[0].source : 'Unknown';
    const sourceUrl = finalItems.length > 0 ? finalItems[0].sourceUrl : '';

    const response: any = {
      status: finalItems.length >= 3 ? 'ok' as const : (finalItems.length > 0 ? 'partial' as const : 'unavailable' as const),
      items: finalItems.slice(0, 3),
      count: Math.min(finalItems.length, 3),
      asOf: fetchedAtISO,
      source: { name: sourceName, url: sourceUrl },
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
    };

    // Only cache non-empty results (>=3 items)
    if (finalItems.length >= 3) {
      setCache(cacheKey, response);
      saveLastNonEmptyCache(finalItems);
    } else {
      console.warn(`[API /api/market-news] Not caching result (only ${finalItems.length} items, need 3+)`);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/market-news] Error:', error);

    // Try to return stale cache
    const cacheKey = 'market-news';
    const stale = getStaleCache(cacheKey);

    if (stale) {
      const staleData = stale.data;
      // Try last_non_empty cache first
      const lastNonEmpty = getLastNonEmptyCache();
      if (lastNonEmpty) {
        console.log(`[API /api/market-news] Using last_non_empty cache (${lastNonEmpty.length} items)`);
        return res.status(200).json({
          status: 'ok' as const,
          items: lastNonEmpty.slice(0, 3),
          count: Math.min(lastNonEmpty.length, 3),
          asOf: new Date().toISOString(),
          source: { name: lastNonEmpty[0]?.source || 'Unknown', url: lastNonEmpty[0]?.sourceUrl || '' },
          ttlSeconds: ttlMsToSeconds(MARKET_NEWS_CACHE_TTL),
          cache_hit: true,
          cache_mode: 'last_non_empty',
        });
      }
      
      // Fallback to stale cache
      normalizeStaleResponse(
        staleData,
        { name: 'Unknown', url: '' },
        ttlMsToSeconds(MARKET_NEWS_CACHE_TTL),
        'market-news'
      );

      let items = staleData.items || [];
      if (!Array.isArray(items)) {
        items = [];
      }
      
      if (items.length >= 3) {
        return res.status(200).json({
          ...staleData,
          items: items.slice(0, 3),
          count: Math.min(items.length, 3),
          cache_hit: true,
          stale: true,
        });
      }
    }

    // Last resort: return unavailable status (no empty items)
    console.warn('[API /api/market-news] All sources failed and no cache available');
    const errorAtISO = new Date().toISOString();

    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: { name: 'Unknown', url: '' },
      ttlSeconds: ttlMsToSeconds(MARKET_NEWS_CACHE_TTL),
      cache_hit: false,
      fetched_at: errorAtISO,
      fallback: 'none',
    });
  }
}
