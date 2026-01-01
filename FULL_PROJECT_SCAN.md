# 全项目数据模块扫描报告

## A. 所有数据卡片/模块的 Data Fetch 入口

### 1. Market Data (票子) - P0 ⚠️
**组件**: `client/src/components/FinanceOverview.tsx`
- **Fetch函数**: `loadData()` (line 48-159)
- **API端点**: `/api/market`
- **后端**: `api/market.ts`
- **数据源**:
  - BTC: CoinGecko API ✅
  - SPY: Stooq API (CSV) ⚠️
  - Gold: Stooq API (CSV) ⚠️
  - Mortgage: "Unavailable" ❌
  - Powerball: "Unavailable" ❌

**当前响应结构**: 不统一
```typescript
{
  data: {
    spy: { name, value, unit, source_name, source_url, as_of, debug? },
    // ...
  },
  fetched_at, cache_hit
}
```

**风险点**:
- ❌ 响应结构不统一（需要统一为 {status, value, asOf, source, ttlSeconds, error?}）
- ⚠️ SPY/Gold CSV解析脆弱
- ❌ "Unavailable"没有明确status
- ⚠️ 没有超时处理
- ⚠️ 没有fallback

---

### 2. AI News (行业新闻) - P1 ✅
**组件**: `client/src/pages/Home.tsx` → `NewsList`
- **Fetch函数**: `loadAllData()` (line 34-44)
- **API端点**: `/api/ai-news`
- **后端**: `api/ai-news.ts`
- **数据源**: NewsAPI.org (top-headlines, category=technology) ✅

**当前响应结构**: 不统一
```typescript
{
  news: Array<{...}>,
  fetched_at, cache_hit, debug?
}
```

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 空数组时没有明确status
- ⚠️ 没有超时处理
- ✅ 有fallback

---

### 3. Gossip (吃瓜) - P2 ✅
**组件**: `client/src/pages/Home.tsx` → `GossipList`
- **Fetch函数**: `loadAllData()` (line 73-83)
- **API端点**: `/api/gossip`
- **后端**: `api/gossip.ts`
- **数据源**: Hacker News Firebase API ✅

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 没有超时处理

---

### 4. Deals (遍地羊毛) - P2 ✅
**组件**: `client/src/pages/Home.tsx` → `DealsGrid`
- **Fetch函数**: `loadAllData()` (line 86-96)
- **API端点**: `/api/deals`
- **后端**: `api/deals.ts`
- **数据源**: Reddit JSON API ✅

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 没有超时处理

---

### 5. Restaurants (中餐推荐) - P2 ⚠️
**组件**: `client/src/pages/Home.tsx` → `FoodGrid`
- **Fetch函数**: `loadAllData()` (line 47-57)
- **API端点**: `/api/restaurants`
- **后端**: `api/restaurants.ts`
- **数据源**: Yelp Fusion API (requires YELP_API_KEY) ⚠️

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 需要API key，空数组时没有明确status
- ⚠️ 没有超时处理

---

### 6. Shows (追剧推荐) - P2 ⚠️
**组件**: `client/src/pages/Home.tsx` → `ShowsCard`
- **Fetch函数**: `loadAllData()` (line 60-70)
- **API端点**: `/api/shows`
- **后端**: `api/shows.ts`
- **数据源**: TMDB API (requires TMDB_API_KEY) ⚠️

**风险点**:
- ❌ 响应结构不统一
- ⚠️ 需要API key，空数组时没有明确status
- ⚠️ 没有超时处理

---

### 7. VideoGrid - P2 (未使用)
**组件**: `client/src/components/VideoGrid.tsx`
- **状态**: 在Home.tsx中未使用

---

### 8. JobMarketTemperature - P2 (已禁用)
**组件**: `client/src/components/JobMarketTemperature.tsx`
- **状态**: 在Home.tsx中已注释掉

---

## B. 按优先级修复清单

### P0: Market Data (票子) - 最高优先级
**问题**: 响应结构不统一、无超时、无fallback、UI状态不明确

**修复项**:
1. 统一API响应结构为 `{status, value, asOf, source, ttlSeconds, error?}`
2. 添加超时处理（5秒）
3. 添加fallback（SPY/Gold: Stooq → Yahoo Finance）
4. 前端统一处理三态（ok/stale/unavailable）

---

### P1: News - 高优先级
**问题**: 响应结构不统一、空数组无状态、无超时

**修复项**:
1. 统一API响应结构
2. 添加超时（10秒）
3. 空数组返回 {status: "unavailable"}

---

### P2: Layout & Optional Modules - 中优先级
**问题**: 响应结构不统一、空数组无状态

**修复项**:
1. 统一所有API响应结构
2. 添加超时处理
3. 可选模块：key缺失返回 {status: "unavailable"}
