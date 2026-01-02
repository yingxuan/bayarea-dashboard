# "韭菜社区"模块实现文档

## 概述

在首页"市场要闻"模块下方新增"韭菜社区"子模块，从一亩三分地论坛抓取最新5条讨论。

---

## 改动文件列表

### 新增文件
1. **`api/community/leeks.ts`** - API 端点
   - 使用 cheerio 解析 HTML
   - 45 分钟缓存
   - 三层 fallback：API 数据 → Stale Cache → Seed 数据

2. **`client/src/components/LeekCommunity.tsx`** - 前端组件
   - 显示 5 条讨论
   - "查看更多"链接指向论坛

### 修改文件
1. **`client/src/pages/Home.tsx`**
   - 在"市场要闻"下方集成 `LeekCommunity` 组件

2. **`server/local-api-adapter.ts`**
   - 添加 `leekCommunityRoute` 函数

3. **`server/index.ts`**
   - 注册 `/api/community/leeks` 路由

---

## API 实现细节

### 端点
```
GET /api/community/leeks
```

### 请求参数
- `nocache=1` (可选) - 绕过缓存

### 响应格式
```json
{
  "status": "ok",
  "items": [
    {
      "title": "【一亩三分地】帖子标题",
      "url": "https://www.1point3acres.com/bbs/thread-xxx.html"
    }
  ],
  "count": 5,
  "asOf": "2024-01-01T12:00:00.000Z",
  "source": {
    "name": "1point3acres",
    "url": "https://www.1point3acres.com/bbs/forum.php?..."
  },
  "cache_hit": false,
  "fetched_at": "2024-01-01T12:00:00.000Z"
}
```

### 实现逻辑

1. **数据抓取**：
   - 使用 `fetch` 请求论坛列表页
   - User-Agent: `Mozilla/5.0 (compatible; BayAreaDash/1.0)`
   - 超时：5 秒

2. **HTML 解析**：
   - 使用 cheerio 解析 HTML
   - 尝试多个选择器：`.xst`, `.s.xst`, `tbody tr th a[href*="thread"]`
   - 提取标题和链接
   - 去重、trim、过滤空标题

3. **URL 处理**：
   - 相对路径转换为绝对路径
   - 确保所有链接可访问

4. **缓存策略**：
   - 45 分钟 TTL
   - 成功 → 写入 cache
   - 失败 → 读取 stale cache
   - cache 也失败 → 使用 seed 数据

---

## 前端 UI

### 位置
- 在"市场要闻"模块下方
- 与"市场要闻"在同一列（中间列）

### 显示内容
- 标题：**韭菜社区**
- 列表：5 条讨论，每条显示：
  - • 【一亩三分地】标题
  - 点击新窗口打开
- 右上角："查看更多 →" 链接指向论坛

### 样式
- 使用 `glow-border` 样式
- 悬停效果：边框变亮、背景变深
- 外部链接图标

---

## 验证步骤

### 1. 启动服务器

```bash
# 启动后端
pnpm dev:server

# 启动前端（另一个终端）
pnpm dev
```

### 2. 测试 API

```powershell
# 测试正常请求
Invoke-WebRequest -Uri "http://localhost:3001/api/community/leeks" -Method GET

# 测试绕过缓存
Invoke-WebRequest -Uri "http://localhost:3001/api/community/leeks?nocache=1" -Method GET

# 查看 JSON 响应
$response = Invoke-WebRequest -Uri "http://localhost:3001/api/community/leeks?nocache=1" -Method GET
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

### 3. 验证前端

1. 访问 `http://localhost:3000`
2. 在"今天怎么赚钱"section 中
3. 找到"解释型市场要闻"模块
4. 下方应该显示"韭菜社区"模块
5. 应该看到 5 条讨论
6. 点击链接应该在新窗口打开
7. "查看更多"链接应该指向论坛

### 4. 验证 Fallback

#### 测试无网络/API 失败
```powershell
# 模拟 API 失败（修改代码或断网）
# 应该返回 seed 数据（3 条占位链接）
```

**预期**：
- 即使 API 失败，也应该显示内容（seed 数据）
- 不显示"暂无内容"
- 控制台无错误

---

## 调试技巧

### 查看日志
API 会输出以下日志：
- `[API /api/community/leeks] Cache bypass requested` - 缓存绕过
- `[Leek Community] No posts found in HTML, using seed data` - 解析失败，使用 seed
- `[API /api/community/leeks] Only found X items, using seed data as fallback` - 部分使用 seed
- `[API /api/community/leeks] All sources failed, using seed data as last resort` - 完全失败，使用 seed

### 常见问题

1. **解析不到帖子**
   - 检查论坛 HTML 结构是否变化
   - 查看控制台日志中的 HTML 片段
   - 可能需要更新选择器

2. **链接无法打开**
   - 检查 URL 是否正确转换为绝对路径
   - 确认论坛链接格式

3. **显示为空**
   - 检查 API 是否返回数据
   - 查看浏览器控制台错误
   - 确认 fallback 机制是否工作

---

## 技术细节

### HTML 解析策略
- 使用 cheerio（轻量级，类似 jQuery）
- 尝试多个选择器以提高兼容性
- 去重基于标题（不区分大小写）

### 缓存配置
- TTL: 45 分钟（平衡实时性和 API 调用）
- Cache Key: `leek-community`
- Stale Cache: 无过期限制（作为 fallback）

### Seed 数据
- 3 条固定占位链接
- 指向论坛首页
- 确保永远有内容显示

---

## 验收清单

- [ ] API 端点 `/api/community/leeks` 可访问
- [ ] 返回 5 条讨论（或 seed 数据）
- [ ] 前端显示"韭菜社区"模块
- [ ] 位置正确（市场要闻下方）
- [ ] 链接可点击（新窗口打开）
- [ ] "查看更多"链接正确
- [ ] API 失败时仍显示内容（不空）
- [ ] 控制台无报错
- [ ] 缓存机制工作正常
- [ ] Fallback 机制工作正常

---

## 下一步优化

1. **更智能的解析**：根据实际 HTML 结构调整选择器
2. **更多数据源**：添加其他华人论坛
3. **内容过滤**：根据关键词过滤相关讨论
4. **实时更新**：缩短缓存时间（如果需要）
