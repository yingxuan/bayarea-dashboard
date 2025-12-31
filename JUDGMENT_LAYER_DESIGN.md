# Judgment Layer Design - Phase 2

## 目标

将"信息展示型 dashboard"升级为"判断型 decision dashboard"，让用户3-5分钟扫完首页后能回答：

1. **我今天的钱整体状态如何？**
2. **今天哪些事会影响我的钱或工作？**
3. **就业/薪水市场现在是偏冷还是偏热？**

## 核心原则

- ✅ 不增加模块
- ✅ 不重做 UI
- ✅ 使用 rule-based 逻辑（v1 不用 LLM）
- ✅ 判断结果写入缓存
- ✅ 中文判断句，简洁明确

---

## 模块 1：票子模块 - 市场状态判断

### 当前问题
- 只有数值，没有结论
- 用户需要自己判断涨跌的意义

### 升级方案

在模块顶部新增**判断句**（中文，一句话），回答"我今天该不该担心？"

### Rule-based 判断逻辑

```typescript
interface MarketJudgment {
  status: 'positive' | 'neutral' | 'negative';
  message: string;
  reasoning: string;
}

function generateMarketJudgment(data: FinanceData): MarketJudgment {
  const spyChange = data.indices.find(i => i.code === 'SPY')?.changePercent || 0;
  const portfolioChange = data.todayChange.percentage;
  const btcChange = data.indices.find(i => i.code === 'BTC')?.changePercent || 0;
  
  // 规则 1: 大盘与个人持仓同向大涨
  if (spyChange > 1.0 && portfolioChange > 1.5) {
    return {
      status: 'positive',
      message: '大盘与科技股齐涨，今天是赚钱的一天',
      reasoning: 'SPY > 1%, Portfolio > 1.5%'
    };
  }
  
  // 规则 2: 大盘与个人持仓同向大跌
  if (spyChange < -1.0 && portfolioChange < -1.5) {
    return {
      status: 'negative',
      message: '大盘与科技股齐跌，属于系统性下行的一天',
      reasoning: 'SPY < -1%, Portfolio < -1.5%'
    };
  }
  
  // 规则 3: 大盘涨但持仓跌（结构性）
  if (spyChange > 0.5 && portfolioChange < -0.5) {
    return {
      status: 'neutral',
      message: '大盘上涨但科技股回调，属于结构性波动',
      reasoning: 'SPY positive but portfolio negative'
    };
  }
  
  // 规则 4: 大盘跌但持仓涨（科技股抗跌）
  if (spyChange < -0.5 && portfolioChange > 0.5) {
    return {
      status: 'positive',
      message: '大盘下跌但科技股抗跌，持仓表现优于市场',
      reasoning: 'SPY negative but portfolio positive'
    };
  }
  
  // 规则 5: 波动小（平稳）
  if (Math.abs(spyChange) < 0.3 && Math.abs(portfolioChange) < 0.5) {
    return {
      status: 'neutral',
      message: '市场波动较小，今天是平稳的一天',
      reasoning: 'Low volatility day'
    };
  }
  
  // 规则 6: 加密货币大涨（风险偏好上升）
  if (btcChange > 5.0 && portfolioChange > 0) {
    return {
      status: 'positive',
      message: '加密货币大涨，风险偏好上升，科技股受益',
      reasoning: 'BTC > 5%, risk-on sentiment'
    };
  }
  
  // 默认：中性
  return {
    status: 'neutral',
    message: '市场表现正常，持仓小幅波动',
    reasoning: 'Default neutral case'
  };
}
```

### UI 展示

```
┌─────────────────────────────────────────────────┐
│ 票子 | 早日财富自由                              │
│                                                 │
│ 📊 今日判断：大盘与科技股齐涨，今天是赚钱的一天    │
│                                                 │
│ 股票市值    今日涨跌    总浮盈/浮亏    YTD        │
│ $150,000    +$2,500    +$15,000      +12.5%    │
│                                                 │
│ [SPY] [GOLD] [BTC] [Mortgage] [Powerball]      │
└─────────────────────────────────────────────────┘
```

---

## 模块 2：行业新闻 - 今日必须知道的事

### 当前问题
- 新闻偏泛，缺乏"为什么重要"
- 没有筛选机制

### 升级方案

1. **首页最多显示 4-5 条**
2. **每条必须包含**：
   - 中文一句话总结
   - Why it matters（对钱/工作/AI的影响）
