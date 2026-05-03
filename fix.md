# 湾区码农每日决策仪表盘 — 问题分析与修改计划

## 用户画像：湾区码农的真实生活

目标用户是在旧金山湾区工作的华人软件工程师，具体特征：

- **工作**：FAANG/大厂（Google、Meta、Apple、NVIDIA、Amazon、Microsoft）或中型科技公司
- **经济状况**：TC $150k–$500k+，持有大量 RSU/ESPP，有 401k/Brokerage 账户
- **法律身份**：60%+ 持 H1B/OPT/绿卡申请中，永久移民焦虑
- **住房**：租房或已买，湾区房价是心头大事
- **信息习惯**：早上刷手机 10 分钟，查股票、刷微信、看小红书、逛 1point3acres
- **娱乐**：追国内剧、关注八卦、看美股博主、偶尔逛 V2EX
- **薅羊毛**：信用卡 hack（Chase/Amex/BoA）、Costco、Amazon 折扣
- **最怕的事**：被裁、抽不到 H1B、买不起房、RSU 跌完

---

## 当前状态快照（基于 API 检查）

| 模块 | 状态 | 数据量 |
|------|------|--------|
| 市场指数（SPY/QQQ/BTC/Gold/ARKK） | 正常 | 5 个指标 |
| 市场要闻（新浪财经） | 正常 | 14 条 |
| 一亩三分地市场版 (leeks) | 正常 | 5 条 |
| 美股博主 YouTube | 正常 | 多个频道 |
| 关于饭碗 YouTube | 正常 | 正常 |
| 食物推荐（奶茶/中餐/夜宵） | 正常 | 正常 |
| 追剧（Shows） | 正常 | 60 条（过多）|
| 院线华语电影 | 正常 | 4 条 |
| 湾区演唱会 | **0 条（损坏）** | 0 |
| 吃瓜 1P3A | **0 条（损坏）** | 0 |
| 吃瓜 V2EX | 正常 | 8 条 |
| 薅羊毛 | 部分正常 | 仅 Reddit r/deals |
| 今日运势 | 需要手动设置 | N/A |
| 投资组合 | 需要登录 | N/A |

---

## 问题一：严重缺失的内容板块

### 1.1 就业市场（最高优先级）

**问题**：湾区码农每天最焦虑的事是"我的工作稳不稳"，但整个网站没有任何就业信息。

**缺失内容**：
- Layoffs.fyi 实时裁员数据（今天谁家裁人了？）
- levels.fyi 薪资数据（同岗位 TC 多少？）
- Glassdoor/LinkedIn 招聘趋势
- 1point3acres 求职版热帖

**影响**：整个 Section 1"打工耽误赚钱"只有"赚钱"没有"打工"，缺少最核心的就业信息。

### 1.2 移民/签证动态（高优先级）

**问题**：H1B、PERM、绿卡是 60%+ 湾区华人码农的心头大事，完全没有覆盖。

**缺失内容**：
- H1B 抽签结果、截止日期提醒
- 移民政策新闻（USCIS 更新、政策变动）
- 1point3acres 签证版热帖
- I-140/PERM 处理时间

**影响**：对于持 H1B 的用户，这是比股票更重要的"财务"信息。

### 1.3 湾区房市（中高优先级）

**问题**：湾区房价是第二大财务决策（买/不买/何时买），只有抵押贷款利率一个指标。

**缺失内容**：
- Redfin/Zillow 湾区房价指数（周涨跌）
- 特定地区（Sunnyvale/Santa Clara/Fremont）中位价
- 新上市/价格下降房源数量趋势

### 1.4 科技行业专项新闻（中优先级）

**问题**："市场要闻"是通用财经新闻，缺少湾区码农最关心的科技行业动态。

**缺失内容**：
- AI/大模型动态（OpenAI、Anthropic、Google Gemini）
- 半导体新闻（NVIDIA、AMD、Intel、TSMC）
- 36Kr 科技头条
- Hacker News 前 5 条

---

## 问题二：现有板块的数据质量问题

### 2.1 市场指数：缺少码农关心的个股

**现状**：显示 SPY、QQQ、BTC、Gold、ARKK、Mortgage。

