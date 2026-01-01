# P1: 统一News API响应结构

## 改动文件
- `api/ai-news.ts` - 统一响应结构为标准格式

## 验证命令
```bash
npx tsc --noEmit
pnpm test:api
```

## 响应结构
- 标准字段: `status`, `items`, `count`, `asOf`, `source`, `ttlSeconds`, `error?`
- 保留legacy字段: `news`, `updated_at`, `fetched_at` (向后兼容)