3. **主题白名单**：AI / 芯片 / 云 / 大厂 / 财报 / 裁员 / 招聘 / 监管
4. **主题黑名单**：世界政治 / 战争 / 抗议

### Rule-based 筛选逻辑

```typescript
interface NewsItem {
  title: string;
  summary: string; // 中文一句话总结
  whyItMatters: string; // 为什么重要
  tags: string[];
  judgmentScore: number; // 0-100，重要性评分
  source: string;
  publishedAt: string;
}

// 主题关键词映射
const TOPIC_KEYWORDS = {
  AI: ['ai', 'gpt', 'llm', 'openai', 'anthropic', 'machine learning', 'neural'],
  芯片: ['nvidia', 'chip', 'semiconductor', 'tsmc', 'amd', 'intel'],
  云: ['aws', 'azure', 'gcp', 'cloud', 'kubernetes'],
  大厂: ['google', 'meta', 'amazon', 'apple', 'microsoft', 'tesla'],
  财报: ['earnings', 'revenue', 'profit', 'q4', 'quarterly'],
  裁员: ['layoff', 'job cut', 'downsize', 'restructure'],
  招聘: ['hiring', 'job opening', 'recruiting', 'talent'],
  监管: ['regulation', 'antitrust', 'sec', 'ftc', 'compliance']
};

const BLACKLIST_KEYWORDS = [
  'war', 'ukraine', 'russia', 'israel', 'palestine', 'protest', 
  'election', 'political', 'congress', 'senate'
];

function filterAndRankNews(rawNews: any[]): NewsItem[] {
  return rawNews
    .filter(news => {
      // 黑名单过滤
      const text = (news.title + ' ' + news.description).toLowerCase();
      if (BLACKLIST_KEYWORDS.some(kw => text.includes(kw))) {
        return false;
      }
      
      // 白名单过滤
      const hasRelevantTopic = Object.values(TOPIC_KEYWORDS)
        .flat()
        .some(kw => text.includes(kw));
      
      return hasRelevantTopic;
    })
    .map(news => {
      // 计算重要性评分
      const score = calculateJudgmentScore(news);
      
      return {
        title: news.title,
        summary: generateChineseSummary(news),
        whyItMatters: generateWhyItMatters(news),
        tags: extractTags(news),
        judgmentScore: score,
        source: news.source,
        publishedAt: news.publishedAt
      };
    })
    .sort((a, b) => b.judgmentScore - a.judgmentScore)
    .slice(0, 5); // 最多5条
}

function calculateJudgmentScore(news: any): number {
  let score = 50; // 基础分
  
  const text = (news.title + ' ' + news.description).toLowerCase();
  
  // AI 相关 +20
  if (TOPIC_KEYWORDS.AI.some(kw => text.includes(kw))) score += 20;
  
  // 大厂 +15
  if (TOPIC_KEYWORDS.大厂.some(kw => text.includes(kw))) score += 15;
  
  // 裁员/招聘 +25（直接影响就业）
  if (TOPIC_KEYWORDS.裁员.some(kw => text.includes(kw))) score += 25;
  if (TOPIC_KEYWORDS.招聘.some(kw => text.includes(kw))) score += 25;
  
  // 财报 +10
  if (TOPIC_KEYWORDS.财报.some(kw => text.includes(kw))) score += 10;
  
  // 芯片 +15
  if (TOPIC_KEYWORDS.芯片.some(kw => text.includes(kw))) score += 15;
  
  return Math.min(score, 100);
}

function generateWhyItMatters(news: any): string {
  const text = (news.title + ' ' + news.description).toLowerCase();
  
  // 规则匹配
  if (text.includes('layoff')) {
    return '可能影响就业市场和薪资谈判空间';
  }
  if (text.includes('hiring')) {
    return '就业市场转暖信号，求职者可关注相关机会';
  }
  if (text.includes('ai') && text.includes('chip')) {
    return '可能推动AI股票板块上涨，影响科技股投资决策';
  }
  if (text.includes('earnings') || text.includes('revenue')) {
    return '财报表现影响股价和期权价值';
  }
  if (text.includes('regulation')) {
    return '监管政策可能影响科技公司估值和就业';
  }
  
  return '影响湾区科技行业整体走向';
}
```

### UI 展示

