# 湾区码农每日决策仪表盘 - Product Structure & Technical Design

**Author:** Manus AI  
**Date:** December 30, 2025

---

## Executive Summary

This document outlines the complete product structure, API interfaces, judgment layer architecture, and caching design for the **Bay Area Engineer's Daily Decision Dashboard** (湾区码农每日决策仪表盘). The application is designed as a judgment-based information hub that helps Chinese software engineers in the San Francisco Bay Area make quick daily decisions about their finances, career, and lifestyle within 3-5 minutes.

**Core Value Proposition:** Replace information overload with curated, judged, and actionable insights. Users should know immediately: How is my money doing? What's happening at work? What's worth my attention today?

---

## Product Positioning

### Target Users

- Chinese software engineers, data scientists, and AI practitioners in the San Francisco Bay Area
- Professionals with stock/RSU compensation, concerned about mortgage rates, salary offers, daily expenses, and deals
- Usage pattern: Chinese-first, quick scanning during fragmented time, no desire to filter information themselves

### Core Value

- **Judgment over aggregation**: Filter and decide for users, not just pile up content
- **3-5 minute dashboard**: Users scan the homepage and immediately understand today's money status, job market, and lifestyle opportunities
- **Decision support tool**: Not a forum, not a feed, but a judgment + dashboard product

---

## Global Principles

### Content Strategy

1. **Extreme restraint on homepage**: Every module has a hard cap, quality over quantity
2. **Chinese-first**: English only as secondary information
3. **Mobile-first design**: PC as enhanced experience
4. **No expand/collapse**: No infinite scroll
5. **No page-time LLM calls**: Prevent quota explosion

### LLM Usage Rules (Critical)

- **LLM as "slow thinking layer"**: Gemini/OpenAI only for batch processing
- **Scheduled tasks only**: LLM called by cron jobs in batches
- **Results cached**: Write to Redis/DB/SQLite
- **Frontend reads cache only**: Never call LLM during page requests
- **Dev environment**: LLM disabled by default, use mock/historical cache

---

## Information Architecture

### Top Navigation

```
主页 | 房子 | 票子 | 包裹 | 吃喝 | 税 | 羊毛 | 吃瓜
```

**Terminology:**
- **包裹** (Package) = Salary offers / Market compensation temperature (not delivery packages)
- **羊毛** (Wool) = Practical deals for Bay Area engineers
- **吃瓜** (Gossip) = Chinese community gossip / hot forum posts

---

## Homepage Module Design

### A. 票子 | Early Financial Freedom

**Question answered:** How is my money doing today?

**Display on homepage:**

| Metric | Description |
|--------|-------------|
| Stock Market Value | Renamed from "Total Assets" |
| Today's Change | $ amount + % change |
| Total Unrealized Gain/Loss | Floating profit/loss |
| YTD % | Year-to-date percentage |

**Indices & Assets (separate display, not cramped in one line):**

- SPY (S&P 500 ETF)
- Gold
- BTC (Bitcoin)
- California Jumbo Loan 7/1 ARM
- Powerball Jackpot

**Additional Content:**

- **US Stock Finance YouTubers**: Latest videos (max 6)
- **Stock Market Breaking News**: Max 3 items, with Chinese summary + "why it matters"

---

### B. 行业新闻 | Today's Events Affecting Money & Work

**Question answered:** What tech/AI/big tech events should I know about today?

**Rules:**

- Display only 4-5 items
- Must be: AI / chips / cloud / big tech / earnings / layoffs/hiring / regulation
- Must output in Chinese:
  - `summary_zh` (one sentence)
  - `why_it_matters_zh` (why it affects money/work)

**Prohibited:**

- World politics, wars, protests, social news
- Unless directly impacting tech stocks (e.g., chip bans, antitrust rulings)

**Additional:**

- Tech news YouTube summary videos (3-4 items)

---

### C. 吃喝玩乐 | Eat, Drink, Play

