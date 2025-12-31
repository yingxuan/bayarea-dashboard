/**
 * Judgment Layer - Rule-based decision logic
 * 
 * This module provides judgment capabilities for the dashboard:
 * 1. Market status judgment (Finance module)
 * 2. News filtering and ranking (Industry News module)
 * 3. Job market temperature (Job Market module)
 */

// ============================================================================
// 1. Finance Module - Market Status Judgment
// ============================================================================

export interface MarketJudgment {
  status: 'positive' | 'neutral' | 'negative';
  message: string;
  reasoning: string;
  icon: string;
}

export interface FinanceJudgmentInput {
  spyChangePercent: number;
  portfolioChangePercent: number;
  btcChangePercent: number;
  goldChangePercent: number;
}

/**
 * Generate market judgment based on market data
 * 
 * Rules:
 * 1. SPY > 1% && Portfolio > 1.5% → Positive (齐涨)
 * 2. SPY < -1% && Portfolio < -1.5% → Negative (齐跌)
 * 3. SPY > 0.5% && Portfolio < -0.5% → Neutral (结构性)
 * 4. SPY < -0.5% && Portfolio > 0.5% → Positive (抗跌)
 * 5. |SPY| < 0.3% && |Portfolio| < 0.5% → Neutral (平稳)
 * 6. BTC > 5% && Portfolio > 0 → Positive (风险偏好)
 */
export function generateMarketJudgment(input: FinanceJudgmentInput): MarketJudgment {
  const { spyChangePercent, portfolioChangePercent, btcChangePercent, goldChangePercent } = input;
  
  // Rule 1: 大盘与个人持仓同向大涨
  if (spyChangePercent > 1.0 && portfolioChangePercent > 1.5) {
    return {
      status: 'positive',
      message: '大盘与科技股齐涨，今天是赚钱的一天',
      reasoning: `SPY ${spyChangePercent.toFixed(2)}%, Portfolio ${portfolioChangePercent.toFixed(2)}%`,
      icon: '📈'
    };
  }
  
  // Rule 2: 大盘与个人持仓同向大跌
  if (spyChangePercent < -1.0 && portfolioChangePercent < -1.5) {
    return {
      status: 'negative',
      message: '大盘与科技股齐跌，属于系统性下行的一天',
      reasoning: `SPY ${spyChangePercent.toFixed(2)}%, Portfolio ${portfolioChangePercent.toFixed(2)}%`,
      icon: '📉'
    };
  }
  
  // Rule 3: 大盘涨但持仓跌（结构性）
  if (spyChangePercent > 0.5 && portfolioChangePercent < -0.5) {
    return {
      status: 'neutral',
      message: '大盘上涨但科技股回调，属于结构性波动',
      reasoning: `SPY ${spyChangePercent.toFixed(2)}%, Portfolio ${portfolioChangePercent.toFixed(2)}%`,
      icon: '📊'
    };
  }
  
  // Rule 4: 大盘跌但持仓涨（科技股抗跌）
  if (spyChangePercent < -0.5 && portfolioChangePercent > 0.5) {
    return {
      status: 'positive',
      message: '大盘下跌但科技股抗跌，持仓表现优于市场',
      reasoning: `SPY ${spyChangePercent.toFixed(2)}%, Portfolio ${portfolioChangePercent.toFixed(2)}%`,
      icon: '💪'
    };
  }
  
  // Rule 5: 波动小（平稳）
  if (Math.abs(spyChangePercent) < 0.3 && Math.abs(portfolioChangePercent) < 0.5) {
    return {
      status: 'neutral',
      message: '市场波动较小，今天是平稳的一天',
      reasoning: `Low volatility: SPY ${spyChangePercent.toFixed(2)}%, Portfolio ${portfolioChangePercent.toFixed(2)}%`,
      icon: '😌'
    };
  }
  
  // Rule 6: 加密货币大涨（风险偏好上升）
  if (btcChangePercent > 5.0 && portfolioChangePercent > 0) {
    return {
      status: 'positive',
      message: '加密货币大涨，风险偏好上升，科技股受益',
      reasoning: `BTC ${btcChangePercent.toFixed(2)}%, risk-on sentiment`,
      icon: '🚀'
    };
  }
  
  // Rule 7: 黄金大涨（避险情绪）
  if (goldChangePercent > 2.0 && portfolioChangePercent < 0) {
    return {
      status: 'negative',
      message: '黄金大涨显示避险情绪升温，科技股承压',
      reasoning: `Gold ${goldChangePercent.toFixed(2)}%, risk-off sentiment`,
      icon: '⚠️'
    };
  }
  
  // Default: 中性
  return {
    status: 'neutral',
    message: '市场表现正常，持仓小幅波动',
    reasoning: `SPY ${spyChangePercent.toFixed(2)}%, Portfolio ${portfolioChangePercent.toFixed(2)}%`,
    icon: '📊'
  };
}

