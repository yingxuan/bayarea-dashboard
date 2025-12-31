/**
 * API Endpoint: /api/ai-news
 * Returns real-time AI/Tech industry news from Google CSE with caching
 */

import { Router } from 'express';
import { getCache, setCache, getStaleCache } from './cacheDB';
import { getAINews } from './googleCSE';

const router = Router();

const CACHE_KEY = 'ai_news';
const CACHE_TTL = 30 * 60; // 30 minutes

interface NewsItem {
  title: string;
  url: string;
  source_name: string;
  snippet: string;
  summary_zh?: string;
  why_it_matters_zh?: string;
  published_at?: string;
}

interface NewsResponse {
  news: NewsItem[];
  updated_at: string;
  cache_hit: boolean;
}

/**
 * Generate Chinese summary and why-it-matters for news
 * (Simple rule-based for v1, can be enhanced with LLM later)
 */
function enhanceNewsItem(item: NewsItem): NewsItem {
  const title = item.title.toLowerCase();
  const snippet = item.snippet.toLowerCase();
  
  // Generate summary_zh based on keywords
  let summary_zh = item.title;
  let why_it_matters_zh = '可能影响科技行业发展趋势';
  
  if (title.includes('nvidia') || title.includes('nvda') || snippet.includes('nvidia')) {
    summary_zh = `英伟达${title.includes('chip') ? '芯片' : ''}${title.includes('earnings') ? '财报' : ''}最新动态`;
    why_it_matters_zh = '如果你持有 NVDA 股票或期权，或从事 AI 基础设施相关工作，这条新闻值得关注';
  } else if (title.includes('openai') || snippet.includes('openai')) {
    summary_zh = 'OpenAI 最新动态';
    why_it_matters_zh = 'OpenAI 的产品和战略变化可能影响 AI 工程师的技能需求和薪资水平';
  } else if (title.includes('meta') || title.includes('facebook')) {
    summary_zh = 'Meta 最新动态';
    why_it_matters_zh = 'Meta 的业务调整可能影响湾区就业市场和 AI/VR 岗位需求';
  } else if (title.includes('google') || title.includes('alphabet')) {
    summary_zh = 'Google 最新动态';
    why_it_matters_zh = 'Google 的产品和组织变化可能影响云计算和 AI 工程师的就业机会';
  } else if (title.includes('microsoft') || title.includes('azure')) {
    summary_zh = '微软最新动态';
    why_it_matters_zh = '微软的云服务和 AI 战略可能影响相关岗位需求和薪资水平';
  } else if (title.includes('layoff') || title.includes('job cut') || snippet.includes('layoff')) {
    summary_zh = '科技公司裁员消息';
    why_it_matters_zh = '裁员信号可能预示就业市场降温，跳槽和谈 offer 需要更谨慎';
  } else if (title.includes('hiring') || title.includes('job') || snippet.includes('hiring')) {
    summary_zh = '科技公司招聘动态';
    why_it_matters_zh = '招聘信号可能预示就业市场升温，是谈 offer 和跳槽的好时机';
  } else if (title.includes('ai') || snippet.includes('artificial intelligence')) {
    summary_zh = 'AI 行业最新进展';
    why_it_matters_zh = 'AI 技术的发展可能创造新的就业机会或改变现有岗位的技能要求';
  }
  
  return {
    ...item,
    summary_zh,
    why_it_matters_zh,
  };
}

/**
 * GET /api/ai-news
 * Returns 4-5 recent AI/Tech industry news articles
 */
router.get('/ai-news', async (req, res) => {
  try {
    // Check cache first
    const cached = getCache(CACHE_KEY);
    if (cached) {
      console.log('[API /ai-news] Cache hit');
      return res.json({
        ...cached,
        cache_hit: true,
      });
    }

    console.log('[API /ai-news] Cache miss, fetching fresh news from Google CSE...');

    // Fetch fresh news from Google CSE
    const rawNews = await getAINews();
    
    if (rawNews.length === 0) {
      throw new Error('No news found from Google CSE');
    }

    // Enhance news with Chinese summaries
    const news = rawNews.map(enhanceNewsItem);

    const response: NewsResponse = {
      news,
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      cache_hit: false,
    };

    // Cache the result
    setCache(CACHE_KEY, response, CACHE_TTL);

    res.json(response);
  } catch (error) {
    console.error('[API /ai-news] Error:', error);

    // Try to return stale cache as fallback
    const stale = getStaleCache(CACHE_KEY);
    if (stale) {
      console.log('[API /ai-news] Returning stale cache as fallback');
      return res.json({
        ...stale,
        cache_hit: true,
        stale: true,
      });
    }

    res.status(500).json({
      error: 'Failed to fetch AI news',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