**Question answered:** Where to eat today / what to order after work without thinking?

**Eat & Bubble Tea:**

| Category | Radius | Top Count | Layout |
|----------|--------|-----------|--------|
| Chinese Food | 10 miles | Top 4 | PC: Left 4-grid |
| Bubble Tea | 5 miles | Top 4 | PC: Right 4-grid |

- Data sources: Google Places + Yelp (fusion ranking)
- Mobile: Stacked vertically
- Card images must have consistent aspect ratio

**Binge Watch:**

- Vertical cards, max 3 items
- No carousel

**Gossip (吃瓜):**

- Vertical text list, 8-10 items
- No images, no carousel

---

### D. 遍地羊毛 | Deals Everywhere

**Question answered:** What's worth saving money on today?

**Rules:**

- No categories, no tabs
- All deals in one feed
- Homepage max 12 items

**Display:**

- Card uses source site image (og:image / favicon)
- Title + discount/price key information

---

## Data Sources

### Specified Sources (Must Use)

| Module | Source URL |
|--------|-----------|
| Deals (羊毛) | https://huaren.us/showforum.html?forumid=395 |
| Gossip (吃瓜) | https://huaren.us/showforum.html?forumid=398 |
| Industry News | Not just Hacker News - use RSS / Google News RSS query |

**Final presentation:** Must be in Chinese + judgment

---

## Judgment Layer (Core Architecture)

### Overview

Implement server-side judgment layer with caching + scheduled tasks to filter and rank content intelligently.

### 1. Industry News Judgment

**Process:**

```
Fetch 30-60 candidate articles
    ↓
LLM batch call (one request)
    ↓
Output top 4-5 articles with:
    - summary_zh
    - why_it_matters_zh
    - tags
    - relevance_score
    ↓
Cache results (6-12 hours TTL)
```

### 2. Deals Filtering (Most Important)

**Goal:** Filter "worth displaying deals" from Huaren deal posts

**Scoring Algorithm (0-100 points):**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Practicality | 40% | Food delivery, fast food, groceries, gas, internet, mobile, insurance, flights/hotels, commute, electronics, kids products |
| Discount Strength | 25% | Signals: $, %, BOGO, free, cashback, coupon |
| Timeliness | 20% | Priority for posts within 72 hours |
| Popularity | 15% | Reply count / view count |

**Filtering Rules:**

- Remove expired deals
- Remove pure ads/traffic bait
- Remove posts without clear offers
- Merge duplicate content

**Caching Strategy:**

```
Key format: deals:YYYY-MM-DD
TTL: 6-12 hours
Fallback: Use previous cache on failure
```

---

## API Interface Design

### API Endpoints

#### 1. GET /api/finance/overview

**Description:** Get financial overview including indices and assets

**Response Schema:**

```json
{
  "stockMarketValue": {
    "value": 150000,
    "currency": "USD"
  },
  "todayChange": {
    "amount": 2500,
    "percentage": 1.67
  },
  "totalUnrealizedGainLoss": {
    "amount": 15000,
    "percentage": 11.11
  },
  "ytdPercentage": 18.5,
  "indices": [
    {
      "symbol": "SPY",
      "name": "S&P 500 ETF",
      "value": 478.32,
      "change": 1.25,
      "changePercent": 0.26
    },
    {
      "symbol": "GOLD",
      "name": "Gold",
      "value": 2078.50,
      "change": -5.30,
      "changePercent": -0.25
    },
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "value": 42350.00,
      "change": 850.00,
      "changePercent": 2.05
    },
    {
      "symbol": "CA_JUMBO_ARM",
      "name": "California Jumbo Loan 7/1 ARM",
      "value": 6.875,
      "change": -0.125,
      "changePercent": -1.79
    },
    {
      "symbol": "POWERBALL",
      "name": "Powerball Jackpot",
      "value": 485000000,
      "change": 0,
      "changePercent": 0
    }
  ],
  "lastUpdated": "2025-12-30T19:24:08Z"
}
```

