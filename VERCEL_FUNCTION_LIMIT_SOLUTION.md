# Vercel Hobby 计划 Serverless Functions 限制解决方案

## 当前状态
- **当前 API 路由数量**: 17 个
- **Vercel Hobby 限制**: 12 个
- **超出**: 5 个

## 解决方案

### 方案 1: 合并相关 API 路由（推荐）

将相关功能合并到单个文件中，通过查询参数区分：

#### 合并计划：

1. **食物相关** (3→1)
   - `restaurants.ts` + `food-recommendations.ts` + `spend/today.ts` 
   - → 合并为 `food.ts`
   - 通过 `?type=restaurants|recommendations|today` 区分

2. **社区相关** (4→1)
   - `community/blogs.ts` + `community/leeks.ts` + `community/gossip.ts` + `community/huaren.ts`
   - → 合并为 `community.ts`
   - 通过 `?source=blogs|leeks|gossip|huaren` 区分

3. **新闻相关** (2→1)
   - `ai-news.ts` + `market-news.ts`
   - → 合并为 `news.ts`
   - 通过 `?type=ai|market` 区分

4. **八卦相关** (2→1)
   - `gossip.ts` + `chinese-gossip.ts`
   - → 合并为 `gossip.ts`（保留一个）
   - 通过 `?type=hn|chinese` 区分

**合并后总数**: 17 → 10 个 ✅

### 方案 2: 升级到 Vercel Pro 计划

- **成本**: $20/月
- **Serverless Functions 限制**: 无限制
- **优点**: 无需代码改动
- **缺点**: 需要付费

### 方案 3: 使用其他部署平台

- **Railway**: 无函数数量限制
- **Fly.io**: 无函数数量限制
- **Render**: 无函数数量限制
- **缺点**: 需要迁移和重新配置

## 推荐执行方案 1

合并后的文件结构：
```
api/
├── food.ts              (合并 restaurants + food-recommendations + spend/today)
├── community.ts         (合并 community/*)
├── news.ts              (合并 ai-news + market-news)
├── gossip.ts            (合并 gossip + chinese-gossip)
├── market.ts            (保持不变)
├── quotes.ts            (保持不变)
├── shows.ts             (保持不变)
├── deals.ts             (保持不变)
├── youtubers.ts         (保持不变)
└── portfolio/
    └── value-series.ts  (保持不变)
```

**总计**: 10 个 Serverless Functions ✅

## 实施步骤

如果需要执行方案 1，我可以：
1. 创建合并后的新文件
2. 更新前端调用路径
3. 保持向后兼容（可选）
4. 删除旧文件

请确认是否执行方案 1，或选择其他方案。
