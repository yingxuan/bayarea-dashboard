# 吃瓜模块验证步骤

## 1. 正常情况测试（Live 抓取成功）

```bash
# 测试正常抓取
curl http://localhost:3001/api/community/gossip

# 预期：
# - sources.1point3acres.items 包含 >= 3 条真实帖子链接
# - sources.blind.items 包含 >= 3 条真实帖子链接
# - 所有 URL 都是具体帖子（thread-xxx 或 /topic/xxx），不是列表页
```

## 2. 模拟 Live 失败（测试 Warm Seed）

修改 `api/community/gossip.ts` 中的 `fetch1P3A` 和 `fetchBlind` 函数，在开头添加：

```typescript
// 临时模拟失败（测试用）
if (process.env.MOCK_LIVE_FAIL === '1') {
  throw new Error('Mocked live fetch failure');
}
```

然后测试：

```bash
# 设置环境变量模拟失败
export MOCK_LIVE_FAIL=1

# 重启服务器
# 然后测试
curl http://localhost:3001/api/community/gossip

# 预期：
# - 如果之前有成功的 live 抓取，应该返回 warm seed（真实帖子）
# - sources.1point3acres.note 应该是 "warm seed"
# - sources.1point3acres.status 应该是 "degraded"
# - 所有 items 仍然是真实帖子链接
```

## 3. 完全断网测试（测试 Built-in Seed）

```bash
# 断开网络或阻止对 1point3acres.com 和 teamblind.com 的访问
# 然后测试
curl http://localhost:3001/api/community/gossip

# 预期：
# - 如果 warm seed 为空（第一次部署），返回 built-in seed
# - sources.1point3acres.note 应该是 "Error occurred, using built-in seed"
# - sources.1point3acres.status 应该是 "failed"
# - 至少返回 1 条可访问的链接（forum-98-1.html 作为最后兜底）
```

## 4. 验证 URL 有效性

```bash
# 获取响应并检查 URLs
curl http://localhost:3001/api/community/gossip | jq '.sources.1point3acres.items[].url'
curl http://localhost:3001/api/community/gossip | jq '.sources.blind.items[].url'

# 手动验证：
# - 1point3acres URLs 应该包含 thread- 或 viewthread
# - Blind URLs 应该包含 /topic/ 或 /post/ 或有效路径
# - 不应该包含 forum-98-1.html（除非是 built-in seed）
# - 不应该包含 /trending 或 /public
```

## 5. 验证 Warm Seed 持久化

```bash
# 第一次请求（应该成功并保存 warm seed）
curl http://localhost:3001/api/community/gossip > /dev/null

# 等待几秒，然后模拟失败
export MOCK_LIVE_FAIL=1

# 第二次请求（应该使用 warm seed）
curl http://localhost:3001/api/community/gossip | jq '.sources.1point3acres.note'
# 应该输出: "warm seed"
```

## 验收标准

✅ **每个分组至少 3 条**  
✅ **每条 URL 都是具体帖子（可点击打开）**  
✅ **断网情况下仍返回 >= 3 条（来自 warm seed 或 built-in seed）**  
✅ **source/status 正确标注（warm seed 标注为 "warm seed"）**  
✅ **不允许占位符 URL（thread-999999 等）**