#### 2. GET /api/finance/videos

**Description:** Get latest finance YouTuber videos

**Response Schema:**

```json
{
  "videos": [
    {
      "id": "abc123",
      "title": "今日美股分析：科技股大涨原因解读",
      "thumbnail": "https://img.youtube.com/vi/abc123/mqdefault.jpg",
      "channel": "美股投资频道",
      "publishedAt": "2025-12-30T08:00:00Z",
      "url": "https://youtube.com/watch?v=abc123"
    }
  ],
  "lastUpdated": "2025-12-30T19:00:00Z"
}
```

#### 3. GET /api/finance/breaking-news

**Description:** Get breaking stock market news

**Response Schema:**

```json
{
  "news": [
    {
      "id": "news001",
      "title": "英伟达发布新一代AI芯片",
      "summary_zh": "英伟达今日发布H200芯片，性能提升40%",
      "why_it_matters_zh": "可能推动AI股票板块上涨，影响科技股投资决策",
      "source": "Bloomberg",
      "url": "https://bloomberg.com/...",
      "publishedAt": "2025-12-30T10:30:00Z",
      "relevanceScore": 95
    }
  ],
  "lastUpdated": "2025-12-30T19:00:00Z"
}
```

#### 4. GET /api/industry-news

**Description:** Get judged industry news (AI, chips, cloud, big tech)

**Response Schema:**

```json
{
  "news": [
    {
      "id": "tech001",
      "title": "OpenAI推出GPT-5预览版",
      "summary_zh": "OpenAI向企业客户开放GPT-5早期访问",
      "why_it_matters_zh": "可能影响AI工程师薪资水平和就业市场需求",
      "tags": ["AI", "OpenAI", "就业"],
      "source": "TechCrunch",
      "url": "https://techcrunch.com/...",
      "publishedAt": "2025-12-30T09:15:00Z",
      "relevanceScore": 92
    }
  ],
  "lastUpdated": "2025-12-30T18:30:00Z"
}
```

#### 5. GET /api/industry-news/videos

**Description:** Get tech news YouTube summary videos

**Response Schema:**

```json
{
  "videos": [
    {
      "id": "tech123",
      "title": "本周科技新闻总结：AI行业大事件",
      "thumbnail": "https://img.youtube.com/vi/tech123/mqdefault.jpg",
      "channel": "科技速递",
      "publishedAt": "2025-12-30T07:00:00Z",
      "url": "https://youtube.com/watch?v=tech123"
    }
  ],
  "lastUpdated": "2025-12-30T18:30:00Z"
}
```

#### 6. GET /api/food/chinese

**Description:** Get top Chinese restaurants near user location

**Query Parameters:**
- `lat`: Latitude
- `lng`: Longitude
- `radius`: Radius in miles (default: 10)

**Response Schema:**

```json
{
  "restaurants": [
    {
      "id": "rest001",
      "name": "川味轩",
      "rating": 4.6,
      "reviewCount": 523,
      "priceLevel": 2,
      "cuisine": "Sichuan",
      "address": "123 Main St, San Francisco, CA",
      "distance": 2.3,
      "photo": "https://maps.googleapis.com/...",
      "url": "https://www.google.com/maps/place/..."
    }
  ],
  "lastUpdated": "2025-12-30T19:00:00Z"
}
```

#### 7. GET /api/food/bubble-tea

**Description:** Get top bubble tea shops near user location

**Query Parameters:**
- `lat`: Latitude
- `lng`: Longitude
- `radius`: Radius in miles (default: 5)

**Response Schema:**

```json
{
  "shops": [
    {
      "id": "shop001",
      "name": "Happy Lemon",
      "rating": 4.5,
      "reviewCount": 312,
      "priceLevel": 1,
      "address": "456 Market St, San Francisco, CA",
      "distance": 0.8,
      "photo": "https://maps.googleapis.com/...",
      "url": "https://www.google.com/maps/place/..."
    }
  ],
  "lastUpdated": "2025-12-30T19:00:00Z"
}
```

