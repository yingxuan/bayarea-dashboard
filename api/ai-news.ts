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

const NEWS_API_KEY = process.env.NEWS_API_KEY!;
const NEWS_CACHE_TTL = CACHE_TTL.NEWS;

interface NewsItem {
  title: string;
  url: string;
  source_name: string;
  snippet: string;
  summary_zh?: string;
  why_it_matters_zh?: string;
  published_at?: string;
  publishedAt?: string; // camelCase for client compatibility
  as_of: string; // ISO 8601 timestamp with timezone
  id?: string; // Client-expected field
  source?: string; // Client-expected field (alias for source_name)
  relevanceScore?: number; // Client-expected field
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
  '9to5google.com', // Google-focused tech news
  '9to5mac.com', // Apple-focused tech news
  'macrumors.com', // Apple news
  'androidcentral.com', // Android news
  'androidauthority.com', // Android news
  'xda-developers.com', // Android/tech news
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

// Blacklisted domains (explicitly exclude)
const BLACKLISTED_DOMAINS = [
  'marvelrivals.com', // Game website
  'eurogamer.net', // Game website
  'ign.com', // Game reviews
  'gamespot.com', // Game reviews
  'kotaku.com', // Game news
];

/**
 * Normalize title for deduplication (remove special chars, lowercase, trim)
 */
function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Classify article category: 'macro' (US economy) or 'mega' (tech giants)
 * Returns null if not market-relevant
 */
function classifyArticle(article: any): 'macro' | 'mega' | null {
  const title = article.title?.toLowerCase() || '';
  const description = article.description?.toLowerCase() || '';
  const content = article.content?.toLowerCase() || '';
  const fullText = `${title} ${description} ${content}`;
  
  // Category A: US Economic News (must match at least one)
  const macroKeywords = [
    /\b(fed|federal reserve|fomc|powell|jerome powell)\b/i,
    /\b(rate|interest rate|fed rate|rate cut|rate hike|monetary policy)\b/i,
    /\b(cpi|consumer price index|inflation|deflation|pce)\b/i,
    /\b(jobs|payroll|nonfarm payroll|unemployment|employment|jobless|initial claims)\b/i,
    /\b(gdp|gross domestic product|economic growth|recession|soft landing|hard landing)\b/i,
    /\b(treasury yield|bond yield|10-year|30-year|yield curve)\b/i,
    /\b(government shutdown|debt ceiling|fiscal policy|budget)\b/i,
  ];
  
  // Category B: Tech Giants (must match company + business keyword)
  const megaTechCompanies = [
    /\b(aapl|apple)\b/i,
    /\b(msft|microsoft)\b/i,
    /\b(nvda|nvidia)\b/i,
    /\b(goog|googl|google|alphabet)\b/i,
    /\b(amzn|amazon)\b/i,
    /\b(meta|facebook|fb)\b/i,
    /\b(tsla|tesla)\b/i,
  ];
  
  const megaBusinessKeywords = [
    /\b(earnings|quarterly|q[1-4]|fy\d{4}|revenue|profit|loss|guidance|eps|beat|miss)\b/i,
    /\b(capex|capital expenditure|investment|spending)\b/i,
    /\b(ai|artificial intelligence|chips|semiconductor|gpu|h100|a100)\b/i,
    /\b(cloud|aws|azure|gcp|cloud computing)\b/i,
    /\b(antitrust|regulation|regulatory|export controls|export ban|chip ban)\b/i,
  ];
  
  // Check for macro category
  const isMacro = macroKeywords.some(pattern => pattern.test(fullText));
  
  // Check for mega tech category (must have both company and business keyword)
  const hasMegaCompany = megaTechCompanies.some(pattern => pattern.test(fullText));
  const hasMegaBusiness = megaBusinessKeywords.some(pattern => pattern.test(fullText));
  const isMega = hasMegaCompany && hasMegaBusiness;
  
  // Excluded topics (must not match any)
  const excludedTopics = [
    /\b(game review|gaming review|gameplay|game rating|video game review)\b/i,
    /\b(product review|device review|phone review|laptop review|review:\s|hands.?on review)\b/i,
    /\b(unboxing|first impressions|vs\.|comparison review)\b/i,
    /\b(celebrity|gossip|entertainment news|movie review|tv show review)\b/i,
    /\b(sports|music|fashion|lifestyle|travel|food review)\b/i,
  ];
  
  const matchesExcluded = excludedTopics.some(pattern => pattern.test(fullText));
  if (matchesExcluded) {
    return null;
  }
  
  if (isMacro) return 'macro';
  if (isMega) return 'mega';
  return null;
}

/**
 * Check if article is market-relevant (strict hard rules)
 * Only allows: US economic news or tech giants business news
 */
function isMarketRelevant(article: any): boolean {
  return classifyArticle(article) !== null;
}

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
  
