# API 需求清单

## 🔑 必需的 API Keys（需要环境变量）

### 1. **GOOGLE_PLACES_API_KEY** ⭐ 必需（新）
- **用途**: 食物推荐 (`/api/spend/today`)
- **获取方式**: 
  - 访问 https://console.cloud.google.com/
  - 创建项目或选择现有项目
  - 启用 "Places API"
  - 创建 API Key
  - 限制 API Key 仅用于 Places API（可选但推荐）
- **免费额度**: 
  - Text Search: $32 per 1000 requests（前 $200 免费每月）
  - Place Details: $17 per 1000 requests
- **使用场景**:
  - 中餐推荐（Cupertino/Sunnyvale/SJ）
  - 奶茶、咖啡、甜品推荐
- **环境变量**: `GOOGLE_PLACES_API_KEY`
- **Fallback**: 如果 API 失败，使用本地 seed 数据

---

### ~~**YELP_API_KEY**~~ ❌ 已移除
- **状态**: 不再使用 Yelp API
- **替代方案**: Google Places API + 本地 seed 数据作为 fallback

---

### 2. **FINNHUB_API_KEY** ⭐ 必需
- **用途**: 股票报价 (`/api/quotes`)
- **获取方式**: 
  - 访问 https://finnhub.io/
  - 注册免费账号
  - 从 dashboard 获取 API key
- **免费额度**: 60 calls/minute, 30 calls/second
- **使用场景**:
  - 持仓总览的实时股价
  - Top Movers 计算
- **环境变量**: `FINNHUB_API_KEY`
- **文档**: 见 `FINNHUB_SETUP.md`

---

### 3. **NEWS_API_KEY** ⭐ 必需
- **用途**: AI/科技新闻 (`/api/ai-news`)
- **获取方式**: 
  - 访问 https://newsapi.org/register
  - 注册免费账号
  - 获取 API key
- **免费额度**: 100 requests/day, 1 request/second
- **使用场景**:
  - 解释型市场要闻
  - 科技圈新闻
- **环境变量**: `NEWS_API_KEY`
- **文档**: 见 `NEWSAPI_SETUP.md`

---

### 4. **TMDB_API_KEY** ⚠️ 可选
- **用途**: 电视剧推荐 (`/api/shows`)
- **获取方式**: 
  - 访问 https://www.themoviedb.org/settings/api
  - 注册账号并申请 API key
- **免费额度**: 无限制（但需注册）
- **使用场景**:
  - 追剧推荐（当前未在首页使用）
- **环境变量**: `TMDB_API_KEY`

---

## 🌐 公开 API（无需 API Key）

### 1. **Hacker News Firebase API**
- **URL**: `https://hacker-news.firebaseio.com/v0`
- **用途**: 
  - 八卦 (`/api/gossip`)
  - 中文八卦 fallback (`/api/chinese-gossip`)
- **限制**: 无，公开 API
- **状态**: ✅ 已实现

---

### 2. **Reddit JSON API**
- **URL**: `https://www.reddit.com`
- **用途**: 
  - 羊毛/优惠 (`/api/deals`)
  - 中文八卦 fallback (`/api/chinese-gossip`)
- **限制**: 需要 User-Agent header
- **状态**: ✅ 已实现

---

### 3. **CoinGecko API**
- **URL**: `https://api.coingecko.com/api/v3`
- **用途**: 加密货币价格 (`/api/market` - BTC)
- **限制**: 免费 tier 有 rate limit
- **状态**: ✅ 已实现

---

### 4. **Stooq API**
- **URL**: `https://stooq.com/q/l`
- **用途**: 股票指数价格 (`/api/market` - SPY, GOLD)
- **限制**: 无，公开 CSV API
- **状态**: ✅ 已实现

---

### 5. **YouTube RSS**
- **URL**: `https://www.youtube.com/feeds/videos.xml`
- **用途**: 美股博主视频 (`/api/youtubers`)
- **限制**: 无，公开 RSS feed
- **状态**: ✅ 已实现

---

## 🚧 待实现的 API（可选）