// ============================================================================
// 2. Industry News Module - Filtering and Ranking
// ============================================================================

export interface NewsItem {
  id: string;
  title: string;
  summary: string; // 中文一句话总结
  whyItMatters: string; // 为什么重要
  tags: string[];
  judgmentScore: number; // 0-100，重要性评分
  source: string;
  publishedAt: string;
  url: string;
}

// 主题关键词映射
const TOPIC_KEYWORDS = {
  AI: ['ai', 'gpt', 'llm', 'openai', 'anthropic', 'claude', 'gemini', 'machine learning', 'neural', 'chatgpt'],
  芯片: ['nvidia', 'nvda', 'chip', 'semiconductor', 'tsmc', 'amd', 'intel', 'gpu'],
  云: ['aws', 'azure', 'gcp', 'cloud', 'kubernetes', 'docker', 'serverless'],
  大厂: ['google', 'meta', 'amazon', 'apple', 'microsoft', 'msft', 'tesla', 'netflix', 'uber'],
  财报: ['earnings', 'revenue', 'profit', 'q4', 'q1', 'q2', 'q3', 'quarterly', 'beat', 'miss'],
  裁员: ['layoff', 'job cut', 'downsize', 'restructure', 'workforce reduction'],
  招聘: ['hiring', 'job opening', 'recruiting', 'talent', 'engineer position'],
  监管: ['regulation', 'antitrust', 'sec', 'ftc', 'compliance', 'lawsuit', 'fine']
};

const BLACKLIST_KEYWORDS = [
  'war', 'ukraine', 'russia', 'israel', 'palestine', 'protest', 
  'election', 'political', 'congress', 'senate', 'president', 'biden', 'trump'
];

/**
 * Calculate judgment score for a news item (0-100)
 */
export function calculateNewsJudgmentScore(title: string, description: string): number {
  let score = 50; // Base score
  
  const text = (title + ' ' + description).toLowerCase();
  
  // AI related +20
  if (TOPIC_KEYWORDS.AI.some(kw => text.includes(kw))) score += 20;
  
  // Big tech +15
  if (TOPIC_KEYWORDS.大厂.some(kw => text.includes(kw))) score += 15;
  
  // Layoff/Hiring +25 (directly affects jobs)
  if (TOPIC_KEYWORDS.裁员.some(kw => text.includes(kw))) score += 25;
  if (TOPIC_KEYWORDS.招聘.some(kw => text.includes(kw))) score += 25;
  
  // Earnings +10
  if (TOPIC_KEYWORDS.财报.some(kw => text.includes(kw))) score += 10;
  
  // Chips +15
  if (TOPIC_KEYWORDS.芯片.some(kw => text.includes(kw))) score += 15;
  
  // Cloud +10
  if (TOPIC_KEYWORDS.云.some(kw => text.includes(kw))) score += 10;
  
  // Regulation +15
  if (TOPIC_KEYWORDS.监管.some(kw => text.includes(kw))) score += 15;
  
  return Math.min(score, 100);
}

/**
 * Check if news should be filtered out (blacklist)
 */
