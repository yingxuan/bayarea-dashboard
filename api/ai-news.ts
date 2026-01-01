/**
 * Vercel Serverless Function: /api/ai-news
 * Fetches real-time AI/Tech news via NewsAPI.org
 * 
 * REQUIRES: NEWS_API_KEY environment variable
 * Get your free API key at: https://newsapi.org/register
 * Free tier: 100 requests/day, 1 request/second
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, API_URLS, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';

const NEWS_API_KEY = process.env.NEWS_API_KEY!;
const NEWS_CACHE_TTL = CACHE_TTL.NEWS;

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();

interface NewsItem {
  title: string;
  url: string;
  source_name: string;
  snippet: string;
  summary_zh?: string;
  why_it_matters_zh?: string;
  published_at?: string;
  as_of: string; // ISO 8601 timestamp with timezone
}

/**
 * Fetch news from NewsAPI.org using "everything" endpoint
 */
async function fetchNewsAPIEverything(query: string, pageSize: number = 10): Promise<any[]> {
  if (!NEWS_API_KEY) {
    console.warn('[AI News] NEWS_API_KEY not configured, returning empty results');
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: pageSize.toString(),
    apiKey: NEWS_API_KEY,
  });

  const response = await fetch(`${API_URLS.NEWSAPI_EVERYTHING}?${params}`);
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[AI News] NewsAPI everything endpoint error: ${response.statusText}`, error);
    throw new Error(`NewsAPI error: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.status === 'error') {
    console.error(`[AI News] NewsAPI returned error:`, data.message);
    throw new Error(`NewsAPI error: ${data.message}`);
  }

  return data.articles || [];
}

/**
 * Fetch news from NewsAPI.org using "top-headlines" endpoint (free tier fallback)
 */
async function fetchNewsAPIHeadlines(category: string = 'technology', pageSize: number = 10): Promise<any[]> {
  if (!NEWS_API_KEY) {
    return [];
  }

  const params = new URLSearchParams({
    category: category,
    country: 'us',
    pageSize: pageSize.toString(),
    apiKey: NEWS_API_KEY,
  });

  const response = await fetch(`${API_URLS.NEWSAPI_HEADLINES}?${params}`);
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[AI News] NewsAPI headlines endpoint error: ${response.statusText}`, error);
    throw new Error(`NewsAPI error: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.status === 'error') {
    console.error(`[AI News] NewsAPI returned error:`, data.message);
    throw new Error(`NewsAPI error: ${data.message}`);
  }

  return data.articles || [];
}

const ALLOWED_DOMAINS = [
  // Major tech news sources
  'reuters.com',
  'theverge.com',
  'arstechnica.com',
  'techcrunch.com',
  'wired.com',
  'engadget.com',
  'gizmodo.com',
  'zdnet.com',
  'cnet.com',
  'venturebeat.com',
  'theinformation.com',
  'axios.com',
  // Business/Finance (tech-focused)
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'nytimes.com',
  'cnbc.com',
  'businessinsider.com',
  'forbes.com',
  // Aggregators and others
  'biztoc.com',
  'techxplore.com',
  'phys.org', // Science/tech news
  'science.org',
  'ieee.org',
  'acm.org',
];

function isArticleValid(article: any): boolean {
  const url = article.url?.toLowerCase() || '';
  const title = article.title?.toLowerCase() || '';
  
  // Must have a valid URL
  if (!url || !url.startsWith('http')) {
    return false;
  }
  
  // Reject stock quote pages
  if (url.includes('/quote/') || url.includes('/symbol/') || url.includes('/stock/')) {
    return false;
  }
  
  // Reject finance domains unless explicitly allowed
  if (url.includes('finance.yahoo.com') || url.includes('marketwatch.com')) {
    return false;
  }
  
  // Check allowlist - safely parse URL
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    if (!ALLOWED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
      return false;
    }
  } catch (error) {
    // Invalid URL format, reject
    console.warn(`[AI News] Invalid URL format: ${url}`, error);
    return false;
  }
  
  return true;
}