**问题**：
- NVDA、AAPL、META、GOOGL、AMZN、MSFT 是码农 RSU 的主要来源，但完全没有
- ARKK 对湾区码农意义不大（更多是散户赌博指标）
- Powerball 放在市场数据里显得不专业

**建议**：增加 NVDA、AAPL、META、GOOGL 四个核心科技股快览；ARKK 降级或移除。

### 2.2 吃瓜：1P3A 一直返回 0 条

**现状**：1P3A section 391（人际关系）直接抓取从 Vercel IP 被屏蔽，始终 0 条。

**根本原因**：`www.1point3acres.com` 屏蔽 Vercel/AWS IP 的直接爬取；RSSHub 公共实例屏蔽 server-to-server 请求。

**建议**：
- 方案 A：改用 1P3A 的 RSS 订阅（如果存在），通过不同 IP 代理
- 方案 B：用小红书热帖替换 1P3A（更娱乐性的"吃瓜"内容），通过可用的 RSS 获取
- 方案 C：接入微博热搜（需要找到不依赖 Puppeteer 的 API）

### 2.3 薅羊毛：只有 Reddit r/deals，缺少华人专项

**现状**：10 条 Reddit r/deals（从 cache 获取），全是英文亚马逊/工具折扣。

**问题**：
- 缺少华人最爱的信用卡 hack 来源（Doctor of Credit）
- 缺少 Slickdeals 热帖
- 缺少 Costco 专区折扣
- 缺少北美省钱快报/smzdm 华人专项

**建议**：增加 Doctor of Credit（docrédito）RSS、Slickdeals 热帖；从 smzdm 抓取北美相关；提高 Costco 关键词权重。

### 2.4 湾区演唱会：0 条数据

**现状**：`/api/concerts` 返回空数组，但 UI 代码是 `concerts.length > 0` 才渲染，所以整个块消失。

**建议**：调查 concerts API 数据源问题；如果无法修复，用"湾区近期华人活动"替代（meetup/eventbrite 搜索"Chinese Bay Area"）。

### 2.5 追剧：60 条视频太多

**现状**：显示 60 个视频，来自腾讯视频/优酷/芒果 YouTube 频道。

**问题**：
- 用户不可能看 60 个，产生 scroll fatigue
- 没有评分/热度排序
- 重复内容（同一剧多个分集）

**建议**：去重按剧名分组，只保留每剧最新一集，限制为 8-12 个。

---

## 问题三：UX/设计问题

### 3.1 今日运势占据首屏但默认无用

**问题**：
- 首屏最重要位置给了"今日运势"，但新用户看到的是"请先点击齿轮设置生日"
- 即使设置了生日，默认是收起的，只显示一行 headline
- 八字运势对理性的工程师来说说服力弱

**建议**：
- 将运势下移，不占首屏
- 或者改成更实用的"今日要做的事"（基于市场状态 + 日历事件）
- 至少提供非生日用户的默认内容

### 3.2 投资组合需要登录，摩擦太大

**问题**：PortfolioHero 在未登录时显示 LoginPromptCard，但每日查看股价是最高频场景，要求登录会流失大量用户。

**建议**：
- 支持纯本地模式（持仓数据存 localStorage，不需要账号）
- 登录仅用于多设备同步
- 当前已有 `useHoldings` hook 存储本地，应该优先展示

### 3.3 Section 2（民以食为天）信息密度过低

**问题**：食物推荐每个 carousel 只显示 2-3 个，大量空白。

**建议**：
- 增加"今日推荐"单一强推荐（评分最高 + 距离近）
- 按地区（South Bay / East Bay / SF）分区
- 增加"适合带同事/接待客户"的推荐场景

### 3.4 移动端体验未知

当前只分析了桌面端，需要专门测试：
- 移动端 carousel 是否可滑动
- 字体大小是否合适
- 各 section 是否有意义的折叠

### 3.5 数据刷新透明度不足

**问题**：用户不知道数据是实时的还是 6 小时前的缓存。

**建议**：在每个 section header 旁边显示小字"更新于 X 分钟前"。

---

## 问题四：技术/可靠性问题

