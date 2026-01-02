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
 * Check if article is market-relevant (strict hard rules)
 * Only allows: AI芯片/云计算/大模型 | 财报/裁员/招聘 | 监管/出口管制 | 利率/宏观政策
 */
function isMarketRelevant(article: any): boolean {
  const title = article.title?.toLowerCase() || '';
  const description = article.description?.toLowerCase() || '';
  const content = article.content?.toLowerCase() || '';
  const fullText = `${title} ${description} ${content}`;
  
  // Strict required topics (must match at least one category)
  const requiredTopics = [
    // Category 1: AI 芯片 / 云计算 / 大模型
    /\b(ai chip|gpu|npu|tpu|neural processing|ai accelerator|h100|a100|b200|h200|blackwell|tensor core|semiconductor)\b/i,
    /\b(cloud computing|aws|azure|gcp|google cloud|cloud service|saas|iaas|paas|cloud infrastructure|microsoft cloud)\b/i,
    /\b(large language model|llm|gpt-?[0-9]|gemini|claude|foundation model|multimodal model|ai model|chatgpt|openai)\b/i,
    
    // Category 2: 科技公司财报 / 裁员 / 招聘
    /\b(earnings|quarterly|q[1-4]|fy\d{4}|financial results|revenue|profit|loss|guidance|eps|beat|miss|stock price|shares)\b/i,
    /\b(layoff|lay off|job cut|job cuts|workforce reduction|downsizing|restructuring|firing|termination)\b/i,
    /\b(hiring|job opening|job post|recruiting|headcount|expansion|new role|position|vacancy)\b/i,
    
    // Category 3: 科技监管 / 出口管制
    /\b(regulation|regulatory|policy|fcc|sec|ftc|antitrust|compliance|doj|justice department|lawsuit)\b/i,
    /\b(export control|trade restriction|sanction|embargo|chip ban|export ban|bureau of industry|biden|china)\b/i,
    
    // Category 4: 利率 / 宏观政策
    /\b(interest rate|fed rate|federal reserve|monetary policy|inflation|fomc|rate cut|rate hike|powell)\b/i,
    /\b(macro policy|economic policy|trade policy|tariff|trade war|stimulus|recession)\b/i,
    
    // Category 5: 主要科技公司（放宽匹配，但必须与市场相关）
    /\b(nvidia|nvda|apple|aapl|microsoft|msft|google|alphabet|goog|amazon|amzn|meta|fb|facebook|tesla|tsla)\b/i,
    /\b(tech company|technology company|silicon valley|startup|ipo|venture capital|vc funding)\b/i,
  ];
  
  // Check if matches any required topic
  const matchesRequired = requiredTopics.some(pattern => pattern.test(fullText));
  if (!matchesRequired) {
    return false;
  }
  
  // Strict excluded topics (must not match any)
  const excludedTopics = [
    // 游戏 / 消费电子评测
    /\b(game review|gaming review|gameplay|game rating|video game review|game preview)\b/i,
    /\b(product review|device review|phone review|laptop review|review:\s|hands.?on review)\b/i,
    /\b(unboxing|first impressions|vs\.|comparison review)\b/i,
    
    // 纯产品评论 / 娱乐内容
    /\b(celebrity|gossip|entertainment news|movie review|tv show review|film review)\b/i,
    /\b(sports|music|fashion|lifestyle|travel|food review)\b/i,
  ];
  
  // Check if matches any excluded topic
  const matchesExcluded = excludedTopics.some(pattern => pattern.test(fullText));
  if (matchesExcluded) {
    return false;
  }
  
  return true;
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
  
  // Generate specific "why it matters" - must mention: 股价/就业/资本/监管
  if (fullText.includes('nvidia') || fullText.includes('nvda')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `英伟达${fullText.includes('chip') ? '芯片' : ''}${fullText.includes('earnings') ? '财报' : ''}最新动态${detailsStr}`;
    if (fullText.includes('earnings') || fullText.includes('revenue') || fullText.includes('guidance')) {
      why_it_matters_zh = '财报超预期可能推高 NVDA 股价，影响 AI 概念股情绪';
    } else {
      why_it_matters_zh = '英伟达动态直接影响 AI 芯片股估值和 AI 基础设施就业';
    }
    hasSpecificReason = true;
  } else if (fullText.includes('openai') || fullText.includes('chatgpt')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `OpenAI 最新动态${detailsStr}`;
    why_it_matters_zh = 'OpenAI 产品变化影响 AI 工程师就业需求和相关公司股价';
    hasSpecificReason = true;
  } else if (fullText.includes('meta') || fullText.includes('facebook')) {
    summary_zh = 'Meta 最新动态';
    if (fullText.includes('layoff') || fullText.includes('job cut')) {
      why_it_matters_zh = 'Meta 裁员信号预示就业市场收紧，可能影响湾区岗位';
    } else if (fullText.includes('earnings') || fullText.includes('revenue')) {
      why_it_matters_zh = 'Meta 财报影响股价，反映广告和 AI 业务资本投入';
    } else {
      why_it_matters_zh = 'Meta 业务调整影响 AI/VR 岗位需求和公司估值';
    }
    hasSpecificReason = true;
  } else if (fullText.includes('google') || fullText.includes('alphabet') || fullText.includes('gemini')) {
    summary_zh = 'Google 最新动态';
    if (fullText.includes('earnings') || fullText.includes('revenue')) {
      why_it_matters_zh = 'Google 财报影响股价，反映云计算和 AI 业务资本投入';
    } else {
      why_it_matters_zh = 'Google 变化影响云计算和 AI 工程师就业机会';
    }
    hasSpecificReason = true;
  } else if (fullText.includes('microsoft') || fullText.includes('azure')) {
    summary_zh = '微软最新动态';
    if (fullText.includes('earnings') || fullText.includes('revenue')) {
      why_it_matters_zh = '微软财报影响股价，反映 Azure 和 AI 业务资本投入';
    } else {
      why_it_matters_zh = '微软云服务和 AI 战略影响相关岗位需求和公司估值';
    }
    hasSpecificReason = true;
  } else if (fullText.includes('amazon') || fullText.includes('aws')) {
    summary_zh = '亚马逊最新动态';
    if (fullText.includes('earnings') || fullText.includes('revenue')) {
      why_it_matters_zh = 'AWS 财报影响股价，反映云计算业务资本投入';
    } else {
      why_it_matters_zh = 'AWS 业务变化影响云计算工程师就业和公司估值';
    }
    hasSpecificReason = true;
  } else if (fullText.includes('apple')) {
    summary_zh = '苹果最新动态';
    if (fullText.includes('earnings') || fullText.includes('revenue')) {
      why_it_matters_zh = '苹果财报影响股价，反映硬件和 AI 业务资本投入';
    } else {
      why_it_matters_zh = '苹果产品变化影响 iOS 开发和硬件工程师就业';
    }
    hasSpecificReason = true;
  } else if (fullText.includes('layoff') || fullText.includes('job cut') || fullText.includes('workforce reduction')) {
    summary_zh = '科技公司裁员消息';
    why_it_matters_zh = '裁员信号预示就业市场降温，影响跳槽和谈 offer 时机';
    hasSpecificReason = true;
  } else if (fullText.includes('hiring') || (fullText.includes('job') && (fullText.includes('opening') || fullText.includes('post')))) {
    summary_zh = '科技公司招聘动态';
    why_it_matters_zh = '招聘信号预示就业市场升温，影响谈 offer 和跳槽时机';
    hasSpecificReason = true;
  } else if ((fullText.includes('gpu') || fullText.includes('ai chip') || fullText.includes('h100') || fullText.includes('a100')) && !fullText.includes('review')) {
    summary_zh = 'AI 芯片动态';
    why_it_matters_zh = 'AI 芯片供应影响相关公司股价和硬件工程师就业';
    hasSpecificReason = true;
  } else if (fullText.includes('cloud computing') || fullText.includes('aws') || fullText.includes('azure') || fullText.includes('gcp')) {
    summary_zh = '云计算动态';
    why_it_matters_zh = '云计算业务变化影响相关公司股价和工程师就业';
    hasSpecificReason = true;
  } else if ((fullText.includes('gpt') || fullText.includes('llm') || fullText.includes('large language model')) && !fullText.includes('review')) {
    summary_zh = '大模型动态';
    why_it_matters_zh = '大模型进展影响 AI 概念股股价和 AI 工程师就业';
    hasSpecificReason = true;
  } else if (fullText.includes('earnings') || fullText.includes('quarterly') || (fullText.includes('revenue') && fullText.includes('tech'))) {
    summary_zh = '科技公司财报';
    why_it_matters_zh = '财报数据影响股价，反映公司业绩和资本投入';
    hasSpecificReason = true;
  } else if (fullText.includes('regulation') || fullText.includes('regulatory') || fullText.includes('sec') || fullText.includes('ftc') || fullText.includes('antitrust')) {
    summary_zh = '科技监管政策';
    why_it_matters_zh = '监管政策变化影响行业发展和公司估值';
    hasSpecificReason = true;
  } else if (fullText.includes('interest rate') || fullText.includes('fed rate') || fullText.includes('federal reserve') || fullText.includes('fomc')) {
    summary_zh = '利率政策动态';
    why_it_matters_zh = '利率变化影响科技公司融资成本和估值';
    hasSpecificReason = true;
  } else if (fullText.includes('export control') || fullText.includes('trade restriction') || fullText.includes('sanction') || fullText.includes('chip ban')) {
    summary_zh = '出口管制政策';
    why_it_matters_zh = '出口管制影响科技供应链和行业格局，可能影响股价';
    hasSpecificReason = true;
  }
  
  // Fallback: use strict generic message (≤1 line, must mention market impact)
  if (!hasSpecificReason || !why_it_matters_zh) {
    why_it_matters_zh = '可能影响科技股情绪';
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
    
    // Calculate market impact score for sorting (subjective rules)
    const calculateMarketImpact = (article: any): number => {
      const title = article.title?.toLowerCase() || '';
      const description = article.description?.toLowerCase() || '';
      const content = article.content?.toLowerCase() || '';
      const fullText = `${title} ${description} ${content}`;
      
      let score = 50; // Base score
      
      // High impact: earnings, layoffs, major policy
      if (fullText.includes('earnings') || fullText.includes('quarterly') || fullText.includes('revenue')) score += 30;
      if (fullText.includes('layoff') || fullText.includes('job cut')) score += 25;
      if (fullText.includes('regulation') || fullText.includes('antitrust') || fullText.includes('export control')) score += 25;
      
      // Medium-high: major company news
      if (fullText.includes('nvidia') || fullText.includes('nvda')) score += 20;
      if (fullText.includes('openai') || fullText.includes('chatgpt')) score += 15;
      if (fullText.includes('google') || fullText.includes('alphabet') || fullText.includes('microsoft') || fullText.includes('amazon')) score += 15;
      
      // Medium: AI chip, cloud, LLM
      if (fullText.includes('gpu') || fullText.includes('ai chip') || fullText.includes('h100')) score += 10;
      if (fullText.includes('cloud computing') || fullText.includes('aws') || fullText.includes('azure')) score += 10;
      if (fullText.includes('llm') || fullText.includes('gpt') || fullText.includes('large language model')) score += 10;
      
      // Lower: hiring, general policy
      if (fullText.includes('hiring') || fullText.includes('job opening')) score += 5;
      if (fullText.includes('interest rate') || fullText.includes('fed rate')) score += 5;
      
      return score;
    };
    
    // Sort by market impact (highest first), then take top 3
    const sortedArticles = filteredArticles
      .map(article => ({ article, impact: calculateMarketImpact(article) }))
      .sort((a, b) => b.impact - a.impact)
      .map(item => item.article);
    
    const news = sortedArticles.slice(0, 3).map(enhanceNewsItem);
    
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
