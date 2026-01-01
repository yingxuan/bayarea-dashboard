# 全项目数据模块扫描报告

## A. 所有数据卡片/模块的 Data Fetch 入口

### 1. Market Data (票子) - P0
**组件**: `client/src/components/FinanceOverview.tsx`
**Fetch函数**: `loadData()` (line 48-159)
**API端点**: `/api/market`
**后端**: `api/market.ts`
**数据源**:
- BTC: CoinGecko API ✅
- SPY: Stooq API (CSV) ⚠️
- Gold: Stooq API (CSV) ⚠️
- Mortgage: "Unavailable" ❌
- Powerball: "Unavailable" ❌

**当前响应结构**:
```typescript
{
  data: {
    spy: { name, value, unit, source_name, source_url, as_of, debug? },
    gold: { ... },
    btc: { ... },
    mortgage: { value: "Unavailable", ... },
    powerball: { value: "Unavailable", ... }
  },
  fetched_at: string,
  cache_hit: boolean
}
```

**风险点**:
- ❌ 响应结构不统一（需要统一为 {status, value, asOf, source, ttlSeconds, error?}）
- ⚠️ SPY/Gold 使用 CSV 解析，脆弱
- ❌ Mortgage/Powerball 显示 "Unavailable" 但 UI 没有明确状态
- ⚠️ 没有超时处理
- ⚠️ 没有 fallback 数据源

---

### 2. AI News (行业新闻) - P1
**组件**: `client/src/pages/Home.tsx` → `NewsList`
**Fetch函数**: `loadAllData()` (line 34-44)
**API端点**: `/api/ai-news`
**后端**: `api/ai-news.ts`
**数据源**: NewsAPI.org (top-headlines, category=technology)

**当前响应结构**:
```typescript
{
  news: Array<{
    title, url, source_name, snippet,
    summary_zh, why_it_matters_zh,
    published_at, as_of
  }>,
  fetched_at: string,
  cache_hit: boolean,
  debug?: {...}
}
```

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 空数组时没有明确状态（ok/stale/unavailable）
- ⚠️ 没有超时处理
- ✅ 有 fallback (headlines → everything)

---

### 3. Gossip (吃瓜) - P2
**组件**: `client/src/pages/Home.tsx` → `GossipList`
**Fetch函数**: `loadAllData()` (line 73-83)
**API端点**: `/api/gossip`
**后端**: `api/gossip.ts`
**数据源**: Hacker News Firebase API ✅

**当前响应结构**:
```typescript
{
  gossip: Array<{
    id, title, url, score, comments,
    author, time_ago
  }>,
  fetched_at: string,
  cache_hit: boolean
}
```

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 没有超时处理
- ⚠️ 没有 fallback

---

### 4. Deals (遍地羊毛) - P2
**组件**: `client/src/pages/Home.tsx` → `DealsGrid`
**Fetch函数**: `loadAllData()` (line 86-96)
**API端点**: `/api/deals`
**后端**: `api/deals.ts`
**数据源**: Reddit JSON API ✅

**当前响应结构**:
```typescript
{
  deals: Array<{
    id, title, url, external_url?,
    store, score, comments, time_ago
  }>,
  fetched_at: string,
  cache_hit: boolean
}
```

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 没有超时处理
- ⚠️ 没有 fallback

---

### 5. Restaurants (中餐推荐) - P2
**组件**: `client/src/pages/Home.tsx` → `FoodGrid`
**Fetch函数**: `loadAllData()` (line 47-57)
**API端点**: `/api/restaurants`
**后端**: `api/restaurants.ts`
**数据源**: Yelp Fusion API (requires YELP_API_KEY) ⚠️

**当前响应结构**:
```typescript
{
  restaurants: Array<{
    id, name, rating, review_count,
    price_level, cuisine, address,
    distance_miles, photo_url, url
  }>,
  fetched_at: string,
  cache_hit: boolean,
  error?: string
}
```

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 需要 API key，空数组时没有明确状态
- ⚠️ 没有超时处理
- ⚠️ 没有 fallback