### 4.1 数据源过度依赖公共 RSSHub 实例

**问题**：rsshub.app 和其他公共实例明确声明不支持 server-to-server（云服务器）访问，导致依赖 RSSHub 的所有数据源从 Vercel 均不可用。

**受影响**：1P3A gossip、原 zhihu/hot、原 weibo/search/hot。

**建议**：
- 优先使用官方 API 或直接 HTTP 抓取
- 考虑自建 RSSHub 实例（Vercel 上也可以部署）
- 对所有外部依赖添加监控告警

### 4.2 Concerts API 返回空数组但无降级

**问题**：concerts 返回 0 条，UI 直接隐藏整个 section，用户无感但浪费了一个版位。

**建议**：实现 fallback 内容（如"近期无湾区演出信息"或改用 Eventbrite 搜索）。

### 4.3 iconv-lite 命名导入问题（已修复）

已修复：`import { decode }` 改为 `import iconv` + `iconv.decode()`。

---

## 修改计划（按优先级排序）

### P0：立即修复（影响现有功能）

#### P0-1：修复 1P3A 吃瓜 0 条问题
- **方案**：改用 1P3A RSS API（`https://www.1point3acres.com/bbs/rss.php?fid=391`），这是 1P3A 官方 RSS，不依赖第三方 RSSHub 且服务器可访问
- **文件**：`api-handlers/community/gossip.ts`
- **测试**：确认从 Vercel 可以请求该 URL

#### P0-2：修复 Concerts 0 条问题
- **方案**：调查 `api-handlers/market/shows.ts`（或 concerts 相关文件）的数据源；如果源已失效，切换到 Eventbrite API 搜索"Chinese"+"Bay Area"
- **文件**：`api/market/` 或 `api-handlers/` 下相关文件

### P1：核心功能补充（影响产品价值）

#### P1-1：增加科技个股快览（NVDA/AAPL/META/GOOGL）
- **位置**：IndicesCard 或新的 TechStocksCard
- **数据源**：复用现有 Yahoo Finance 接口，增加 4 个 ticker
- **展示**：与 SPY/QQQ 并列，显示价格 + 涨跌幅
- **文件**：`api-handlers/market/market-all.ts`、`client/src/components/IndicesCard.tsx`

#### P1-2：增加裁员/就业动态模块
- **数据源**：
  - Layoffs.fyi RSS/API（`https://layoffs.fyi`）
  - 1P3A 求职版（fid=52）的 RSS
- **位置**：Section 1 "打工耽误赚钱" 的新子版块，紧跟市场要闻
- **展示**：最近 5 条裁员新闻 + 3 条 1P3A 求职热帖
- **文件**：新增 `api-handlers/community/jobs.ts`，前端新增 `LayoffsWidget.tsx`

#### P1-3：增加移民/签证动态
- **数据源**：
  - USCIS 官方新闻 RSS（`https://www.uscis.gov/newsroom/rss`）
  - 1P3A 签证版（相关 section）RSS
  - murthy.com / immihelp.com RSS
- **位置**：Section 1 底部，小字列表形式
- **展示**：最新 3 条移民新闻，仅显示标题 + 来源 + 时间
- **文件**：新增 `api-handlers/community/immigration.ts`，前端新增 `ImmigrationNews.tsx`

#### P1-4：追剧内容去重 + 限量
- **当前**：60 条原始 YouTube 视频
- **修改**：按剧名/系列分组，每组保留最新一集，最多显示 12 个
- **文件**：`api-handlers/market/shows.ts`（后端去重）或 `ShowsCarousel.tsx`（前端限量）

#### P1-5：薅羊毛增加 Doctor of Credit
- **数据源**：Doctor of Credit RSS（`https://www.doctorofcredit.com/feed/`）- 信用卡 hack 专业来源，湾区码农最爱
- **评分加权**：信用卡/银行开户奖励 +20 分；Costco/Amazon +10 分
- **文件**：`api-handlers/deals.ts` 或相关文件

### P2：重要体验提升

#### P2-1：今日运势改版
- **修改**：无生日时显示"今日市场情绪"而非空状态（基于 SPY 涨跌 + VIX 生成一句话）
- **或者**：完全降低运势的优先级，移到 footer 附近，首屏让位给更实用内容
- **文件**：`FortuneWidget.tsx`