export function shouldFilterNews(title: string, description: string): boolean {
  const text = (title + ' ' + description).toLowerCase();
  return BLACKLIST_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * Extract tags from news content
 */
export function extractNewsTags(title: string, description: string): string[] {
  const text = (title + ' ' + description).toLowerCase();
  const tags: string[] = [];
  
  for (const [tag, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      tags.push(tag);
    }
  }
  
  return tags;
}

/**
 * Generate "why it matters" explanation
 */
export function generateWhyItMatters(title: string, description: string, tags: string[]): string {
  const text = (title + ' ' + description).toLowerCase();
  
  // Priority rules
  if (text.includes('layoff') || text.includes('job cut')) {
    return '可能影响就业市场和薪资谈判空间';
  }
  
  if (text.includes('hiring') || text.includes('recruiting')) {
    return '就业市场转暖信号，求职者可关注相关机会';
  }
  
  if (tags.includes('AI') && tags.includes('芯片')) {
    return '可能推动AI股票板块上涨，影响科技股投资决策';
  }
  
  if (tags.includes('AI') && tags.includes('大厂')) {
    return '可能影响AI工程师薪资水平和就业市场需求';
  }
  
  if (text.includes('earnings') || text.includes('revenue') || text.includes('profit')) {
    return '财报表现影响股价和期权价值';
  }
  
  if (text.includes('regulation') || text.includes('antitrust')) {
    return '监管政策可能影响科技公司估值和就业';
  }
  
  if (tags.includes('云')) {
    return '云计算市场变化可能影响相关岗位需求';
  }
  
  if (tags.includes('芯片')) {
    return '芯片行业动态影响硬件工程师就业前景';
  }
  
  return '影响湾区科技行业整体走向';
}

// ============================================================================
// 3. Job Market Module - Market Temperature
// ============================================================================

export interface JobMarketJudgment {
  temperature: 'cold' | 'normal' | 'hot';
  temperatureScore: number; // 0-100
  temperatureLabel: string; // 冷/正常/热
  message: string;
  riskWarning: string;
  icon: string;
}

export interface JobMarketIndicators {
  layoffCount: number; // 最近裁员新闻数量
  hiringCount: number; // 最近招聘新闻数量
  techStockTrend: 'up' | 'down' | 'flat'; // 科技股趋势
  spyChangePercent: number; // 大盘涨跌
}

/**
 * Generate job market temperature judgment
 */
export function generateJobMarketJudgment(indicators: JobMarketIndicators): JobMarketJudgment {
  let score = 50; // Base score
  
  // Hiring vs Layoff ratio
  if (indicators.hiringCount > indicators.layoffCount * 2) {
    score += 25;
  } else if (indicators.hiringCount > indicators.layoffCount) {
    score += 15;
  } else if (indicators.layoffCount > indicators.hiringCount * 2) {
    score -= 25;
  } else if (indicators.layoffCount > indicators.hiringCount) {
    score -= 15;
  }
  
  // Tech stock trend
  if (indicators.techStockTrend === 'up') {
    score += 20;
  } else if (indicators.techStockTrend === 'down') {
    score -= 20;
  }
  
  // SPY performance
  if (indicators.spyChangePercent > 1.0) {
    score += 10;
  } else if (indicators.spyChangePercent < -1.0) {
    score -= 10;
  }
  
  // AI demand (fixed rule for v1)
  score += 10; // AI demand remains high
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Determine temperature
  let temperature: 'cold' | 'normal' | 'hot';
  let temperatureLabel: string;
  let message: string;
  let riskWarning: string;
  let icon: string;
  
  if (score >= 70) {
    temperature = 'hot';
    temperatureLabel = '热';
    message = 'AI 和基础设施岗位需求旺盛，薪资上涨';
    riskWarning = '热门岗位竞争激烈，注意提升差异化竞争力';
    icon = '🔥';
  } else if (score >= 40) {
    temperature = 'normal';
    temperatureLabel = '正常';
    message = '市场整体平稳，AI infra 相对稳定';
    riskWarning = 'RSU 波动增大，跳槽需关注现金比例';
    icon = '📊';
  } else {
    temperature = 'cold';
    temperatureLabel = '偏冷';
    message = '中高级岗位竞争加剧，AI infra 相对稳定';
    riskWarning = '避免盲目跳槽，关注 offer 中现金与股票比例';
    icon = '❄️';
  }
  
  return {
    temperature,
    temperatureScore: score,
    temperatureLabel,
    message,
    riskWarning,
    icon
  };
}