```
┌─────────────────────────────────────────────────┐
│ 行业新闻 | 今日必须知道的事                        │
│                                                 │
│ 📌 OpenAI推出GPT-5预览版                        │
│    OpenAI向企业客户开放GPT-5早期访问             │
│    💡 为什么重要：可能影响AI工程师薪资水平和就业  │
│    AI · OpenAI · 就业 | 1小时前                 │
│                                                 │
│ 📌 Meta开始新一轮招聘                            │
│    Meta计划在湾区招聘500名AI工程师               │
│    💡 为什么重要：就业市场转暖信号，求职者可关注  │
│    招聘 · Meta · AI | 5小时前                   │
│                                                 │
│ ... (最多5条)                                   │
└─────────────────────────────────────────────────┘
```

---

## 模块 3：包裹模块 → 就业市场温度

### 当前问题
- 模块存在但没有信息密度
- 用户看不出市场状态

### 升级方案

首页只保留 3 个元素：
1. **市场温度**：冷 / 正常 / 热
2. **一句话判断**（中文）
3. **一条风险提示**

### Rule-based 判断逻辑

```typescript
interface JobMarketJudgment {
  temperature: 'cold' | 'normal' | 'hot';
  temperatureScore: number; // 0-100
  message: string;
  riskWarning: string;
}

function generateJobMarketJudgment(): JobMarketJudgment {
  // 数据来源（v1 使用 mock + rule-based）
  const indicators = {
    // 从新闻中统计裁员/招聘数量
    layoffCount: 2,
    hiringCount: 5,
    
    // 从财经数据推断
    techStockTrend: 'up', // SPY tech sector
    
    // 固定规则
    aiDemand: 'high', // AI 岗位需求
    seniorCompetition: 'high' // 中高级岗位竞争
  };
  
  // 计算温度分数
  let score = 50;
  
  // 招聘多于裁员 +20
  if (indicators.hiringCount > indicators.layoffCount) {
    score += 20;
  } else {
    score -= 20;
  }
  
  // 科技股上涨 +15
  if (indicators.techStockTrend === 'up') {
    score += 15;
  } else {
    score -= 15;
  }
  
  // AI 需求高 +10
  if (indicators.aiDemand === 'high') {
    score += 10;
  }
  
  // 确定温度
  let temperature: 'cold' | 'normal' | 'hot';
  let message: string;
  let riskWarning: string;
  
  if (score >= 70) {
    temperature = 'hot';
    message = 'AI 和基础设施岗位需求旺盛，薪资上涨';
    riskWarning = '热门岗位竞争激烈，注意提升差异化竞争力';
  } else if (score >= 40) {
    temperature = 'normal';
    message = '市场整体平稳，AI infra 相对稳定';
    riskWarning = 'RSU 波动增大，跳槽需关注现金比例';
  } else {
    temperature = 'cold';
    message = '中高级岗位竞争加剧，AI infra 相对稳定';
    riskWarning = '避免盲目跳槽，关注 offer 中现金与股票比例';
  }
  
  return {
    temperature,
    temperatureScore: score,
    message,
    riskWarning
  };
}
```

### UI 展示

```
┌─────────────────────────────────────────────────┐
│ 包裹 | 就业市场温度                              │
│                                                 │
│ 🌡️ 市场温度：正常 (55/100)                      │
│                                                 │
│ 📊 判断：市场整体平稳，AI infra 相对稳定         │
│                                                 │
│ ⚠️ 风险提示：RSU 波动增大，跳槽需关注现金比例    │
└─────────────────────────────────────────────────┘
```

---

## 实现策略

### v1 (当前 Phase)
- ✅ 使用 rule-based 逻辑
- ✅ Mock 数据 + 固定规则
- ✅ 结果写入内存缓存（5分钟刷新）
- ✅ 不调用 LLM

### v2 (未来)
- 定时任务（每小时）调用 LLM 生成判断
- 结果写入 SQLite/Redis
- 前端直接读取缓存

---

## 成功标准

用户3-5分钟扫完首页后，能清楚回答：

✅ **我今天的钱整体状态如何？**
   → 看票子模块的判断句

✅ **今天哪些事会影响我的钱或工作？**
   → 看行业新闻的 "why it matters"

✅ **就业/薪水市场现在是偏冷还是偏热？**
   → 看包裹模块的市场温度

---

## 工程约束

- ❌ 不允许在页面请求时调用 LLM
- ✅ 判断逻辑在 server-side 执行
- ✅ 结果缓存 5 分钟
- ✅ 不新增页面，不重排导航
- ✅ 保持现有 UI 风格（Data Punk）