#### P2-2：投资组合支持无账号本地模式
- **修改**：`useAuthAwareHoldings` 降级逻辑 — 未登录时直接用 localStorage 数据，不显示 LoginPromptCard
- **文件**：`client/src/hooks/useAuthAwareHoldings.ts`、`PortfolioHero.tsx`

#### P2-3：数据时效性标注
- **修改**：Section header 或 badge 上显示"X 分钟前更新"
- **实现**：后端 API 已返回 `fetchedAt`，前端 `TimeAgo` 组件已有，只需串联
- **文件**：各 SectionHeader 使用处

#### P2-4：演唱会 section fallback
- **修改**：concerts 为 0 时，显示"即将到来的湾区华人活动"占位，或链接到 eventbrite 搜索
- **文件**：`Home.tsx`

### P3：锦上添花

#### P3-1：湾区房市指数
- **数据源**：Redfin Data Center（每周更新 CSV）或 Zillow API（需要 Key）
- **展示**：硅谷中位价 + 周涨跌，一行数字
- **位置**：IndicesCard 底部或单独一行

#### P3-2：HN 科技热帖（英文）
- **数据源**：Hacker News API（`https://hacker-news.firebaseio.com/v0/topstories.json`）- 官方 API，稳定、无封锁
- **展示**：前 5 条，小字列表
- **位置**：吃瓜右侧或 Section 1 底部

#### P3-3：天气信息
- **数据源**：Open-Meteo（免费、无 Key、高可靠）
- **展示**：SF/SV 今日天气一行（温度 + 状态，如"61°F 多云"）
- **位置**：运势 widget 旁边

#### P3-4：大湾区热帖整合
- **当前**：V2EX 和 1P3A 来源混合
- **改进**：增加小红书"湾区"话题热帖（如果能找到不需要登录的 RSS）
- **目的**：吃瓜内容更接地气、更娱乐化

---

## 核心数据源稳定性矩阵

| 数据源 | Vercel 可访问性 | 推荐度 |
|--------|----------------|--------|
| Yahoo Finance API | ✅ 稳定 | 股票首选 |
| V2EX API | ✅ 稳定 | 吃瓜使用中 |
| 1P3A 官方 RSS | 待验证 | 推荐测试 |
| Hacker News Firebase API | ✅ 稳定 | 推荐引入 |
| USCIS RSS | ✅ 稳定 | 推荐引入 |
| Doctor of Credit RSS | ✅ 大概率稳定 | 推荐引入 |
| Open-Meteo | ✅ 稳定 | 天气推荐 |
| rsshub.app 公共实例 | ❌ 屏蔽云服务器 | 避免使用 |
| rsshub.rssforever.com | ❌ 屏蔽云服务器 | 避免使用 |
| 1P3A 直接 HTML 抓取 | ❌ 屏蔽 Vercel IP | 避免 |
| weibo.com 抓取 | ❌ 需要 Cookie | 避免 |
| Layoffs.fyi | 待验证 | 重要，需测试 |

---

## 信息架构重设计建议

当前三段式（赚钱 / 吃饭 / 娱乐）整体合理，建议在 Section 1 内部细化：

```
Section 1: 打工与钱
  ├── 1a. 我的钱（Portfolio + 指数 + 科技股）
  ├── 1b. 市场动态（财经新闻 + 科技新闻）
  ├── 1c. 饭碗安全（裁员动态 + 1P3A 求职）[NEW]
  ├── 1d. 移民状态（签证/GC 新闻）[NEW]
  └── 1e. 学习充电（美股博主 + 关于饭碗）

Section 2: 吃喝（保持现状，微调布局）

Section 3: 休闲
  ├── 3a. 追剧（去重后限量）
  ├── 3b. 湾区活动（演唱会/活动修复）
  ├── 3c. 吃瓜（V2EX + 1P3A + HN）
  └── 3d. 薅羊毛（Reddit + DoC + Slickdeals）
```

---

*分析日期：2026-03-07 | 基于 production API 实测 + 源码审查*
