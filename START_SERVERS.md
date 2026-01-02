# 启动开发服务器

## 问题
Vite 前端服务器正在运行，但后端 API 服务器（端口 3001）没有运行，导致代理错误：
```
[vite] http proxy error: /api/spend/today
AggregateError [ECONNREFUSED]
```

## 解决方案

### 方法 1: 同时启动前后端（推荐）

在项目根目录运行：
```bash
pnpm dev:full
```

这会同时启动：
- 后端服务器：`http://localhost:3001`
- 前端服务器：`http://localhost:3000`

### 方法 2: 分别启动（两个终端）

**终端 1 - 后端服务器：**
```bash
pnpm dev:server
```

**终端 2 - 前端服务器：**
```bash
pnpm dev
```

### 方法 3: 只启动前端（如果不需要后端 API）

如果只想测试前端，可以修改 `vite.config.ts` 中的代理配置，或者直接使用前端。

## 验证服务器运行状态

### 检查后端服务器（端口 3001）
```powershell
netstat -ano | findstr :3001
```

如果看到 `LISTENING`，说明后端服务器正在运行。

### 检查前端服务器（端口 3000）
```powershell
netstat -ano | findstr :3000
```

### 测试 API 端点
```powershell
# 测试后端 API
Invoke-WebRequest -Uri "http://localhost:3001/api/spend/today" -Method GET

# 测试前端代理
Invoke-WebRequest -Uri "http://localhost:3000/api/spend/today" -Method GET
```

## 常见问题

### 1. 端口已被占用
如果 3001 或 3000 端口被占用：
- 停止占用端口的进程
- 或修改 `vite.config.ts` 和 `server/index.ts` 中的端口配置

### 2. 后端服务器启动失败
检查：
- `.env` 文件是否存在
- 依赖是否已安装：`pnpm install`
- TypeScript 编译是否有错误

### 3. 代理仍然失败
确保：
- 后端服务器在 `http://localhost:3001` 运行
- Vite 配置中的 `proxy.target` 指向正确的地址
- 防火墙没有阻止连接