### 1. **huaren.us** - 中文八卦核心数据源
- **类型**: Web Scraping（需要爬虫）
- **用途**: 中文八卦 (`/api/chinese-gossip`)
- **优先级**: 高（核心数据源）
- **状态**: ⏳ 待实现

---

### 2. **Blind** - 匿名职场社区
- **类型**: API 或 Web Scraping
- **用途**: 中文八卦 (`/api/chinese-gossip`)
- **优先级**: 中
- **状态**: ⏳ 待实现

---

### 3. **X/Twitter API** - 社交媒体
- **类型**: Twitter API v2
- **用途**: 中文八卦 (`/api/chinese-gossip`)
- **获取方式**: 需要 Twitter Developer 账号
- **优先级**: 低（fallback）
- **状态**: ⏳ 待实现

---

### 4. **Google Custom Search Engine (CSE)**
- **类型**: Google CSE API
- **用途**: 市场数据搜索（当前未使用）
- **获取方式**: 需要 Google Cloud 账号和 CSE ID
- **优先级**: 低
- **状态**: ⏳ 未使用

---

## 📋 环境变量配置清单

在 Vercel 或本地 `.env` 文件中需要配置：

```bash
# 必需
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
FINNHUB_API_KEY=your_finnhub_api_key_here
NEWS_API_KEY=your_newsapi_key_here

# 可选
TMDB_API_KEY=your_tmdb_api_key_here
# YELP_API_KEY=已移除，不再需要
```

---

## 🎯 功能与 API 对应关系

| 功能模块 | API 端点 | 需要的 API Key | 状态 |
|---------|---------|---------------|------|
| 持仓总览 | `/api/quotes` | FINNHUB_API_KEY | ✅ |
| 市场数据 | `/api/market` | 无（公开 API） | ✅ |
| 市场要闻 | `/api/ai-news` | NEWS_API_KEY | ✅ |
| 美股博主 | `/api/youtubers` | 无（RSS） | ✅ |
| 食物推荐 | `/api/spend/today` | GOOGLE_PLACES_API_KEY | ✅ |
| ~~食物推荐（旧）~~ | ~~`/api/food-recommendations`~~ | ~~无（本地 seed）~~ | ⚠️ 已废弃 |
| 餐厅推荐 | `/api/restaurants` | YELP_API_KEY | ⚠️ 待移除 |
| 中文八卦 | `/api/chinese-gossip` | 无（公开 API fallback） | ✅ |
| 电视剧 | `/api/shows` | TMDB_API_KEY | ⚠️ 可选 |
| 羊毛/优惠 | `/api/deals` | 无（Reddit） | ✅ |

---

## ⚠️ 注意事项

1. **API 限制**: 
   - NewsAPI: 100 requests/day（免费 tier）
   - Finnhub: 60 calls/minute
   - 食物推荐：使用本地 seed 数据，无 API 限制

2. **缓存策略**: 
   - 所有 API 都有缓存机制，减少 API 调用
   - 缓存 TTL 见 `shared/config.ts`

3. **Fallback 机制**: 
   - 如果 API 失败，会使用 stale cache（昨日数据）
   - 确保永远有内容显示

4. **Rate Limiting**: 
   - 所有 API 调用都有超时处理
   - 并发请求有限制

---

## 🔧 快速设置指南

### 本地开发
1. 创建 `.env` 文件
2. 添加上述环境变量
3. 重启开发服务器

### Vercel 部署
1. 进入 Vercel Dashboard
2. Settings → Environment Variables
3. 添加所有必需的 API keys
4. 重新部署项目

---

## 📊 API 使用统计

当前实现的功能中：
- ✅ **3 个必需 API**: Google Places, Finnhub, NewsAPI
- ✅ **5 个公开 API**: HN, Reddit, CoinGecko, Stooq, YouTube RSS
- ✅ **1 个本地数据源**: 食物推荐（seed data，作为 fallback）
- ⏳ **3 个待实现**: huaren.us, Blind, X/Twitter
- ⚠️ **1 个可选**: TMDB
- ❌ **1 个已移除**: Yelp API