#### 8. GET /api/entertainment/shows

**Description:** Get recommended shows for binge-watching

**Response Schema:**

```json
{
  "shows": [
    {
      "id": "show001",
      "title": "繁花",
      "description": "90年代上海商战故事",
      "poster": "https://image.tmdb.org/...",
      "rating": 8.5,
      "platform": "腾讯视频",
      "url": "https://v.qq.com/..."
    }
  ],
  "lastUpdated": "2025-12-30T18:00:00Z"
}
```

#### 9. GET /api/entertainment/gossip

**Description:** Get hot gossip posts from Huaren forum

**Response Schema:**

```json
{
  "posts": [
    {
      "id": "gossip001",
      "title": "湾区某大厂又裁员了",
      "excerpt": "听说这次裁员规模不小...",
      "replyCount": 156,
      "viewCount": 3420,
      "url": "https://huaren.us/showtopic.html?topicid=...",
      "publishedAt": "2025-12-30T14:30:00Z",
      "hotScore": 88
    }
  ],
  "lastUpdated": "2025-12-30T19:00:00Z"
}
```

#### 10. GET /api/deals

**Description:** Get judged and filtered deals

**Response Schema:**

```json
{
  "deals": [
    {
      "id": "deal001",
      "title": "Costco汽油优惠：每加仑便宜$0.30",
      "description": "使用Costco信用卡额外返现4%",
      "category": "gas",
      "discountInfo": {
        "type": "price_off",
        "value": 0.30,
        "unit": "per_gallon"
      },
      "score": 92,
      "practicalityScore": 38,
      "discountScore": 24,
      "timelinessScore": 18,
      "popularityScore": 12,
      "source": "huaren.us",
      "sourceImage": "https://huaren.us/favicon.ico",
      "url": "https://huaren.us/showtopic.html?topicid=...",
      "expiresAt": "2025-12-31T23:59:59Z",
      "publishedAt": "2025-12-30T10:00:00Z"
    }
  ],
  "lastUpdated": "2025-12-30T19:00:00Z"
}
```

---

## Scheduled Tasks & Caching Design

### Task Schedule

| Task | Frequency | Description |
|------|-----------|-------------|
| Finance data update | Every 5 minutes during market hours | Fetch SPY, Gold, BTC, mortgage rates, Powerball |
| Finance videos update | Every 2 hours | Fetch latest finance YouTuber videos |
| Breaking news update | Every 15 minutes | Fetch and judge stock market breaking news |
| Industry news judgment | Every 1 hour | Fetch 30-60 articles, LLM batch judge, cache top 4-5 |
| Industry videos update | Every 2 hours | Fetch tech news YouTube videos |
| Deals judgment | Every 4 hours | Scrape Huaren deals, LLM judge and score, cache top 12 |
| Gossip update | Every 1 hour | Scrape Huaren gossip forum, cache top 8-10 |
| Restaurant data update | Every 6 hours | Update Google Places + Yelp data for Chinese restaurants |
| Bubble tea data update | Every 6 hours | Update Google Places + Yelp data for bubble tea shops |
| Shows update | Every 12 hours | Update recommended shows |

### Cache Structure

**SQLite Database Schema:**

```sql
-- Cache table
CREATE TABLE cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Index for expiration cleanup
CREATE INDEX idx_cache_expires_at ON cache(expires_at);

-- Judgment history table
CREATE TABLE judgment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,  -- 'news', 'deals', etc.
    item_id TEXT NOT NULL,
    score INTEGER,
    metadata TEXT,  -- JSON
    created_at INTEGER NOT NULL
);

-- Index for querying history
CREATE INDEX idx_judgment_history_type_created ON judgment_history(type, created_at);
```

**Cache Key Format:**

