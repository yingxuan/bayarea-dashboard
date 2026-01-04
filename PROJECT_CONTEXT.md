# 项目上下文总结 - Bay Area Dashboard

**最后更新**: 2025-01-XX  
**用途**: 供新 agent 快速了解项目状态和关键信息

---

## 📋 项目概述

**湾区码农每日决策仪表盘** (Bay Area Engineer's Daily Decision Dashboard)

面向湾区中文工程师的信息聚合与决策工具，采用"Data Punk"设计风格。核心价值：**Judgment over Aggregation** - 过滤和判断内容，而非简单聚合。

### 核心功能模块

| 模块 | 中文名 | API 端点 | 数据源 | 缓存 TTL |
|------|--------|----------|--------|----------|
| Finance | 票子 | `/api/market`, `/api/quotes`, `/api/portfolio/value-series` | Finnhub, Stooq, CoinGecko | 10 分钟 |
| Market News | 市场看点 | `/api/market-news` | NewsAPI, Gemini (翻译) | 30 分钟 |
| Food | 民以食为天 | `/api/spend/today` | Google Places API (New) | 12 小时 |
| Shows | 追剧 | `/api/shows` | TMDB | 12 小时 |
| Gossip | 吃瓜 | `/api/community/gossip` | RSSHub (1P3A) + Google CSE (Blind) | 30 分钟 |
| Leeks | 市场热点 | `/api/community/leeks` | RSSHub (1P3A) | 10 分钟 |
| Deals | 薅羊毛 | `/api/deals` | Reddit, RSSHub | 30 分钟 |
| YouTubers | 财经博主 | `/api/youtubers` | YouTube RSS | 15 分钟 |

---

## 🛠️ 技术栈

### 前端
- **React 19** + TypeScript
- **Tailwind CSS 4** (Data Punk 主题)
- **Wouter** (路由)
- **shadcn/ui** (组件库)
- **Framer Motion** (动画)
- **Embla Carousel** (轮播)

### 后端
- **Vercel Serverless Functions** (Node.js runtime)
- **TypeScript**
- **内存缓存** (`api/utils.ts`)

### 部署
- **Vercel** (生产环境)
- 支持本地开发 (`pnpm dev`)

---

## 🔌 关键 API 端点详解

### 1. `/api/spend/today` (Food Recommendations)

**用途**: 返回 4 个类别的餐厅推荐（奶茶/中餐/夜宵/新店打卡）

**数据源**: Google Places API (New)

**缓存**: 12 小时 TTL

**回退策略**: Live → Cache → Stale Cache → Seed

**重要约定**:
- ✅ **必须使用 Node.js runtime**: `export const runtime = 'nodejs'`
- ✅ 每个类别返回 6 个 place（5 个正常 + 1 个随机）
- ✅ 前端 `SpendCarousel.tsx` 在 carousel 末尾显示随机选店 card

**当前问题**:
- ✅ **已修复**: `maxResultCount` 超出限制（Google Places API (New) 限制为 1-20）
- ✅ 所有 `maxResultCount: 30` 已改为 `maxResultCount: 20`

**调试**:
- 添加 `?debug=1` 查看详细调试信息
- 添加 `?nocache=1` 绕过缓存

---

### 2. `/api/community/leeks` (1P3A Market Hot Posts)

**用途**: 从 RSSHub 获取 1point3acres 市场热点帖子

**数据源**: RSSHub (多个实例作为回退)

**编码处理**: 
- ✅ **使用 `response.text()`** (Node.js runtime 处理编码)
- ❌ **不要使用** `arrayBuffer()` 或手动 `iconv.decode()`

**缓存**: 10 分钟 TTL

**重要约定**:
- ✅ **必须使用 Node.js runtime**: `export const runtime = 'nodejs'`
- ✅ 直接使用 `response.text()`，让 Node.js runtime 处理编码

---

### 3. `/api/community/gossip` (Community Gossip)

**用途**: 1P3A 吃瓜 + Blind 热门帖子

**数据源**: 
- RSSHub (1P3A)
- Google CSE (Blind)

**编码处理**: 与 `leeks.ts` 相同（`response.text()`）

**缓存**: 30 分钟 TTL

---

### 4. `/api/market` (Market Data)

**用途**: 市场指数数据（SPY, Gold, BTC, Powerball, Mortgage Rates）

**数据源**: Stooq, CoinGecko, Yahoo Finance

**缓存**: 10 分钟 TTL

**响应格式**: `StandardDataResponse<T>`

---

### 5. `/api/quotes` (Stock Quotes)

**用途**: 股票实时报价

**数据源**: Finnhub API

**缓存**: 10 分钟 TTL

**必需环境变量**: `FINNHUB_API_KEY`

---

### 6. `/api/portfolio/value-series` (Portfolio Value)

**用途**: 投资组合价值时间序列

**数据源**: Finnhub API

**必需环境变量**: `FINNHUB_API_KEY`

---

### 7. `/api/market-news` (Market News)

**用途**: 市场新闻（带中文翻译）

**数据源**: NewsAPI + Gemini (翻译)

**必需环境变量**: `NEWS_API_KEY`, `GEMINI_API_KEY` (可选)

---

### 8. `/api/shows` (TV Shows)

**用途**: 追剧推荐

**数据源**: TMDB

**必需环境变量**: `TMDB_API_KEY` (可选，有 seed data)

---

### 9. `/api/deals` (Deals)

**用途**: 薅羊毛推荐

**数据源**: Reddit, RSSHub

**缓存**: 30 分钟 TTL

---

### 10. `/api/youtubers` (Finance YouTubers)

**用途**: 美股财经博主最新视频

**数据源**: YouTube RSS

**频道列表**: 见 `shared/config.ts` - `US_STOCK_YOUTUBERS`

**缓存**: 15 分钟 TTL

---

### 11. `/api/health` (Health Check)

**用途**: 健康检查和部署信息

**响应**: 包含 build ID, deployment ID, commit SHA, 环境信息

---

## 🔑 重要约定与模式

### 1. Runtime 设置

```typescript
// 所有需要 process.env 或 Buffer 的 API 必须设置
export const runtime = 'nodejs';
```

**需要 Node.js runtime 的 API**:
- `/api/spend/today` (Google Places API)
- `/api/community/leeks` (RSS 编码处理)
- `/api/community/gossip` (RSS 编码处理)
- 任何需要访问 `process.env` 的 API

---

### 2. 缓存模式

```typescript
// 标准缓存流程
const nocache = isCacheBypass(req);
const cached = getCachedData(cacheKey, TTL, nocache);
if (cached) {
  return res.status(200).json({
    ...cached.data,
    cacheAgeSeconds: cached.cacheAgeSeconds,
    cacheExpiresInSeconds: cached.cacheExpiresInSeconds,
  });
}

// ... fetch fresh data ...

// 成功时写入缓存
setCache(cacheKey, response);
```

**缓存工具函数** (在 `api/utils.ts`):
- `getCachedData(key, ttl, nocache)` - 获取有效缓存
- `setCache(key, data)` - 设置缓存
- `getStaleCache(key)` - 获取过期缓存（用于错误回退）
- `isCacheBypass(req)` - 检查是否绕过缓存

---

### 3. 回退策略

**标准回退流程**:
```
1. Live Data (fetch fresh)
   ↓ (失败)
2. Cache (valid TTL)
   ↓ (失败)
3. Stale Cache (expired but exists)
   ↓ (失败)
4. Seed Data (hardcoded fallback)
```

**确保始终返回 >= 3 个有效项** (对于数组响应)

---

### 4. 编码处理（RSS/XML）

**1P3A RSS 编码处理**:
```typescript
// ✅ 正确方式
const response = await fetch(url);
const text = await response.text(); // Node.js runtime 自动处理编码

// ❌ 错误方式
const arrayBuffer = await response.arrayBuffer();
const text = iconv.decode(Buffer.from(arrayBuffer), 'gb2312');
```

**原因**: Node.js runtime 会自动处理编码，无需手动解码

---

### 5. 错误处理

**标准错误处理模式**:
```typescript
try {
  // ... fetch data ...
} catch (error) {
  console.error('[API] Error:', error);
  
  // 尝试使用 stale cache
  const stale = getStaleCache(cacheKey);
  if (stale) {
    normalizeStaleResponse(stale.data, defaultSource, defaultTtl);
    return res.status(200).json(stale.data);
  }
  
  // 最后回退到 seed data
  return res.status(200).json({
    status: 'unavailable',
    items: seedData,
    error: error.message,
    ...
  });
}
```

**调试模式**:
- 添加 `?debug=1` 查看详细调试信息
- 添加 `?nocache=1` 绕过缓存

---

### 6. 响应格式标准化

**数组响应** (`StandardArrayResponse<T>`):
```typescript
{
  status: "ok" | "stale" | "unavailable",
  items: T[],
  count: number,
  asOf: string, // ISO 8601
  source: { name: string, url: string },
  ttlSeconds: number,
  error?: string,
  cacheAgeSeconds?: number,
  cacheExpiresInSeconds?: number,
  _debug?: any // 仅在 ?debug=1 时出现
}
```

**单值响应** (`StandardDataResponse<T>`):
```typescript
{
  status: "ok" | "stale" | "unavailable",
  value: T,
  asOf: string,
  source: { name: string, url: string },
  ttlSeconds: number,
  error?: string,
  ...
}
```

---

## 🐛 当前已知问题

### 1. Google Places API 400 错误

**位置**: `api/spend/today.ts` - `searchGooglePlacesNearby`

**症状**: `searchNearby` 请求返回 400 Bad Request - "Max number of place results to return must be between 1 and 20 inclusively."

**原因**: 
- ❌ `maxResultCount: 30` 超出 Google Places API (New) 限制（1-20）

**状态**: 
- ✅ **已修复**: 所有 `maxResultCount: 30` 已改为 `maxResultCount: 20`
- ✅ 已添加注释说明 API 限制

**修复位置**:
- `searchGooglePlacesNearby` 函数中的 debug 模式（2 处）
- 新店打卡 wide net query（3 处）
- 中餐类别 nearby search（2 处）

---

### 2. 随机选店功能

**状态**: ✅ **已实现**

**后端**: 确保每个类别返回 6 个 place（5 个正常 + 1 个随机）

**前端**: `SpendCarousel.tsx` 在 carousel 末尾显示随机选店 card

---

### 3. Carousel 滚动按钮

**状态**: ✅ **已实现**

**实现**: 使用 `CarouselPrevious` 和 `CarouselNext` 组件

**样式**: 桌面端显示，移动端隐藏（触摸滑动）

---

## 📁 文件结构

```
bayarea-dashboard/
├── api/                          # Vercel Serverless Functions
│   ├── community/
│   │   ├── gossip.ts             # 吃瓜 (1P3A + Blind)
│   │   └── leeks.ts              # 市场热点 (1P3A)
│   ├── spend/
│   │   └── today.ts              # 食物推荐 (Google Places)
│   ├── portfolio/
│   │   └── value-series.ts       # 投资组合价值
│   ├── deals.ts                  # 薅羊毛
│   ├── market.ts                 # 市场数据
│   ├── market-news.ts            # 市场新闻
│   ├── quotes.ts                 # 股票报价
│   ├── shows.ts                  # 追剧
│   ├── youtubers.ts              # 财经博主
│   ├── health.ts                 # 健康检查
│   └── utils.ts                  # 共享工具（缓存、CORS等）
│
├── client/                       # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── SpendCarousel.tsx        # 食物 carousel
│   │   │   ├── TodaySpendCarousels.tsx  # 2x2 grid 容器
│   │   │   └── ...
│   │   ├── pages/
│   │   │   └── Home.tsx                 # 主页面
│   │   └── ...
│   └── ...
│
├── shared/                       # 共享代码
│   ├── config.ts                 # 配置（TTL、URLs、频道列表）
│   ├── types.ts                  # 类型定义
│   └── ...
│
├── server/                       # Express 服务器（本地开发）
│   └── index.ts
│
├── scripts/                      # 工具脚本
│   └── ...
│
├── data/                         # 静态数据
│   └── ...
│
├── DESIGN.md                     # 产品设计文档
├── README.md                     # 项目说明
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json                   # Vercel 配置
```

---

## 🔐 环境变量

### 必需环境变量

| 变量名 | 用途 | 获取地址 | 说明 |
|--------|------|----------|------|
| `GOOGLE_PLACES_API_KEY` | Google Places API (New) | https://console.cloud.google.com/ | 食物推荐必需 |
| `FINNHUB_API_KEY` | 股票数据 | https://finnhub.io/ | 股票报价和投资组合必需 |

### 可选环境变量

| 变量名 | 用途 | 说明 |
|--------|------|------|
| `NEWS_API_KEY` | 新闻数据 | 市场新闻（有 seed data 回退） |
| `GEMINI_API_KEY` | AI 翻译 | 市场新闻中文翻译（可选） |
| `GOOGLE_CSE_API_KEY` | Google CSE | Blind 搜索（可选） |
| `GOOGLE_CSE_ID` | Google CSE ID | Blind 搜索（可选） |
| `TMDB_API_KEY` | TMDB API | 追剧推荐（有 seed data 回退） |

### 安全注意事项

- ✅ **所有 API keys 都是 server-side only**
- ✅ **不要在前端暴露 API keys**（没有 `VITE_` 前缀）
- ✅ **`.env` 和 `.env.local` 已加入 `.gitignore`**
- ⚠️ **Vercel 部署后修改环境变量需要重新部署才能生效**

---

## 🐛 调试技巧

### 1. 调试模式

**添加查询参数**:
- `?debug=1` - 查看详细调试信息（包括 `_debug` 字段）
- `?nocache=1` - 绕过缓存，强制获取新数据

**示例**:
```
GET /api/spend/today?debug=1&nocache=1
```

---

### 2. 检查 Vercel 函数日志

1. 登录 Vercel Dashboard
2. 进入项目 → Functions → 选择函数
3. 查看实时日志

---

### 3. 本地开发调试

```bash
# 启动开发服务器
pnpm dev

# 启动 Express 服务器（本地 API）
pnpm dev:server

# 同时启动前端和服务器
pnpm dev:full
```

**本地 API 端点**: `http://localhost:3001/api/*`

---

### 4. 验证环境变量

**使用 `/api/health` 端点**:
```bash
curl https://your-domain.vercel.app/api/health
```

**检查函数日志**:
- 查看是否有 "Missing XXX_API_KEY" 错误
- 确认环境变量已正确设置

---

### 5. 常见问题排查

**问题**: API 返回 500 错误
- ✅ 检查 Vercel 函数日志
- ✅ 确认环境变量已设置并重新部署
- ✅ 检查 API key 权限和配额

**问题**: 缓存不更新
- ✅ 添加 `?nocache=1` 测试
- ✅ 检查 TTL 设置
- ✅ 确认缓存逻辑正确

**问题**: 编码问题（中文乱码）
- ✅ 确认使用 Node.js runtime
- ✅ 使用 `response.text()` 而非 `arrayBuffer()`
- ✅ 检查 RSS 源编码设置

---

## 📝 最近修改记录

### 1. 1P3A RSS 编码处理
- **修改**: 改为使用 `response.text()`（Node.js runtime 处理编码）
- **文件**: `api/community/leeks.ts`, `api/community/gossip.ts`
- **原因**: Node.js runtime 自动处理编码，无需手动解码

### 2. 随机选店功能
- **状态**: ✅ 已实现
- **后端**: 每个类别返回 6 个 place（5 个正常 + 1 个随机）
- **前端**: `SpendCarousel.tsx` 显示随机选店 card

### 3. Carousel 滚动按钮
- **状态**: ✅ 已实现
- **实现**: 使用 `CarouselPrevious` 和 `CarouselNext` 组件
- **样式**: 桌面端显示，移动端隐藏

### 4. Google Places API 400 错误修复
- **问题**: `maxResultCount: 30` 超出 API 限制（1-20）
- **修复**: 将所有 `maxResultCount: 30` 改为 `maxResultCount: 20`
- **文件**: `api/spend/today.ts`
- **状态**: ✅ 已修复

---

## ⚠️ 注意事项

### 1. 不要修改 1P3A RSS parser 的编码处理逻辑
- ✅ 使用 `response.text()`（Node.js runtime）
- ❌ 不要使用 `arrayBuffer()` 或手动 `iconv.decode()`

### 2. 所有需要 `process.env` 的 API 必须设置 runtime
```typescript
export const runtime = 'nodejs';
```

### 3. 确保所有类别始终返回 >= 3 个有效项
- 使用 seed data 作为最后回退
- 确保回退数据质量

### 4. 缓存策略
- ✅ 成功时写入缓存
- ✅ 失败时读取缓存
- ✅ 缓存失败时使用 seed

### 5. 不要在前端暴露 API keys
- 所有 keys 都是 server-side only
- 没有 `VITE_` 前缀的环境变量

### 6. Vercel 环境变量更新
- ⚠️ **修改环境变量后必须重新部署才能生效**
- 环境变量只在部署时加载，不在运行时加载

---

## 📚 相关文档

- `README.md` - 项目说明和开发指南
- `DESIGN.md` - 产品设计和技术架构
- `API_REQUIREMENTS.md` - API 需求文档
- `FINNHUB_SETUP.md` - Finnhub API 设置指南
- `NEWSAPI_SETUP.md` - NewsAPI 设置指南

---

## 🔄 工作流程

### 添加新 API 端点

1. 在 `api/` 目录创建新文件
2. 设置 runtime（如需要）: `export const runtime = 'nodejs'`
3. 实现标准响应格式
4. 添加缓存逻辑
5. 实现回退策略（Live → Cache → Stale → Seed）
6. 添加错误处理和调试信息
7. 测试本地和 Vercel 部署

### 修改现有 API

1. 阅读相关文档和代码
2. 理解当前实现和约定
3. 保持响应格式一致性
4. 确保缓存逻辑正确
5. 测试回退策略
6. 更新相关文档

---

## 🎯 下一步工作

### 高优先级
1. ⏳ 诊断并修复 Google Places API 400 错误
2. ⏳ 验证所有 API 端点的回退策略
3. ⏳ 优化缓存策略和 TTL

### 中优先级
1. 添加更多 seed data
2. 改进错误日志和调试信息
3. 优化 API 响应时间

### 低优先级
1. 添加 API 文档
2. 添加单元测试
3. 性能优化

---

**文档维护**: 请在修改关键功能后更新此文档
