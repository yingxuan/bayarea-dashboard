/**
 * Vercel Serverless Function: /api/ai-news
 * Fetches real-time AI/Tech news via Google Custom Search Engine
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY!;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID!;

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

async function searchGoogle(query: string, num: number = 5, dateRestrict?: string): Promise<any[]> {
  // Build URL with optional date restriction (e.g., 'd7' for past week)
  let url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=${num}&sort=date`;
  
  if (dateRestrict) {
    url += `&dateRestrict=${dateRestrict}`;
  }
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google CSE API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.items || [];
}

function enhanceNewsItem(item: any): NewsItem {
  const title = item.title.toLowerCase();
  const snippet = item.snippet.toLowerCase();
  
  // Generate Chinese summary based on keywords
  // Extract key information from title and snippet for more specific summaries
  let summary_zh = item.title;
  let why_it_matters_zh = '可能影响科技行业发展趋势';
  
  // Helper function to extract key details
  const extractDetails = (text: string) => {
    const lowerText = text.toLowerCase();
    const details: string[] = [];
    
    // Extract product names
    if (lowerText.includes('gpt-5')) details.push('GPT-5');
    if (lowerText.includes('gpt-4')) details.push('GPT-4');
    if (lowerText.includes('gemini')) details.push('Gemini');
    if (lowerText.includes('claude')) details.push('Claude');
    
    // Extract financial info
    const investmentMatch = text.match(/\$(\d+(?:\.\d+)?\s*(?:billion|million|B|M))/i);
    if (investmentMatch) details.push(investmentMatch[0]);
    
    // Extract percentage changes
    const percentMatch = text.match(/(\d+(?:\.\d+)?%)/i);
    if (percentMatch) details.push(percentMatch[0]);
    
    return details;
  };
  
  const details = extractDetails(title + ' ' + snippet);
  
  if (title.includes('nvidia') || title.includes('nvda') || snippet.includes('nvidia')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `英伟达${title.includes('chip') ? '芯片' : ''}${title.includes('earnings') ? '财报' : ''}最新动态${detailsStr}`;
    why_it_matters_zh = '如果你持有 NVDA 股票或期权，或从事 AI 基础设施相关工作，这条新闻值得关注';
  } else if (title.includes('openai') || snippet.includes('openai') || title.includes('chatgpt')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `OpenAI 最新动态${detailsStr}`;
    why_it_matters_zh = 'OpenAI 的产品和战略变化可能影响 AI 工程师的技能需求和薪资水平';
  } else if (title.includes('meta') || title.includes('facebook')) {
    summary_zh = 'Meta 最新动态';
    why_it_matters_zh = 'Meta 的业务调整可能影响湾区就业市场和 AI/VR 岗位需求';
  } else if (title.includes('google') || title.includes('alphabet') || title.includes('gemini')) {
    summary_zh = 'Google 最新动态';
    why_it_matters_zh = 'Google 的产品和组织变化可能影响云计算和 AI 工程师的就业机会';
  } else if (title.includes('microsoft') || title.includes('azure')) {
    summary_zh = '微软最新动态';
    why_it_matters_zh = '微软的云服务和 AI 战略可能影响相关岗位需求和薪资水平';
  } else if (title.includes('amazon') || title.includes('aws')) {
    summary_zh = '亚马逊最新动态';
    why_it_matters_zh = 'AWS 的业务变化可能影响云计算工程师的就业机会和薪资';
  } else if (title.includes('apple')) {
    summary_zh = '苹果最新动态';
    why_it_matters_zh = '苹果的产品和战略变化可能影响iOS开发和硬件工程师的需求';
  } else if (title.includes('layoff') || title.includes('job cut') || snippet.includes('layoff')) {
    summary_zh = '科技公司裁员消息';
    why_it_matters_zh = '裁员信号可能预示就业市场降温，跳槽和谈 offer 需要更谨慎';
  } else if (title.includes('hiring') || title.includes('job') || snippet.includes('hiring')) {
    summary_zh = '科技公司招聘动态';
    why_it_matters_zh = '招聘信号可能预示就业市场升温，是谈 offer 和跳槽的好时机';
  } else if (title.includes('ai') || snippet.includes('artificial intelligence')) {
    const detailsStr = details.length > 0 ? `（${details.join('、')}）` : '';
    summary_zh = `AI 行业最新进展${detailsStr}`;
    why_it_matters_zh = 'AI 技术的发展可能创造新的就业机会或改变现有岗位的技能要求';
  } else if (title.includes('chip') || title.includes('semiconductor')) {
    summary_zh = '芯片行业动态';
    why_it_matters_zh = '芯片供应链变化可能影响硬件和系统工程师的就业前景';
  }
  
  return {
    title: item.title,
    url: item.link,
    source_name: item.displayLink,
    snippet: item.snippet,
    summary_zh,
    why_it_matters_zh,
    published_at: item.pagemap?.metatags?.[0]?.['article:published_time'] || 
                  item.pagemap?.metatags?.[0]?.['og:updated_time'] ||
                  new Date().toISOString(),  // Fallback to current time if no date available
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
      return res.status(200).json({
        ...cached.data,
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
    
    // Fetch fresh news from Google CSE
    // Use broader queries, rely on exclusion filters to remove unwanted sources
    const queries = [
      // AI company news (past month for better coverage)
      { query: 'OpenAI news', dateRestrict: 'd30' },
      { query: 'NVIDIA AI chips', dateRestrict: 'd30' },
      { query: 'Google Gemini AI', dateRestrict: 'd30' },
      { query: 'Meta AI Llama', dateRestrict: 'd30' },
      { query: 'Microsoft Copilot AI', dateRestrict: 'd30' },
      
      // Job market & tech industry (past month)
      { query: 'tech layoffs 2025', dateRestrict: 'd30' },
      { query: 'Silicon Valley hiring', dateRestrict: 'd30' },
      
      // Broader AI/tech news (past month)
      { query: 'artificial intelligence breakthrough', dateRestrict: 'd30' },
      { query: 'AI startup funding', dateRestrict: 'd30' },
    ];
    
    // Search with multiple queries and combine results
    const allResults = await Promise.all(
      queries.map(({ query, dateRestrict }) => 
        searchGoogle(query, 3, dateRestrict).catch(err => {
          console.error(`[AI News] Query "${query}" failed:`, err.message);
          return []; // Return empty array on failure
        })
      )
    );
    
    // Flatten and deduplicate by URL
    const seen = new Set<string>();
    const uniqueResults: any[] = [];
    
    // Tier 1: Premium tech news sources (highest priority)
    const tier1Sources = [
      'techcrunch.com', 'theverge.com', 'arstechnica.com',
      'reuters.com', 'bloomberg.com', 'theinformation.com'
    ];
    
    // Tier 2: Quality tech news sources
    const tier2Sources = [
      'venturebeat.com', 'wired.com', 'engadget.com',
      'cnbc.com', 'ft.com', 'wsj.com', 'nytimes.com'
    ];
    
    // URL rejection patterns (stock quotes, symbols, finance pages)
    const rejectionPatterns = [
      '/quote/', '/quotes/', '/stock/', '/stocks/', '/symbol/',
      'finance.yahoo.com/quote', 'finance.yahoo.com/quotes',
      'google.com/finance', 'marketwatch.com/investing/stock',
      'nasdaq.com/market-activity/stocks'
    ];
    
    // Domain allowlist for news articles
    const allowedDomains = [
      'reuters.com', 'theverge.com', 'arstechnica.com',
      'techcrunch.com', 'wired.com', 'ft.com',
      'bloomberg.com', 'cnbc.com', 'wsj.com',
      'nytimes.com', 'venturebeat.com', 'engadget.com',
      'theinformation.com'
    ];
    
    // Sources to exclude (low quality, aggregators, social media, finance pages)
    const excludedSources = [
      'youtube.com', 'reddit.com', 'twitter.com', 'x.com',
      'facebook.com', 'pinterest.com',
      '1point3acres.com', '1p3a.com', 'mitbbs.com',
      'finance.yahoo.com', 'google.com/finance', 'marketwatch.com',
      'nasdaq.com', 'investing.com', 'seekingalpha.com'
    ];
    
    for (const results of allResults) {
      for (const result of results) {
        if (!seen.has(result.link)) {
          const url = result.link?.toLowerCase() || '';
          
          // Reject URLs matching rejection patterns (quote pages, stock symbols)
          const isRejected = rejectionPatterns.some(pattern => url.includes(pattern));
          
          // Reject URLs from excluded sources
          const isExcluded = excludedSources.some(source => url.includes(source));
          
          // Check if domain is in allowlist (optional - prefer but don't require)
          const isPreferred = allowedDomains.some(domain => url.includes(domain));
          
          // Include if: NOT rejected AND NOT excluded
          // Allowlist is used for sorting priority, not filtering
          if (!isRejected && !isExcluded) {
            seen.add(result.link);
            uniqueResults.push({ ...result, isPreferred });
          }
        }
      }
    }
    
    // Sort by: 1) Preferred domains first, 2) Source tier, 3) Most recent date
    uniqueResults.sort((a, b) => {
      // Preferred domains (allowlist) come first
      if (a.isPreferred && !b.isPreferred) return -1;
      if (!a.isPreferred && b.isPreferred) return 1;
      
      const aIsTier1 = tier1Sources.some(source => 
        a.link?.toLowerCase().includes(source)
      );
      const bIsTier1 = tier1Sources.some(source => 
        b.link?.toLowerCase().includes(source)
      );
      const aIsTier2 = tier2Sources.some(source => 
        a.link?.toLowerCase().includes(source)
      );
      const bIsTier2 = tier2Sources.some(source => 
        b.link?.toLowerCase().includes(source)
      );
      
      // Tier 1 sources come first
      if (aIsTier1 && !bIsTier1) return -1;
      if (!aIsTier1 && bIsTier1) return 1;
      
      // Then Tier 2 sources
      if (aIsTier2 && !bIsTier2) return -1;
      if (!aIsTier2 && bIsTier2) return 1;
      
      // Within same tier, sort by date (most recent first)
      const aDate = a.pagemap?.metatags?.[0]?.['article:published_time'] || 
                    a.pagemap?.metatags?.[0]?.['og:updated_time'] ||
                    '1970-01-01';
      const bDate = b.pagemap?.metatags?.[0]?.['article:published_time'] || 
                    b.pagemap?.metatags?.[0]?.['og:updated_time'] ||
                    '1970-01-01';
      
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    
    // Take top 5 and enhance with Chinese summaries
    const news = uniqueResults.slice(0, 5).map(enhanceNewsItem);
    
    const fetchedAt = new Date();
    const response = {
      news,
      updated_at: fetchedAt.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      fetched_at: fetchedAt.toISOString(),
      cache_hit: false,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: Math.floor(CACHE_TTL / 1000),
    };
    
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
      return res.status(200).json({
        ...stale.data,
        cache_hit: true,
        stale: true,
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch AI news',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
