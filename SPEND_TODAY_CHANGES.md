# "今天怎么花钱"模块改动总结

## 📋 改动文件列表

### ✅ 新增文件
1. **`api/spend/today.ts`** (494 行)
   - 新的 API 端点：`GET /api/spend/today`
   - 使用 Google Places Text Search API
   - 24 小时缓存机制
   - 三层 fallback：Google Places → Stale Cache → Seed Data

2. **`SPEND_TODAY_IMPLEMENTATION.md`**
   - 详细实现文档
   - 验证步骤
   - 调试指南

### ✏️ 修改文件
1. **`client/src/components/TodaySpendRecommendations.tsx`**
   - 更新 API 端点：`/api/food-recommendations` → `/api/spend/today`
   - 更新接口定义：支持 `maps_url`, `user_ratings_total`
   - 兼容旧字段：`url`, `review_count` (向后兼容)

2. **`server/local-api-adapter.ts`**
   - 添加 `spendTodayRoute` 函数（本地开发支持）

3. **`server/index.ts`**
   - 注册 `/api/spend/today` 路由
   - 更新 API endpoints 列表

4. **`API_REQUIREMENTS.md`**
   - 添加 `GOOGLE_PLACES_API_KEY` 说明
   - 更新必需 API 列表
   - 更新功能与 API 对应关系表

### 📦 保留文件（未修改，作为 fallback）
- **`shared/food-seed-data.ts`** - 本地 seed 数据

---

## 🔧 本地验证步骤

### 1. 环境变量配置

**创建/更新 `.env` 文件**：
```bash
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

### 2. 启动本地服务器

```bash
# 在项目根目录
cd server
pnpm dev
```

服务器将在 `http://localhost:3001` 启动

### 3. 测试 API 端点

#### 测试 1: 正常请求（使用缓存）
```bash
curl "http://localhost:3001/api/spend/today"
```

**预期响应**：
- `status: "ok"`
- `items: [...]` (6 条推荐)
- `count: 6`
- `cache_hit: false` (首次请求)

#### 测试 2: 绕过缓存
```bash
curl "http://localhost:3001/api/spend/today?nocache=1"
```

**预期响应**：
- `status: "ok"`
- `items: [...]` (6 条推荐)
- `cache_mode: "bypass"`

#### 测试 3: 验证缓存（第二次请求）
```bash
curl "http://localhost:3001/api/spend/today"
```

**预期响应**：
- `cache_hit: true`
- `cache_age_seconds: < 60` (刚缓存的数据)

#### 测试 4: 验证 Fallback（无 API Key）
```bash
# 临时移除环境变量
unset GOOGLE_PLACES_API_KEY
curl "http://localhost:3001/api/spend/today?nocache=1"
```

**预期响应**：
- `status: "ok"`
- `items: [...]` (6 条 seed 数据)
- `source.name: "Local Seed Data"`
- `fallback: "seed"`

### 4. 验证响应格式

检查每个 item 是否包含所有必需字段：

```bash
curl "http://localhost:3001/api/spend/today?nocache=1" | jq '.items[0]'
```

**必需字段**：
- ✅ `id` (string)
- ✅ `name` (string)
- ✅ `category` (string: 奶茶/中餐/咖啡/甜品)
- ✅ `rating` (number, >= 4.2)
- ✅ `user_ratings_total` (number, >= 50)
- ✅ `address` (string)
- ✅ `maps_url` (string, Google Maps 链接)
- ✅ `city` (string: Cupertino/Sunnyvale/San Jose)
- ✅ `score` (number)

**可选字段**：
- `photo_url` (string, 可选)
- `distance_miles` (number, 可选)

### 5. 验证平衡分布

检查返回的 6 条是否平衡：

```bash
curl "http://localhost:3001/api/spend/today?nocache=1" | jq '.items | group_by(.category) | map({category: .[0].category, count: length})'
```

**预期**：
- 奶茶: 2 条
- 中餐: 2 条
- 咖啡: 1 条
- 甜品: 1 条

### 6. 验证前端集成

1. 启动前端：
```bash
cd client
pnpm dev
```

2. 访问 `http://localhost:3000`

3. 检查 "今天怎么花钱" section：
   - ✅ 显示 6 条推荐
   - ✅ 格式正确："今天可以去 · 奶茶" / "TP Tea – Cupertino" / "⭐ 4.4"
   - ✅ 链接可点击（打开 Google Maps）
   - ✅ 不显示"暂无推荐"

---

## 🐛 调试技巧

### 查看 API 日志

API 会输出以下日志：

```
[API /api/spend/today] Cache bypass requested via ?nocache=1
[Spend Today] Error fetching 奶茶 in cupertino: ...
[API /api/spend/today] Only found 4 places from Google, using seed data as fallback
[API /api/spend/today] All sources failed, using seed data as last resort
```

### 常见问题排查

1. **API 返回空数组**
   - ✅ 检查 `GOOGLE_PLACES_API_KEY` 是否配置
   - ✅ 检查 API Key 是否启用了 Places API
   - ✅ 检查 API 配额是否用完
   - ✅ 查看服务器日志中的错误信息

2. **距离不显示**
   - ✅ 这是正常的，Google Places Text Search 不返回距离
   - ✅ 前端会隐藏距离显示（如果 `distance_miles` 为 undefined）

3. **照片不显示**
   - ✅ 检查 `photo_url` 字段是否存在
   - ✅ 检查 API Key 是否有权限访问 Place Photos
   - ✅ 照片是可选的，不影响功能

4. **Fallback 到 seed 数据**
   - ✅ 检查日志确认原因
   - ✅ 如果 Google Places API 失败，会自动使用 seed 数据
   - ✅ 确保永远返回 6 条，不显示"暂无推荐"

---

## 📊 性能与成本

### API 调用次数
- 每天：12 次 Text Search（3 城市 × 4 类别）
- 缓存：24 小时 TTL = 每天 1 次实际 API 调用
- 每月：约 30 次 Text Search

### 成本估算
- Text Search: $32 per 1000 requests
- 每月成本：约 $1（在免费额度 $200/月内）✅

### 缓存策略
- ✅ 24 小时缓存，大幅减少 API 调用
- ✅ Stale cache fallback，确保高可用性
- ✅ Seed data fallback，确保永远有数据

---

## ✅ 验证清单

- [ ] 环境变量 `GOOGLE_PLACES_API_KEY` 已配置
- [ ] API 端点 `/api/spend/today` 可访问
- [ ] 返回 6 条推荐
- [ ] 平衡分布：2奶茶 + 2中餐 + 1咖啡 + 1甜品
- [ ] 所有必需字段都存在
- [ ] Google Maps 链接可点击
- [ ] 缓存机制工作正常
- [ ] Fallback 机制工作正常（无 API Key 时使用 seed）
- [ ] 前端显示正确
- [ ] 不显示"暂无推荐"

---

## 🚀 部署检查

### Vercel 部署前
1. ✅ 在 Vercel Dashboard 添加 `GOOGLE_PLACES_API_KEY`
2. ✅ 确保 API Key 启用了 Places API
3. ✅ 重新部署项目

### 部署后验证
```bash
curl "https://your-domain.vercel.app/api/spend/today?nocache=1"
```

---

## 📝 下一步优化建议

1. **定期更新 seed 数据**：从 Google Maps 轻抓取热门餐厅
2. **华人平台集成**：从 huaren.us 等平台提取提及的餐厅
3. **智能轮换**：每天轮换不同的推荐，避免重复
4. **距离优化**：使用 Google Distance Matrix API 计算准确距离（可选）
