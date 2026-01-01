# P1-Gossip: 统一响应结构

## 改动文件
- `api/gossip.ts` - 统一响应结构，添加7天内内容过滤

## 改动内容
1. 统一响应结构: `{status, items, count, asOf, source, ttlSeconds, error?}`
2. 7天内内容优先: 过滤超过7天的stories
3. 失败返回unavailable: 错误时返回标准unavailable结构
4. 保留legacy字段: `gossip`, `updated_at` (向后兼容)

## 验证命令
```bash
npx tsc --noEmit
pnpm dev:server
curl http://localhost:3001/api/gossip?nocache=1
```

## 响应结构
- 标准字段: `status`, `items`, `count`, `asOf`, `source`, `ttlSeconds`, `error?`
- Legacy字段: `gossip`, `updated_at`, `fetched_at` (向后兼容)