function enhanceNewsItem(article: any): NewsItem {
  const title = article.title?.toLowerCase() || '';
  const description = article.description?.toLowerCase() || '';
  const content = article.content?.toLowerCase() || '';
  const fullText = `${title} ${description} ${content}`;
  
  // Generate Chinese summary based on keywords
  let summary_zh = article.title;
  let why_it_matters_zh = '可能影响科技行业发展趋势';
  
  // Helper function to extract key details
  const extractDetails = (text: string) => {
    const details: string[] = [];
    
    // Extract product names
    if (text.includes('gpt-5')) details.push('GPT-5');
    if (text.includes('gpt-4')) details.push('GPT-4');
    if (text.includes('gemini')) details.push('Gemini');
    if (text.includes('claude')) details.push('Claude');
    
    // Extract financial info
    const investmentMatch = article.content?.match(/\$(\d+(?:\.\d+)?\s*(?:billion|million|B|M))/i);
    if (investmentMatch) details.push(investmentMatch[0]);
    
    // Extract percentage changes
    const percentMatch = article.content?.match(/(\d+(?:\.\d+)?%)/i);
    if (percentMatch) details.push(percentMatch[0]);
    
    return details;
  };
  
  const details = extractDetails(fullText);
  
  if (fullText.includes('nvidia') || fullText.includes('nvda')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `英伟达${fullText.includes('chip') ? '芯片' : ''}${fullText.includes('earnings') ? '财报' : ''}最新动态${detailsStr}`;
    why_it_matters_zh = '如果你持有 NVDA 股票或期权，或从事 AI 基础设施相关工作，这条新闻值得关注';
  } else if (fullText.includes('openai') || fullText.includes('chatgpt')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `OpenAI 最新动态${detailsStr}`;
    why_it_matters_zh = 'OpenAI 的产品和战略变化可能影响 AI 工程师的技能需求和薪资水平';
  } else if (fullText.includes('meta') || fullText.includes('facebook')) {
    summary_zh = 'Meta 最新动态';
    why_it_matters_zh = 'Meta 的业务调整可能影响湾区就业市场和 AI/VR 岗位需求';
  } else if (fullText.includes('google') || fullText.includes('alphabet') || fullText.includes('gemini')) {
    summary_zh = 'Google 最新动态';
    why_it_matters_zh = 'Google 的产品和组织变化可能影响云计算和 AI 工程师的就业机会';
  } else if (fullText.includes('microsoft') || fullText.includes('azure')) {
    summary_zh = '微软最新动态';
    why_it_matters_zh = '微软的云服务和 AI 战略可能影响相关岗位需求和薪资水平';
  } else if (fullText.includes('amazon') || fullText.includes('aws')) {
    summary_zh = '亚马逊最新动态';
    why_it_matters_zh = 'AWS 的业务变化可能影响云计算工程师的就业机会和薪资';
  } else if (fullText.includes('apple')) {
    summary_zh = '苹果最新动态';
    why_it_matters_zh = '苹果的产品和战略变化可能影响iOS开发和硬件工程师的需求';
  } else if (fullText.includes('layoff') || fullText.includes('job cut')) {
    summary_zh = '科技公司裁员消息';
    why_it_matters_zh = '裁员信号可能预示就业市场降温，跳槽和谈 offer 需要更谨慎';
  } else if (fullText.includes('hiring') || fullText.includes('job')) {
    summary_zh = '科技公司招聘动态';
    why_it_matters_zh = '招聘信号可能预示就业市场升温，是谈 offer 和跳槽的好时机';
  } else if (fullText.includes('ai') || fullText.includes('artificial intelligence')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `AI 行业最新进展${detailsStr}`;
    why_it_matters_zh = 'AI 技术的发展可能创造新的就业机会或改变现有岗位的技能要求';
  } else if (fullText.includes('chip') || fullText.includes('semiconductor')) {
    summary_zh = '芯片行业动态';
    why_it_matters_zh = '芯片供应链变化可能影响硬件和系统工程师的就业前景';
  }
  
  return {
    title: article.title || 'Untitled',
    url: article.url,
    source_name: article.source?.name || 'Unknown',
    snippet: article.description || article.content?.substring(0, 200) || '',
    summary_zh,
    why_it_matters_zh,
    published_at: article.publishedAt || new Date().toISOString(),
    as_of: new Date().toISOString(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers (frontend on manus.space, backend on vercel.app)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Check for cache bypass parameter
    const nocache = req.query.nocache === '1' || req.query.nocache === 'true';
    const cacheKey = 'ai_news';
    const cached = cache.get(cacheKey);
    const now = Date.now();
    
    // Calculate cache metadata
    let cacheAgeSeconds = 0;
    let cacheExpiresInSeconds = Math.floor(CACHE_TTL / 1000);
    
    if (cached) {
      cacheAgeSeconds = Math.floor((now - cached.timestamp) / 1000);
      const remainingMs = CACHE_TTL - (now - cached.timestamp);
      cacheExpiresInSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    }
    
    // Return cached data if valid and not bypassed
    if (!nocache && cached && now - cached.timestamp < CACHE_TTL) {
      const cachedData = cached.data;
      // Ensure cached response has standard structure
      if (!cachedData.status) {
        // Migrate old cache format to new format
        cachedData.status = cachedData.items?.length > 0 ? "ok" : (cachedData.error ? "unavailable" : "ok");
        cachedData.items = cachedData.items || cachedData.news || [];
        cachedData.count = cachedData.count ?? cachedData.items.length;
        cachedData.asOf = cachedData.asOf || cachedData.fetched_at || new Date().toISOString();
        cachedData.source = cachedData.source || SOURCE_INFO.NEWSAPI;
        cachedData.ttlSeconds = cachedData.ttlSeconds || Math.floor(CACHE_TTL / 1000);
      }
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cacheAgeSeconds,
        cache_expires_in_seconds: cacheExpiresInSeconds,
      });
    }
    
    // Log cache bypass
    if (nocache) {
      console.log('[API /api/ai-news] Cache bypass requested via ?nocache=1');
    }
    
    // Check if NEWS_API_KEY is configured
    if (!NEWS_API_KEY) {
      console.warn('[API /api/ai-news] NEWS_API_KEY not configured');
      const fetchedAtISO = new Date().toISOString();
      const response: any = {
        // Standard response structure
        status: 'unavailable' as const,
        items: [],
        count: 0,
        asOf: fetchedAtISO,
        source: {
          name: 'NewsAPI.org',
          ...SOURCE_INFO.NEWSAPI,
        },
        ttlSeconds: 0, // No caching for unavailable
        error: 'NEWS_API_KEY not configured. Get your free API key at https://newsapi.org/register',
        cache_hit: false,
        fetched_at: fetchedAtISO,
        debug: {
          reason: 'NEWS_API_KEY not configured',
          total_fetched: 0,
          filtered_out: 0,
        },
        // Legacy fields for backward compatibility
        news: [],
        updated_at: new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        message: 'To enable AI news, add NEWS_API_KEY to Vercel environment variables. See NEWSAPI_SETUP.md for instructions.',
      };
      
      // Don't cache error state - allow retry after key is added
      return res.status(200).json(response);
    }
    
    // Fetch fresh news from NewsAPI.org
    // Use targeted queries for AI/tech news
    const queries = [
      'OpenAI OR ChatGPT',
      'NVIDIA AI',
      'Google Gemini OR DeepMind',
      'Meta AI OR Llama',
      'Microsoft Copilot',
      'tech layoffs',
      'Silicon Valley jobs',
      'artificial intelligence',
      'AI startup funding',
    ];
    
    // Use top-headlines as primary source (guaranteed to work on free tier)
    // This is more reliable than "everything" endpoint which may have restrictions
    const allArticles: any[] = [];
    const queryErrors: string[] = [];
    
    console.log('[AI News] Fetching from top-headlines (technology category)...');
    try {
      const headlines = await fetchNewsAPIHeadlines('technology', 30); // Increased to get more articles after filtering
      console.log(`[AI News] Headlines returned ${headlines.length} articles`);
      allArticles.push(...headlines);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AI News] Headlines failed:`, errorMsg);
      queryErrors.push(`headlines: ${errorMsg}`);
      
      // Fallback: Try "everything" endpoint with a single broad query
      if (allArticles.length === 0) {
        console.log('[AI News] Trying everything endpoint as fallback...');
        try {
          const articles = await fetchNewsAPIEverything('artificial intelligence OR AI technology', 10);
          console.log(`[AI News] Everything fallback returned ${articles.length} articles`);
          allArticles.push(...articles);
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
          console.error(`[AI News] Everything fallback failed:`, fallbackMsg);
          queryErrors.push(`everything_fallback: ${fallbackMsg}`);
        }
      }
    }
    
    console.log(`[AI News] Total articles fetched: ${allArticles.length}`);
    
    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueArticles: any[] = [];
    
    for (const article of allArticles) {
      if (article.url && !seen.has(article.url)) {
        seen.add(article.url);
        uniqueArticles.push(article);
      }
    }
    
    // Sort by published date (most recent first)
    uniqueArticles.sort((a, b) => {
      const aDate = new Date(a.publishedAt || 0).getTime();
      const bDate = new Date(b.publishedAt || 0).getTime();
      return bDate - aDate;
    });
    
    // Filter by allowlist and quality
    const filteredArticles = uniqueArticles.filter(isArticleValid);
    
    // Log filtering stats for debugging
    if (uniqueArticles.length > 0 && filteredArticles.length === 0) {
      const sampleDomains = uniqueArticles.slice(0, 5).map(a => {
        try {
          return new URL(a.url).hostname;
        } catch {
          return 'invalid-url';
        }
      });
      console.warn(`[AI News] All ${uniqueArticles.length} articles were filtered out. Sample domains:`, sampleDomains);
    } else {
      console.log(`[AI News] Filtered ${uniqueArticles.length} articles to ${filteredArticles.length} valid articles`);
    }
    
    // If no articles after filtering, include debug info in response
    const debugInfo = allArticles.length === 0 && queryErrors.length > 0 
      ? { query_errors: queryErrors }
      : uniqueArticles.length > 0 && filteredArticles.length === 0
      ? { 
          total_fetched: allArticles.length,
          unique_after_dedup: uniqueArticles.length,
          filtered_out: uniqueArticles.length,
          sample_domains: uniqueArticles.slice(0, 3).map(a => {
            try {
              return new URL(a.url).hostname;
            } catch {
              return 'invalid-url';
            }
          })
        }
      : undefined;
    
    // Take top 5 and enhance with Chinese summaries
    const news = filteredArticles.slice(0, 5).map(enhanceNewsItem);
    
    const fetchedAt = new Date();
    const fetchedAtISO = fetchedAt.toISOString();
    const ttlSeconds = ttlMsToSeconds(NEWS_CACHE_TTL);
    
    // Determine status
    let status: "ok" | "stale" | "unavailable" = "ok";
    if (news.length === 0) {
      status = allArticles.length === 0 ? "unavailable" : "ok"; // Empty but fetched = ok (just filtered out)
    }
    
    const response: any = {
      // Standard response structure
      status,
      items: news,
      count: news.length,
      asOf: fetchedAtISO,
      source: {
        name: 'NewsAPI.org',
        url: 'https://newsapi.org/',
      },
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      // Legacy fields for backward compatibility
      news,
      updated_at: fetchedAt.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
      age: 0,
      expiry: ttlSeconds,
    };
    
    // Add debug info if no articles found
    if (news.length === 0 && debugInfo) {
      response.debug = debugInfo;
      response.message = 'No articles found. Check debug info for details.';
      if (allArticles.length === 0) {
        response.error = 'No articles fetched from NewsAPI';
      }
    }
    
    // Update cache
    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });
    
    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/ai-news] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'ai_news';
    const stale = cache.get(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      // Ensure stale response has standard structure
      if (!staleData.status) {
        staleData.status = staleData.items?.length > 0 ? "stale" : "unavailable";
        staleData.items = staleData.items || staleData.news || [];
        staleData.count = staleData.count ?? staleData.items.length;
        staleData.asOf = staleData.asOf || staleData.fetched_at || new Date().toISOString();
        staleData.source = staleData.source || { name: 'NewsAPI.org', url: 'https://newsapi.org/' };
        staleData.ttlSeconds = staleData.ttlSeconds || ttlMsToSeconds(NEWS_CACHE_TTL);
      } else {
        staleData.status = "stale"; // Override to stale if we're using stale cache
      }
      return res.status(200).json({
        ...staleData,
        cache_hit: true,
        stale: true,
      });
    }
    
    const errorAtISO = new Date().toISOString();
    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: {
        name: 'NewsAPI.org',
        url: 'https://newsapi.org/',
      },
      ttlSeconds: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: errorAtISO,
      // Legacy fields
      news: [],
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    });
  }
}
