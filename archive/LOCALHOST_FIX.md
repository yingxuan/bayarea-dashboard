# localhost:3001 修复

## 问题
localhost:3001 返回空内容

## 修复
- `server/index.ts`: 修复非API路由处理，确保返回JSON响应
- 添加404处理未匹配的API路由

## 验证
```bash
# 启动服务器
pnpm dev:server

# 测试根路径（另一个终端）
curl http://localhost:3001

# 测试API
curl http://localhost:3001/api/market?nocache=1
```

## 预期响应
- 根路径: JSON消息说明前端在port 3000
- API路径: 正常返回数据