  // Check blacklist first
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    if (BLACKLISTED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
      return false;
    }
  } catch (error) {
    // Invalid URL format, reject
    console.warn(`[AI News] Invalid URL format: ${url}`, error);
    return false;
  }
  
  // Market relevance filter (check content first)
  if (!isMarketRelevant(article)) {
    return false;
  }
  
  // Check allowlist - if content is relevant, allow even if domain not in allowlist
  // This allows new/relevant tech news sources to pass through
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const isInAllowlist = ALLOWED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
    
    // If domain is in allowlist, allow
    if (isInAllowlist) {
      return true;
    }
    
    // If domain not in allowlist but content is market-relevant, allow it
    // This is more permissive - we trust content relevance over domain whitelist
    return true;
  } catch (error) {
    // Invalid URL format, reject
    console.warn(`[AI News] Invalid URL format: ${url}`, error);
    return false;
  }
}

function enhanceNewsItem(article: any): NewsItem {
  const title = article.title?.toLowerCase() || '';
  const description = article.description?.toLowerCase() || '';
  const content = article.content?.toLowerCase() || '';
  const fullText = `${title} ${description} ${content}`;
  
  // Generate Chinese summary based on keywords
  let summary_zh = article.title;
  let why_it_matters_zh = ''; // Will be set below, or use generic fallback
  
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
  let hasSpecificReason = false;
  
  // Classify article to determine "why it matters"
  const category = classifyArticle(article);
  
  // Generate specific "why it matters" - must point to: 利率/盈利预期/资本开支/监管/风险偏好
  if (category === 'macro') {
    // US Economic News
    if (fullText.includes('fed') || fullText.includes('federal reserve') || fullText.includes('fomc') || fullText.includes('powell')) {
      if (fullText.includes('rate cut') || fullText.includes('rate hike') || fullText.includes('interest rate')) {
        summary_zh = '美联储利率决策';
        why_it_matters_zh = '利率变化直接影响科技股估值和融资成本，影响大盘风险偏好';
      } else {
        summary_zh = '美联储政策动态';
        why_it_matters_zh = 'Fed 政策信号影响市场风险偏好和科技股估值';
      }
      hasSpecificReason = true;
    } else if (fullText.includes('cpi') || fullText.includes('inflation') || fullText.includes('consumer price')) {
      summary_zh = '通胀数据';
      why_it_matters_zh = '通胀数据影响 Fed 利率决策，进而影响科技股估值';
      hasSpecificReason = true;
    } else if (fullText.includes('jobs') || fullText.includes('payroll') || fullText.includes('unemployment')) {
      summary_zh = '就业数据';
      why_it_matters_zh = '就业数据影响 Fed 利率决策，影响大盘风险偏好';
      hasSpecificReason = true;
    } else if (fullText.includes('gdp') || fullText.includes('recession') || fullText.includes('soft landing')) {
      summary_zh = '经济增长数据';
      why_it_matters_zh = '经济增长预期影响市场风险偏好和科技股盈利预期';
      hasSpecificReason = true;
    } else if (fullText.includes('treasury yield') || fullText.includes('bond yield') || fullText.includes('yield curve')) {
      summary_zh = '国债收益率';
      why_it_matters_zh = '国债收益率变化影响科技股估值和风险偏好';
      hasSpecificReason = true;
    } else if (fullText.includes('government shutdown') || fullText.includes('debt ceiling')) {
      summary_zh = '财政政策';
      why_it_matters_zh = '财政政策不确定性影响市场风险偏好';
      hasSpecificReason = true;
    }
  } else if (category === 'mega') {
    // Tech Giants Business News
    if (fullText.includes('nvda') || fullText.includes('nvidia')) {
      if (fullText.includes('earnings') || fullText.includes('guidance') || fullText.includes('revenue')) {
        summary_zh = '英伟达财报';
        why_it_matters_zh = 'NVDA 财报影响 AI 概念股盈利预期和估值';
      } else if (fullText.includes('capex') || fullText.includes('capital expenditure')) {
        summary_zh = '英伟达资本开支';
        why_it_matters_zh = 'NVDA 资本开支计划影响 AI 芯片供应链和行业盈利预期';
      } else if (fullText.includes('antitrust') || fullText.includes('regulation') || fullText.includes('export controls')) {
        summary_zh = '英伟达监管动态';
        why_it_matters_zh = '监管政策影响 NVDA 业务和科技股风险偏好';
      } else {
        summary_zh = '英伟达业务动态';
        why_it_matters_zh = 'NVDA 业务变化影响 AI 概念股盈利预期';
      }
      hasSpecificReason = true;
    } else if (fullText.includes('aapl') || fullText.includes('apple')) {
      if (fullText.includes('earnings') || fullText.includes('guidance')) {
        summary_zh = '苹果财报';
        why_it_matters_zh = 'AAPL 财报影响科技股盈利预期和估值';
      } else if (fullText.includes('capex')) {
        summary_zh = '苹果资本开支';
        why_it_matters_zh = 'AAPL 资本开支影响供应链和行业盈利预期';
      } else if (fullText.includes('antitrust') || fullText.includes('regulation')) {
        summary_zh = '苹果监管动态';
        why_it_matters_zh = '监管政策影响 AAPL 业务和科技股风险偏好';
      } else {
        summary_zh = '苹果业务动态';
        why_it_matters_zh = 'AAPL 业务变化影响科技股盈利预期';
      }
      hasSpecificReason = true;
    } else if (fullText.includes('msft') || fullText.includes('microsoft')) {
      if (fullText.includes('earnings') || fullText.includes('guidance')) {
        summary_zh = '微软财报';
        why_it_matters_zh = 'MSFT 财报影响云计算和 AI 概念股盈利预期';
      } else if (fullText.includes('capex')) {
        summary_zh = '微软资本开支';
        why_it_matters_zh = 'MSFT 资本开支影响 AI 和云计算行业盈利预期';
      } else if (fullText.includes('antitrust') || fullText.includes('regulation')) {
        summary_zh = '微软监管动态';
        why_it_matters_zh = '监管政策影响 MSFT 业务和科技股风险偏好';
      } else {
        summary_zh = '微软业务动态';
        why_it_matters_zh = 'MSFT 业务变化影响科技股盈利预期';
      }
      hasSpecificReason = true;
    } else if (fullText.includes('goog') || fullText.includes('googl') || fullText.includes('google') || fullText.includes('alphabet')) {
      if (fullText.includes('earnings') || fullText.includes('guidance')) {
        summary_zh = 'Google 财报';
        why_it_matters_zh = 'GOOGL 财报影响广告和 AI 概念股盈利预期';
      } else if (fullText.includes('capex')) {
        summary_zh = 'Google 资本开支';
        why_it_matters_zh = 'GOOGL 资本开支影响 AI 和云计算行业盈利预期';
      } else if (fullText.includes('antitrust') || fullText.includes('regulation')) {
        summary_zh = 'Google 监管动态';
        why_it_matters_zh = '监管政策影响 GOOGL 业务和科技股风险偏好';
      } else {
        summary_zh = 'Google 业务动态';
        why_it_matters_zh = 'GOOGL 业务变化影响科技股盈利预期';
      }
      hasSpecificReason = true;
    } else if (fullText.includes('amzn') || fullText.includes('amazon')) {
      if (fullText.includes('earnings') || fullText.includes('guidance')) {
        summary_zh = '亚马逊财报';
        why_it_matters_zh = 'AMZN 财报影响电商和云计算概念股盈利预期';
      } else if (fullText.includes('capex')) {
        summary_zh = '亚马逊资本开支';
        why_it_matters_zh = 'AMZN 资本开支影响云计算行业盈利预期';
      } else if (fullText.includes('antitrust') || fullText.includes('regulation')) {
        summary_zh = '亚马逊监管动态';
        why_it_matters_zh = '监管政策影响 AMZN 业务和科技股风险偏好';
      } else {
        summary_zh = '亚马逊业务动态';
        why_it_matters_zh = 'AMZN 业务变化影响科技股盈利预期';
      }
      hasSpecificReason = true;
    } else if (fullText.includes('meta') || fullText.includes('facebook') || fullText.includes('fb')) {
      if (fullText.includes('earnings') || fullText.includes('guidance')) {
        summary_zh = 'Meta 财报';
        why_it_matters_zh = 'META 财报影响广告和 AI 概念股盈利预期';
      } else if (fullText.includes('capex')) {
        summary_zh = 'Meta 资本开支';
        why_it_matters_zh = 'META 资本开支影响 AI 和 VR 行业盈利预期';
      } else if (fullText.includes('antitrust') || fullText.includes('regulation')) {
        summary_zh = 'Meta 监管动态';
        why_it_matters_zh = '监管政策影响 META 业务和科技股风险偏好';
      } else {
        summary_zh = 'Meta 业务动态';
        why_it_matters_zh = 'META 业务变化影响科技股盈利预期';
      }
      hasSpecificReason = true;
    } else if (fullText.includes('tsla') || fullText.includes('tesla')) {
      if (fullText.includes('earnings') || fullText.includes('guidance')) {
        summary_zh = '特斯拉财报';
        why_it_matters_zh = 'TSLA 财报影响电动车概念股盈利预期';
      } else if (fullText.includes('capex')) {
        summary_zh = '特斯拉资本开支';
        why_it_matters_zh = 'TSLA 资本开支影响电动车行业盈利预期';
      } else if (fullText.includes('regulation')) {
        summary_zh = '特斯拉监管动态';
        why_it_matters_zh = '监管政策影响 TSLA 业务和科技股风险偏好';
      } else {
        summary_zh = '特斯拉业务动态';
        why_it_matters_zh = 'TSLA 业务变化影响科技股盈利预期';
      }
      hasSpecificReason = true;
    }
  }
  
  // Fallback: use strict generic message (≤1 line, must mention market impact)
  if (!hasSpecificReason || !why_it_matters_zh) {
    if (category === 'macro') {
      why_it_matters_zh = '可能影响大盘风险偏好';
    } else if (category === 'mega') {
      why_it_matters_zh = '可能影响科技股估值';
    } else {
      why_it_matters_zh = '可能影响大盘风险偏好/科技股估值';
    }
  }
  
  
  // Generate ID from URL or title
  const id = article.url ? article.url.split('/').pop()?.split('?')[0] || article.url : article.title?.slice(0, 50) || 'unknown';
  
  // Handle publishedAt: if missing or invalid, set to empty string (client will hide time)
  let publishedAt = article.publishedAt || '';
  if (publishedAt) {
    try {
      const date = new Date(publishedAt);
      if (isNaN(date.getTime())) {
        publishedAt = ''; // Invalid date, set to empty (client will hide)
      }
    } catch {
      publishedAt = ''; // Invalid format, set to empty (client will hide)
    }
  }
  
  return {
    title: article.title || 'Untitled',
    url: article.url,
    source_name: article.source?.name || 'Unknown',
    snippet: article.description || article.content?.substring(0, 200) || '',
    summary_zh,
    why_it_matters_zh,
    published_at: publishedAt,
    publishedAt: publishedAt, // Add camelCase version for client compatibility
    as_of: new Date().toISOString(),
    // Add client-expected fields
    id: id.substring(0, 100), // Limit length
    source: article.source?.name || 'Unknown',
    relevanceScore: 85, // Default relevance score (can be enhanced later)
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }
  
  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'ai_news';
    
    // Check cache
    const cached = getCachedData(cacheKey, NEWS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.NEWSAPI, ttlMsToSeconds(NEWS_CACHE_TTL), 'news');
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
        source: SOURCE_INFO.NEWSAPI,
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
        updated_at: formatUpdatedAt(),
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
    
    // Deduplicate by (normalized title + source)
    const seen = new Set<string>();
    const uniqueArticles: any[] = [];
    
    for (const article of allArticles) {
      if (!article.url || !article.title) {
        continue;
      }
      
      const normalizedTitle = normalizeTitle(article.title);
      const source = article.source?.name || 'unknown';
      const dedupKey = `${normalizedTitle}|${source}`;
      
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
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
      const sampleTitles = uniqueArticles.slice(0, 3).map(a => a.title?.substring(0, 60) || 'no title');
      console.warn(`[AI News] All ${uniqueArticles.length} articles were filtered out by relevance filter. Sample titles:`, sampleTitles);
      console.warn(`[AI News] This may indicate the relevance filter is too strict. Consider checking isMarketRelevant() logic.`);
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
          sample_titles: uniqueArticles.slice(0, 5).map(a => a.title?.substring(0, 80) || 'no title'),
          sample_domains: uniqueArticles.slice(0, 3).map(a => {
            try {
              return new URL(a.url).hostname;
            } catch {
              return 'invalid-url';
            }
          }),
          hint: 'All articles were filtered out by relevance filter. Try ?nocache=1 to fetch fresh data.'
        }
      : undefined;
    
    // Classify and score articles
    const classifiedArticles = filteredArticles.map(article => {
      const category = classifyArticle(article);
      const title = article.title?.toLowerCase() || '';
      const description = article.description?.toLowerCase() || '';
      const content = article.content?.toLowerCase() || '';
      const fullText = `${title} ${description} ${content}`;
      
      let score = 50; // Base score
      
      // Macro category scoring
      if (category === 'macro') {
        score += 100; // Base macro score
        // High impact macro news
        if (fullText.includes('fed') || fullText.includes('federal reserve') || fullText.includes('fomc')) score += 30;
        if (fullText.includes('rate cut') || fullText.includes('rate hike')) score += 25;
        if (fullText.includes('cpi') || fullText.includes('inflation')) score += 20;
        if (fullText.includes('jobs') || fullText.includes('payroll')) score += 20;
        if (fullText.includes('gdp') || fullText.includes('recession')) score += 15;
        if (fullText.includes('treasury yield')) score += 15;
      }
      
      // Mega tech category scoring
      if (category === 'mega') {
        score += 80; // Base mega score
        // High impact mega tech news
        if (fullText.includes('earnings') || fullText.includes('guidance')) score += 30;
        if (fullText.includes('capex') || fullText.includes('capital expenditure')) score += 25;
        if (fullText.includes('antitrust') || fullText.includes('regulation') || fullText.includes('export controls')) score += 20;
        // Company-specific scoring
        if (fullText.includes('nvda') || fullText.includes('nvidia')) score += 15;
        if (fullText.includes('aapl') || fullText.includes('apple')) score += 12;
        if (fullText.includes('msft') || fullText.includes('microsoft')) score += 12;
        if (fullText.includes('goog') || fullText.includes('google') || fullText.includes('alphabet')) score += 10;
        if (fullText.includes('amzn') || fullText.includes('amazon')) score += 10;
        if (fullText.includes('meta') || fullText.includes('facebook')) score += 10;
        if (fullText.includes('tsla') || fullText.includes('tesla')) score += 8;
      }
      
      return { article, category, score };
    });
    
    // Sort all articles by score (relevance), regardless of category
    const sortedArticles = classifiedArticles
      .sort((a, b) => b.score - a.score) // Highest score first
      .map(item => item.article);
    
    // Deduplicate by normalized(title + source) - second pass after scoring
    const seenAfterScoring = new Set<string>();
    const uniqueAfterScoring: any[] = [];
    
    for (const article of sortedArticles) {
      const normalizedTitle = normalizeTitle(article.title || '');
      const sourceName = article.source?.name || article.source_name || 'unknown';
      const dedupKey = `${normalizedTitle}|${sourceName}`.toLowerCase();
      
      if (!seenAfterScoring.has(dedupKey)) {
        seenAfterScoring.add(dedupKey);
        uniqueAfterScoring.push(article);
      }
    }
    
    // Take top 5 articles
    const selectedArticles = uniqueAfterScoring.slice(0, 5);
    
    // Enhance articles and detect duplicate "why it matters"
    const enhancedNews = selectedArticles.map(enhanceNewsItem);
    
    // Detect and handle duplicate "why it matters" messages
    const whyMattersSeen = new Map<string, number>();
    const genericVariants = [
      '可能影响科技股估值',
      '可能影响大盘风险偏好',
      '可能影响市场情绪',
      '可能影响相关行业',
    ];
    let genericIndex = 0;
    
    for (let i = 0; i < enhancedNews.length; i++) {
      const item = enhancedNews[i];
      const whyMatters = item.why_it_matters_zh || '';
      
      if (!whyMatters || whyMatters.trim() === '') {
        continue; // Skip empty
      }
      
      // Normalize for comparison (remove spaces, punctuation)
      const normalized = whyMatters
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]/g, '')
        .trim();
      
      const count = whyMattersSeen.get(normalized) || 0;
      whyMattersSeen.set(normalized, count + 1);
      
      // If duplicate (seen before), replace with generic or empty
      if (count > 0) {
        if (genericIndex < genericVariants.length) {
          // Use different generic variant
          item.why_it_matters_zh = genericVariants[genericIndex];
          genericIndex++;
        } else {
          // No more variants, set to empty (better than duplicate)
          item.why_it_matters_zh = '';
        }
        console.log(`[AI News] Duplicate "why it matters" detected for article ${i}, replaced with generic or empty`);
      }
    }
    
    const news = enhancedNews;
    
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
    setCache(cacheKey, response);
    
    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/ai-news] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'ai_news';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.NEWSAPI, ttlMsToSeconds(NEWS_CACHE_TTL), 'news');
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
