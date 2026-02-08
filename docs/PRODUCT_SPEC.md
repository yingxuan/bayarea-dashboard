# 湾区码农每日决策仪表盘 - 产品规格说明书

> 版本: 1.0.0
> 更新日期: 2026-02-07
> 状态: Draft

## 目录

1. [产品概述](#1-产品概述)
2. [信息架构](#2-信息架构)
3. [页面结构与模块](#3-页面结构与模块)
4. [路由设计](#4-路由设计)
5. [数据 Contract](#5-数据-contract)
6. [文件职责范围](#6-文件职责范围)
7. [验收标准](#7-验收标准)

---

## 1. 产品概述

### 1.1 产品定位

湾区华人码农每日决策仪表盘 - 一个面向旧金山湾区华人软件工程师的 judgment-based 信息聚合平台。

### 1.2 核心理念

- **Judgment over Aggregation**: 每条内容都经过相关性评分/过滤
- **3-5 分钟扫描**: 用户应能快速获取关键信息
- **三个核心问题**:
  - 我的钱怎么样了？(How is my money doing?)
  - 工作上有什么事？(What's happening at work?)
  - 什么值得关注？(What's worth my attention?)

### 1.3 设计原则

- 一切内容必须可转化为：**钱 / 行动 / 社交话题**
- 不做纯信息、不做百科、不做教育
- 每个 section 10 秒可扫完
- 宁缺毋滥
- 与湾区华人无关的内容不出现
- 移动端优先 (Mobile-first)
- Data Punk 视觉风格（深色赛博朋克主题，霓虹色强调）

---

## 2. 信息架构

### 2.1 整体架构

```
/                    主页 (Home) - 快速摘要入口
├── 今日运势 (Fortune Widget)
├── 打工耽误赚钱 - 精简版 + 入口卡片 → /piaozi
├── 民以食为天 - 精简版 + 入口卡片 → /chihe
└── 追剧吃瓜薅羊毛 - 精简版

/piaozi              票子子页 - 完整财务/投资详情
├── 我的持仓 (Portfolio Full)
├── 指数追踪 (Indices Detail)
├── 市场看点 (Market Highlights Full)
├── 美股博主 (YouTubers Full)
└── 关于饭碗 (Fanwan Full)

/chihe               吃喝子页 - 完整餐饮推荐
├── 奶茶 (Bubble Tea Full)
├── 中餐 (Chinese Food Full)
├── 夜宵 (Late Night Full)
└── 新店打卡 (New Places Full)
```

### 2.2 页面层级关系

| 层级 | 页面 | 信息密度 | 扫描时间目标 |
|------|------|----------|--------------|
| L0 | 主页 `/` | 高度精简 | 3-5 分钟 |
| L1 | 票子 `/piaozi` | 完整详情 | 10-15 分钟 |
| L1 | 吃喝 `/chihe` | 完整详情 | 5-10 分钟 |

---

## 3. 页面结构与模块

### 3.1 主页 `/` (Home)

**目标**: 快速摘要，提供子页入口

#### 模块清单

| 序号 | 模块 | 组件名 | 内容定义 | 数量限制 |
|------|------|--------|----------|----------|
| 0 | 今日运势 | `FortuneWidget` | 基于生辰八字的今日吉凶提示 | 1条 |
| 1.1 | 我的持仓摘要 | `PortfolioHero` | 市值、今日涨跌、Top Movers | 精简版 |
| 1.2 | 指数卡片 | `IndicesCard` | SPY/QQQ/BTC/GOLD/ARKK | 5项 |
| 1.3 | 市场看点 | `MarketHighlights` | 新浪财经 + 一亩三分地韭菜帖 | 最多6条 |
| 1.4 | 美股博主 | `USStockYouTubers` | 每频道最新1条视频 | 最多4条(桌面) |
| 1.5 | 关于饭碗 | `FanwanCarousel` | 职场相关 YouTube 视频 | 最多6条 |
| 1.6 | **票子入口卡片** | `PiaoziEntryCard` (新建) | "查看完整财务详情" CTA | 1个 |
| 2.1 | 今日吃喝 | `TodaySpendCarousels` | 2x2: 奶茶/中餐/夜宵/新店打卡 | 每类3-6个 |
| 2.2 | **吃喝入口卡片** | `ChiheEntryCard` (新建) | "查看更多推荐" CTA | 1个 |
| 3.1 | 追剧 | `ShowsCarousel` | 腾讯/优酷/芒果TV 热门 | 最多8条 |
| 3.2 | 吃瓜 | `ChineseGossip` | 一亩三分地八卦帖 | 最多5条 |
| 3.3 | 薅羊毛 | Deals Card List | 折扣信息 | 最多4条 |

#### 布局结构

```
┌──────────────────────────────────────────────┐
│  Navigation (sticky top)                      │
├──────────────────────────────────────────────┤
│  FortuneWidget (今日运势)                      │
├──────────────────────────────────────────────┤
│  Section: 打工耽误赚钱                         │
│  ┌──────────────────┬─────────────┐          │
│  │ PortfolioHero    │ IndicesCard │          │
│  └──────────────────┴─────────────┘          │
│  MarketHighlights (市场看点)                   │
│  USStockYouTubers (美股博主 carousel)          │
│  FanwanCarousel (关于饭碗 carousel)            │
│  [PiaoziEntryCard: 查看完整财务详情 →]          │
├──────────────────────────────────────────────┤
│  Section: 民以食为天                           │
│  ┌─────────────┬─────────────┐               │
│  │ 奶茶        │ 中餐         │               │
│  ├─────────────┼─────────────┤               │
│  │ 夜宵        │ 新店打卡     │               │
│  └─────────────┴─────────────┘               │
│  [ChiheEntryCard: 查看更多推荐 →]              │
├──────────────────────────────────────────────┤
│  Section: 追剧吃瓜薅羊毛                       │
│  ShowsCarousel (追剧 carousel)                │
│  ┌──────────────────┬─────────────────┐      │
│  │ ChineseGossip    │ Deals Cards     │      │
│  │ (吃瓜 5条)       │ (薅羊毛 4条)    │      │
│  └──────────────────┴─────────────────┘      │
├──────────────────────────────────────────────┤
│  Footer                                       │
└──────────────────────────────────────────────┘
```

---

### 3.2 票子子页 `/piaozi`

**目标**: 完整的财务/投资信息详情页

#### 模块清单

| 序号 | 模块 | 组件名 | 内容定义 | 数量限制 |
|------|------|--------|----------|----------|
| 1 | 我的持仓(完整版) | `PortfolioFull` | 完整持仓列表、走势图、YTD | 无限制 |
| 2 | 指数追踪(完整版) | `IndicesDetail` | 更多指数、历史数据 | 10+ 项 |
| 3 | 市场看点(完整版) | `MarketHighlightsFull` | 更多新闻、评论 | 最多20条 |
| 4 | 美股博主(完整版) | `StockYouTubersFull` | 所有频道、更多视频 | 无限制 |
| 5 | 关于饭碗(完整版) | `FanwanFull` | 14天内所有视频 | 无限制 |
| 6 | 返回主页 | `BackToHomeLink` | 返回主页链接 | 1个 |

#### 布局结构

```
┌──────────────────────────────────────────────┐
│  Navigation (sticky top)                      │
├──────────────────────────────────────────────┤
│  Page Header: 票子 - 财务详情                  │
│  [← 返回主页]                                  │
├──────────────────────────────────────────────┤
│  PortfolioFull                                │
│  - 完整持仓表格                                │
│  - 大尺寸走势图                                │
│  - 盈亏分析                                    │
├──────────────────────────────────────────────┤
│  IndicesDetail                                │
│  - 更多指数 (VIX, DXY, 期货等)                 │
│  - 日/周变化趋势                               │
├──────────────────────────────────────────────┤
│  MarketHighlightsFull                         │
│  - 分页浏览                                    │
│  - 按来源筛选                                  │
├──────────────────────────────────────────────┤
│  StockYouTubersFull                           │
│  - 按频道分组                                  │
│  - 更多视频历史                                │
├──────────────────────────────────────────────┤
│  FanwanFull                                   │
│  - 完整14天视频列表                            │
├──────────────────────────────────────────────┤
│  Footer                                       │
└──────────────────────────────────────────────┘
```

---

### 3.3 吃喝子页 `/chihe`

**目标**: 完整的餐饮推荐详情页

#### 模块清单

| 序号 | 模块 | 组件名 | 内容定义 | 数量限制 |
|------|------|--------|----------|----------|
| 1 | 奶茶(完整版) | `BubbleTeaFull` | 更多奶茶店、评分详情 | 20+ 个 |
| 2 | 中餐(完整版) | `ChineseFoodFull` | 更多中餐馆、分类筛选 | 20+ 个 |
| 3 | 夜宵(完整版) | `LateNightFull` | 更多夜宵店、营业时间 | 20+ 个 |
| 4 | 新店打卡(完整版) | `NewPlacesFull` | 完整新店列表、开业日期 | 无限制 |
| 5 | 地图视图 | `MapView` | 可选的地图展示 | 1个 |
| 6 | 返回主页 | `BackToHomeLink` | 返回主页链接 | 1个 |

#### 布局结构

```
┌──────────────────────────────────────────────┐
│  Navigation (sticky top)                      │
├──────────────────────────────────────────────┤
│  Page Header: 吃喝 - 餐饮推荐                  │
│  [← 返回主页]                                  │
├──────────────────────────────────────────────┤
│  Category Tabs: [奶茶] [中餐] [夜宵] [新店打卡]│
├──────────────────────────────────────────────┤
│  Selected Category Full View                  │
│  - Grid 布局展示                               │
│  - 更大的卡片                                  │
│  - 完整评分信息                                │
│  - 距离/营业时间                               │
│  - 直接跳转 Google Maps                        │
├──────────────────────────────────────────────┤
│  [可选] MapView                               │
│  - 地图上标注所有餐厅                          │
├──────────────────────────────────────────────┤
│  Footer                                       │
└──────────────────────────────────────────────┘
```

---

## 4. 路由设计

### 4.1 路由表

| 路径 | 页面组件 | 描述 |
|------|----------|------|
| `/` | `Home` | 主页 - 快速摘要 |
| `/piaozi` | `Piaozi` | 票子子页 - 财务详情 |
| `/chihe` | `Chihe` | 吃喝子页 - 餐饮推荐 |
| `/404` | `NotFound` | 404 页面 |

### 4.2 路由实现 (App.tsx)

```tsx
import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import Piaozi from "./pages/Piaozi";
import Chihe from "./pages/Chihe";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/piaozi" component={Piaozi} />
      <Route path="/chihe" component={Chihe} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}
```

### 4.3 导航更新 (Navigation.tsx)

```tsx
const navItems = [
  { label: "主页", path: "/" },
  { label: "票子", path: "/piaozi" },
  { label: "吃喝", path: "/chihe" },
  // 移除暂未实现的页面
];
```

---

## 5. 数据 Contract

### 5.1 复用现有类型 (shared/types.ts)

```typescript
// 标准数据响应
interface StandardDataResponse<T> {
  status: "ok" | "stale" | "unavailable";
  value: T;
  asOf: string;
  source: { name: string; url: string; };
  ttlSeconds: number;
  error?: string;
}

// 标准数组响应
interface StandardArrayResponse<T> {
  status: "ok" | "stale" | "unavailable";
  items: T[];
  count: number;
  asOf: string;
  source: { name: string; url: string; };
  ttlSeconds: number;
}

// 市场数据项
interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  status: "ok" | "stale" | "unavailable";
  asOf: string;
  source: { name: string; url: string; };
  ttlSeconds: number;
}

// 模块载荷
interface ModulePayload<T> {
  source: "live" | "cache" | "seed" | "unavailable";
  status: "ok" | "degraded" | "failed";
  fetchedAt: string;
  ttlSeconds: number;
  note?: string;
  items: T[];
}
```

### 5.2 API 端点清单

| 端点 | 用途 | 响应类型 |
|------|------|----------|
| `GET /api/fortune` | 今日运势 | `FortuneData` |
| `GET /api/quotes` | 股票行情 | `{ quotes: QuoteData[] }` |
| `GET /api/market` | 市场指数 | `{ data: MarketData }` |
| `GET /api/market-news` | 市场新闻 | `StandardArrayResponse<NewsItem>` |
| `GET /api/youtubers` | YouTube 博主 | `StandardArrayResponse<YouTuberVideo>` |
| `GET /api/youtube/fanwan` | 饭碗视频 | `{ videos: FanwanVideo[] }` |
| `GET /api/community/leeks` | 韭菜帖 | `ModulePayload<CommunityItem>` |
| `GET /api/community/gossip` | 八卦帖 | `GossipResponse` |
| `GET /api/spend/[category]` | 餐饮推荐 | `{ places: SpendPlace[] }` |
| `GET /api/spend/new-places` | 新店 | `{ places: NewPlace[] }` |
| `GET /api/shows` | 追剧 | `StandardArrayResponse<Show>` |
| `GET /api/deals` | 薅羊毛 | `StandardArrayResponse<Deal>` |
| `GET /api/portfolio/value-series` | 持仓走势 | `ValueSeries` |

---

## 6. 文件职责范围

### 6.1 Agent 文件分配

#### Home Agent
可修改文件:
```
client/src/pages/Home.tsx
client/src/components/Navigation.tsx
client/src/components/PiaoziEntryCard.tsx (新建)
client/src/components/ChiheEntryCard.tsx (新建)
```

#### 票子 Agent
可修改文件:
```
client/src/pages/Piaozi.tsx (新建)
client/src/components/piaozi/PortfolioFull.tsx (新建)
client/src/components/piaozi/IndicesDetail.tsx (新建)
client/src/components/piaozi/MarketHighlightsFull.tsx (新建)
client/src/components/piaozi/StockYouTubersFull.tsx (新建)
client/src/components/piaozi/FanwanFull.tsx (新建)
client/src/components/piaozi/BackToHomeLink.tsx (新建)
client/src/components/piaozi/index.ts (新建, 导出)
```

#### 吃喝 Agent
可修改文件:
```
client/src/pages/Chihe.tsx (新建)
client/src/components/chihe/BubbleTeaFull.tsx (新建)
client/src/components/chihe/ChineseFoodFull.tsx (新建)
client/src/components/chihe/LateNightFull.tsx (新建)
client/src/components/chihe/NewPlacesFull.tsx (新建)
client/src/components/chihe/CategoryTabs.tsx (新建)
client/src/components/chihe/PlaceCard.tsx (新建)
client/src/components/chihe/MapView.tsx (新建, 可选)
client/src/components/chihe/BackToHomeLink.tsx (新建)
client/src/components/chihe/index.ts (新建, 导出)
```

### 6.2 共享文件 (需要协调)

以下文件修改需要多个 Agent 协调:

| 文件 | 修改内容 | 责任 Agent |
|------|----------|------------|
| `client/src/App.tsx` | 添加路由定义 | Home Agent 负责整合 |
| `client/src/components/Navigation.tsx` | 更新导航项 | Home Agent |
| `shared/types.ts` | 新增类型定义 | 各 Agent 按需添加，避免冲突 |

### 6.3 只读文件 (不应修改)

以下文件各 Agent 应仅读取，不应修改:
```
# 现有业务组件 (除非明确需要)
client/src/components/FortuneWidget.tsx
client/src/components/PortfolioHero.tsx
client/src/components/IndicesCard.tsx
client/src/components/MarketHighlights.tsx
client/src/components/USStockYouTubers.tsx
client/src/components/FanwanCarousel.tsx
client/src/components/TodaySpendCarousels.tsx
client/src/components/SpendCarousel.tsx
client/src/components/ChineseGossip.tsx
client/src/components/ShowsCarousel.tsx

# UI 基础组件
client/src/components/ui/*

# 后端代码
api/*
server/*
lib/*
```

### 6.4 目录结构 (实施后)

```
client/src/
├── pages/
│   ├── Home.tsx          # 主页 (Home Agent)
│   ├── Piaozi.tsx        # 票子子页 (票子 Agent)
│   ├── Chihe.tsx         # 吃喝子页 (吃喝 Agent)
│   └── NotFound.tsx
├── components/
│   ├── piaozi/           # 票子专用组件 (票子 Agent)
│   │   ├── index.ts
│   │   ├── PortfolioFull.tsx
│   │   ├── IndicesDetail.tsx
│   │   ├── MarketHighlightsFull.tsx
│   │   ├── StockYouTubersFull.tsx
│   │   ├── FanwanFull.tsx
│   │   └── BackToHomeLink.tsx
│   ├── chihe/            # 吃喝专用组件 (吃喝 Agent)
│   │   ├── index.ts
│   │   ├── BubbleTeaFull.tsx
│   │   ├── ChineseFoodFull.tsx
│   │   ├── LateNightFull.tsx
│   │   ├── NewPlacesFull.tsx
│   │   ├── CategoryTabs.tsx
│   │   ├── PlaceCard.tsx
│   │   └── BackToHomeLink.tsx
│   ├── PiaoziEntryCard.tsx   # 主页入口卡片 (Home Agent)
│   ├── ChiheEntryCard.tsx    # 主页入口卡片 (Home Agent)
│   ├── Navigation.tsx        # 导航 (Home Agent)
│   └── ... (现有组件)
└── App.tsx                   # 路由 (Home Agent 整合)
```

---

## 7. 验收标准

### 7.1 主页 `/` 验收清单

- [ ] 页面加载时间 < 3 秒
- [ ] 所有模块正确渲染，无 JS 错误
- [ ] FortuneWidget 正常显示（已配置生日时）
- [ ] PortfolioHero 显示持仓摘要（已配置持仓时）
- [ ] IndicesCard 显示 5 个指数
- [ ] MarketHighlights 显示最多 6 条新闻
- [ ] USStockYouTubers carousel 正常滑动
- [ ] FanwanCarousel 正常滑动
- [ ] **PiaoziEntryCard 正确链接到 /piaozi**
- [ ] TodaySpendCarousels 4 个分类正常显示
- [ ] **ChiheEntryCard 正确链接到 /chihe**
- [ ] ShowsCarousel 正常滑动
- [ ] ChineseGossip 显示最多 5 条
- [ ] Deals 显示最多 4 条
- [ ] 移动端响应式布局正确
- [ ] 外部链接正确打开新标签

### 7.2 票子子页 `/piaozi` 验收清单

- [ ] 页面正确加载，无 404
- [ ] 导航栏"票子"项高亮
- [ ] "返回主页"链接正常工作
- [ ] PortfolioFull 显示完整持仓列表
- [ ] PortfolioFull 显示大尺寸走势图
- [ ] IndicesDetail 显示更多指数
- [ ] MarketHighlightsFull 显示更多新闻
- [ ] StockYouTubersFull 显示所有频道视频
- [ ] FanwanFull 显示 14 天完整视频
- [ ] 所有数据正确从 API 获取
- [ ] 移动端响应式布局正确
- [ ] 加载状态正确显示

### 7.3 吃喝子页 `/chihe` 验收清单

- [ ] 页面正确加载，无 404
- [ ] 导航栏"吃喝"项高亮
- [ ] "返回主页"链接正常工作
- [ ] CategoryTabs 正常切换分类
- [ ] 奶茶分类显示完整列表
- [ ] 中餐分类显示完整列表
- [ ] 夜宵分类显示完整列表
- [ ] 新店打卡显示完整列表
- [ ] PlaceCard 显示评分、距离、地址
- [ ] Google Maps 链接正常工作
- [ ] MapView 正确标注位置（如实现）
- [ ] 移动端响应式布局正确
- [ ] 图片懒加载正常工作

### 7.4 通用验收标准

- [ ] TypeScript 类型检查通过 (`pnpm check`)
- [ ] ESLint 检查通过 (`pnpm lint`)
- [ ] 无控制台错误
- [ ] 页面间导航流畅
- [ ] 浏览器前进/后退正常工作
- [ ] 刷新页面不丢失状态
- [ ] 暗色主题正确应用
- [ ] Data Punk 视觉风格一致

---

## 附录 A: 现有组件复用指南

### A.1 可直接复用的组件

| 组件 | 用途 | 复用建议 |
|------|------|----------|
| `SectionHeader` | 区块标题 | 所有页面可用 |
| `TimeAgo` | 相对时间显示 | 所有时间戳可用 |
| `Carousel` (ui) | 横向滚动 | 所有 carousel 可用 |
| `Button` (ui) | 按钮 | 所有交互可用 |
| `Card` (ui) | 卡片容器 | 所有卡片可用 |
| `Skeleton` (ui) | 加载占位 | 所有加载状态可用 |

### A.2 可参考的组件模式

| 组件 | 模式 | 参考价值 |
|------|------|----------|
| `PortfolioHero` | 数据获取 + 展示 | 持仓相关组件 |
| `SpendCarousel` | 本地缓存 + 分类 | 餐饮相关组件 |
| `USStockYouTubers` | 轮换 + carousel | YouTube 相关组件 |
| `ChineseGossip` | 多来源合并 | 八卦/新闻组件 |

---

## 附录 B: 开发顺序建议

1. **Phase 1: 路由基础**
   - Home Agent: 更新 App.tsx 添加路由
   - Home Agent: 更新 Navigation.tsx
   - 票子/吃喝 Agent: 创建空白页面

2. **Phase 2: 主页入口卡片**
   - Home Agent: 创建 PiaoziEntryCard
   - Home Agent: 创建 ChiheEntryCard
   - Home Agent: 在 Home.tsx 中添加入口卡片

3. **Phase 3: 票子子页**
   - 票子 Agent: 实现各个完整版组件
   - 票子 Agent: 组装 Piaozi.tsx

4. **Phase 4: 吃喝子页**
   - 吃喝 Agent: 实现各个完整版组件
   - 吃喝 Agent: 组装 Chihe.tsx

5. **Phase 5: 验收测试**
   - 各 Agent: 执行验收清单
   - 修复问题，迭代优化