---

### 6. Shows (追剧推荐) - P2
**组件**: `client/src/pages/Home.tsx` → `ShowsCard`
**Fetch函数**: `loadAllData()` (line 60-70)
**API端点**: `/api/shows`
**后端**: `api/shows.ts`
**数据源**: TMDB API (requires TMDB_API_KEY) ⚠️

**当前响应结构**:
```typescript
{
  shows: Array<{
    id, title, description, rating,
    poster_url, url, first_air_date
  }>,
  fetched_at: string,
  cache_hit: boolean,
  error?: string
}
```

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 需要 API key，空数组时没有明确状态
- ⚠️ 没有超时处理
- ⚠️ 没有 fallback

---

### 7. VideoGrid - P2 (需要检查是否使用)
**组件**: `client/src/components/VideoGrid.tsx`
**状态**: 需要检查是否在 Home.tsx 中使用

---

### 8. JobMarketTemperature - P2 (已禁用)
**组件**: `client/src/components/JobMarketTemperature.tsx`
**状态**: 在 Home.tsx 中已注释掉 (line 140-149)

---

## B. 按优先级修复清单

### P0: Market Data (票子) - 最高优先级
**原因**: 核心功能，用户最关心

**问题**:
1. ❌ 响应结构不统一（需要统一为 {status, value, asOf, source, ttlSeconds, error?}）
2. ⚠️ SPY/Gold CSV 解析脆弱，需要 fallback
3. ❌ "Unavailable" 项没有明确 UI 状态
4. ⚠️ 没有超时处理
5. ⚠️ 没有 fallback 数据源

**修复项**:
1. 统一 API 响应结构
2. 添加超时处理（5秒）
3. 添加 fallback（SPY/Gold: Stooq → Yahoo Finance）
4. 前端统一处理三态（ok/stale/unavailable）
5. UI 显示 "Unavailable" 状态（带 source link）

---

### P1: News/Video - 高优先级
**原因**: 核心功能，影响决策

**问题**:
1. ❌ 响应结构不统一
2. ⚠️ 空数组时没有明确状态
3. ⚠️ 没有超时处理
4. ✅ News 已有 fallback

**修复项**:
1. 统一 API 响应结构
2. 添加超时处理（10秒）
3. 空数组时返回 {status: "unavailable"}
4. 前端统一处理三态

---

### P2: Layout & Optional Modules - 中优先级
**原因**: 辅助功能，可以暂时禁用

**问题**:
1. ❌ 所有模块响应结构不统一
2. ⚠️ 空数组时没有明确状态
3. ⚠️ 没有超时处理
4. ⚠️ 可选模块（restaurants, shows）需要 API key

**修复项**:
1. 统一所有 API 响应结构
2. 添加超时处理
3. 可选模块：如果 key 缺失，返回 {status: "unavailable"}
4. 前端：空数组或 unavailable 时隐藏或显示 "Not configured"

---

## C. 统一响应结构规范

### 标准响应结构
```typescript
interface StandardResponse<T> {
  status: "ok" | "stale" | "unavailable";
  value: T;
  asOf: string; // ISO 8601 timestamp
  source: {
    name: string;
    url: string;
  };
  ttlSeconds: number;
  error?: string; // Only if status === "unavailable"
  cache_hit?: boolean; // For debugging
  fetched_at?: string; // ISO 8601 timestamp
}
```

### 数组响应结构（News, Gossip, Deals等）
```typescript
interface ArrayResponse<T> {
  status: "ok" | "stale" | "unavailable";
  items: T[];
  count: number;
  asOf: string;
  source: {
    name: string;
    url: string;
  };
  ttlSeconds: number;
  error?: string;
  cache_hit?: boolean;
  fetched_at?: string;
}
```

---

## 下一步：从 P0 开始实现

**P0-1: 统一 Market API 响应结构**
- 修改 `api/market.ts` 返回标准结构
- 修改 `client/src/components/FinanceOverview.tsx` 处理三态
- 添加超时和 fallback