```
finance:overview
finance:videos
finance:breaking_news
industry:news
industry:videos
food:chinese:{lat}:{lng}
food:bubble_tea:{lat}:{lng}
entertainment:shows
entertainment:gossip
deals:YYYY-MM-DD
```

### Fallback Strategy

```
1. Try to read from cache
2. If cache miss or expired:
   a. Try to fetch fresh data
   b. If fetch fails:
      - Use stale cache if available
      - Use mock data as last resort
3. Log all failures for monitoring
```

---

## UI/UX Requirements

### Mobile-First Design

- Prioritize mobile experience, avoid excessive whitespace
- Left-right modules must align at top
- Card images must have consistent aspect ratio (`object-fit: cover`)
- If carousel is used, left-right buttons must be functional
- No expand/collapse UI patterns

### Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 640px | Single column, stacked |
| Tablet | 640px - 1024px | Flexible 2-column where appropriate |
| Desktop | > 1024px | Multi-column grid, side-by-side modules |

---

## Technology Stack

### Frontend
- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui
- **Routing**: Wouter
- **State Management**: React Context + Hooks

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript
- **Caching**: SQLite (file-based cache)
- **Scraping**: Axios + Cheerio
- **Scheduled Tasks**: node-cron

### Data Sources
- **Stock Data**: Alpha Vantage API / Yahoo Finance API
- **Crypto Data**: CoinGecko API
- **Mortgage Rates**: Freddie Mac API
- **Lottery**: Powerball official API
- **YouTube**: YouTube Data API v3
- **News**: Google News RSS / NewsAPI
- **Restaurants**: Google Places API + Yelp Fusion API
- **Forum Scraping**: Huaren.us (web scraping)

---

## Development Workflow

### Phase 1: Design & Architecture ✓
- Product structure definition
- API interface design
- Judgment layer architecture
- Caching strategy

### Phase 2: Backend Implementation
- Set up Express server with TypeScript
- Implement SQLite caching layer
- Build data fetching modules for each source
- Implement judgment algorithms
- Set up scheduled tasks with node-cron

### Phase 3: Frontend Implementation
- Design system and component library
- Build homepage with all modules
- Implement responsive layouts
- Connect to backend APIs
- Add loading states and error handling

### Phase 4: Testing & Optimization
- Test all API endpoints
- Verify scheduled tasks execution
- Test mobile responsiveness
- Optimize performance
- Add monitoring and logging

### Phase 5: Documentation
- README with setup instructions
- API documentation
- Deployment guide
- Maintenance guide

---

## Success Metrics

### User Experience
- Homepage loads in < 2 seconds
- All data refreshes within defined intervals
- Mobile-first design with no layout issues
- 3-5 minute scan time for complete homepage

### Technical Performance
- API response time < 500ms (cache hits)
- Cache hit rate > 90%
- Scheduled tasks complete within allocated time
- LLM costs stay within budget (batch processing only)

---

## Risk Mitigation

### LLM Cost Control
- Batch processing only via scheduled tasks
- Never call LLM during page requests
- Use mock data in development
- Set daily quota limits

### Data Source Reliability
- Multiple fallback layers (fresh → stale cache → mock)
- Monitor all external API failures
- Log scraping errors for manual review

### Scraping Stability
- Respect robots.txt
- Add delays between requests
- Handle HTML structure changes gracefully
- Store HTML snapshots for debugging

---

## Conclusion

This design document provides a comprehensive blueprint for building the Bay Area Engineer's Daily Decision Dashboard. The architecture prioritizes judgment over aggregation, speed over completeness, and actionable insights over information overload. By implementing a robust caching layer, intelligent scheduled tasks, and a mobile-first UI, we create a tool that truly serves the daily decision-making needs of Bay Area Chinese software engineers.

---

**Next Steps:**
1. Implement backend API server with caching
2. Build judgment algorithms and scheduled tasks
3. Create frontend UI with mobile-first design
4. Test and iterate based on real usage
5. Deploy and monitor performance

---

*Document Version: 1.0*  
*Last Updated: December 30, 2025*
