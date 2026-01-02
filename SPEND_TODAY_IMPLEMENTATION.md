# "今天怎么花钱"模块实现文档

## 概述

使用 Google Places API 实现"今天怎么花钱"模块，替代 Yelp API。保留本地 seed 数据作为 fallback。

---

## 改动文件列表

### 新增文件
1. **`api/spend/today.ts`** - 新的 API 端点
   - 使用 Google Places Text Search API
   - 24 小时缓存
   - Fallback 到 seed 数据

### 修改文件
1. **`client/src/components/TodaySpendRecommendations.tsx`**
   - 更新 API 调用：从 `/api/food-recommendations` 改为 `/api/spend/today`
   - 更新接口定义以支持新的字段（`maps_url`, `user_ratings_total`）

2. **`server/local-api-adapter.ts`**
   - 添加 `spendTodayRoute` 函数

3. **`server/index.ts`**
   - 注册 `/api/spend/today` 路由

4. **`API_REQUIREMENTS.md`**
   - 添加 `GOOGLE_PLACES_API_KEY` 说明
   - 更新 API 需求清单

### 保留文件（作为 fallback）
- **`shared/food-seed-data.ts`** - 本地 seed 数据（fallback 使用）

---

## API 实现细节

### 端点
```
GET /api/spend/today
```

### 请求参数
- `nocache=1` (可选) - 绕过缓存

### 响应格式
```json
{
  "status": "ok",
  "items": [
    {
      "id": "ChIJ...",
      "name": "TP Tea",
      "category": "奶茶",
      "rating": 4.5,
      "user_ratings_total": 523,
      "address": "19620 Stevens Creek Blvd, Cupertino, CA 95014",
      "maps_url": "https://www.google.com/maps/place/?q=place_id:ChIJ...",
      "photo_url": "https://maps.googleapis.com/maps/api/place/photo?...",
      "city": "Cupertino",
      "score": 28.5
    }
  ],
  "count": 6,
  "asOf": "2024-01-01T12:00:00.000Z",
  "source": {
    "name": "Google Places",
    "url": "https://maps.google.com"
  },
  "cache_hit": false,
  "fetched_at": "2024-01-01T12:00:00.000Z"
}
```

### 实现逻辑

1. **数据获取**：
   - 遍历 3 个城市 × 4 个类别 = 12 次搜索
   - 每个类别使用对应的搜索关键词：
     - 奶茶: "bubble tea", "boba"
     - 中餐: "chinese restaurant"
     - 咖啡: "coffee"
     - 甜品: "dessert", "bakery"

2. **筛选规则**：
   - `rating >= 4.2` 且 `user_ratings_total >= 50`
   - 如果字段缺失，放宽条件但优先满足有数据的

3. **排序规则**：
   - `score = rating * log(user_ratings_total)`
   - 按 score 降序排列

4. **平衡选择**：
   - 2 奶茶 + 2 中餐 + 1 咖啡 + 1 甜品 = 6 条

5. **缓存策略**：
   - 24 小时 TTL
   - 成功 → 写入 cache
   - 失败 → 读取 stale cache
   - cache 也失败 → 使用 seed 数据

---

## 环境变量配置

### 必需
```bash
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

### 获取 API Key
1. 访问 https://console.cloud.google.com/
2. 创建项目或选择现有项目
3. 启用 "Places API (New)" 或 "Places API"
4. 创建凭据 → API 密钥
5. 限制 API Key（推荐）：仅允许 Places API

---

## 本地验证步骤

### 1. 设置环境变量

**本地开发（`.env` 文件）**：
```bash
GOOGLE_PLACES_API_KEY=your_key_here
```

**Vercel 部署**：
1. 进入 Vercel Dashboard
2. Settings → Environment Variables
3. 添加 `GOOGLE_PLACES_API_KEY`
4. 重新部署

### 2. 启动本地服务器

```bash
# 在项目根目录
pnpm install
cd server
pnpm dev
```

服务器将在 `http://localhost:3001` 启动

### 3. 测试 API 端点

#### 测试正常请求（使用缓存）
```bash
curl "http://localhost:3001/api/spend/today"
```

#### 测试绕过缓存
```bash
curl "http://localhost:3001/api/spend/today?nocache=1"
```

#### 预期响应
- `status: "ok"`
- `items: [...]` (6 条推荐)
- `count: 6`
- `source.name: "Google Places"` 或 `"Local Seed Data"` (如果 fallback)

### 4. 验证响应格式

检查每个 item 是否包含：
- ✅ `id` (place_id)
- ✅ `name`
- ✅ `category` (奶茶/中餐/咖啡/甜品)
- ✅ `rating` (>= 4.2)
- ✅ `user_ratings_total` (>= 50)
- ✅ `address`
- ✅ `maps_url` (Google Maps 链接)
- ✅ `city` (Cupertino/Sunnyvale/San Jose)
- ✅ `photo_url` (可选)

### 5. 测试 Fallback 机制

#### 测试无 API Key 情况
```bash
# 临时移除 GOOGLE_PLACES_API_KEY
unset GOOGLE_PLACES_API_KEY
curl "http://localhost:3001/api/spend/today?nocache=1"
```

预期：返回 seed 数据（6 条）

#### 测试 API 失败情况
模拟 API 错误（修改代码或使用无效 key），应该：
1. 尝试读取 stale cache
2. 如果 cache 失败，使用 seed 数据
3. 永远返回 6 条，不显示"暂无推荐"

### 6. 验证前端集成

1. 启动前端开发服务器：
```bash
cd client
pnpm dev
```

2. 访问 `http://localhost:3000`
3. 检查 "今天怎么花钱" section
4. 验证显示 6 条推荐
5. 验证格式：`"今天可以去 · 奶茶"` / `"TP Tea – Cupertino"` / `"⭐ 4.4"`

---

## 调试技巧

### 查看日志
API 会输出以下日志：
- `[API /api/spend/today] Cache bypass requested` - 缓存绕过
- `[Spend Today] Error fetching...` - 某个城市/类别获取失败
- `[API /api/spend/today] Only found X places from Google, using seed data as fallback` - 使用 fallback

### 常见问题

1. **API 返回空数组**
   - 检查 `GOOGLE_PLACES_API_KEY` 是否配置
   - 检查 API Key 是否启用了 Places API
   - 检查 API 配额是否用完

2. **距离显示为 0**
   - 这是正常的，Google Places Text Search 不返回距离
   - 前端会隐藏距离显示

3. **照片不显示**
   - 检查 `photo_url` 字段是否存在
   - 检查 API Key 是否有权限访问 Place Photos

---

## 性能考虑

- **缓存**: 24 小时 TTL，减少 API 调用
- **并发**: 串行请求，避免 rate limit
- **延迟**: 每个请求后延迟 200ms
- **Fallback**: 确保永远有数据返回

---

## 成本估算

Google Places API 定价（2024）：
- Text Search: $32 per 1000 requests
- Place Details: $17 per 1000 requests（用于获取照片）

**每日成本估算**：
- 12 次 Text Search（3 城市 × 4 类别）
- 假设 6 次 Place Details（获取照片）
- 每日成本：约 $0.50（在免费额度 $200/月内）

**缓存策略**：
- 24 小时缓存 = 每天 1 次 API 调用
- 每月成本：约 $15（远低于免费额度）

---

## 下一步优化

1. **Google Maps 轻抓取**：定期更新 seed 数据
2. **华人平台提及**：从 huaren.us 等平台提取热门餐厅
3. **智能轮换**：每天轮换不同的推荐，避免重复
