# 重启服务器以加载新路由

## 问题
新添加的 `/api/spend/today` 路由需要重启服务器才能生效。

## 解决步骤

### 1. 停止当前服务器
在运行服务器的终端中按 `Ctrl+C` 停止服务器。

### 2. 重新启动服务器
```bash
cd server
pnpm dev:server
```

或者从项目根目录：
```bash
pnpm dev:server
```

### 3. 验证路由
服务器启动后，测试新路由：

**PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/spend/today" -Method GET | Select-Object -ExpandProperty Content
```

**或者使用 curl (如果已安装):**
```bash
curl http://localhost:3001/api/spend/today
```

**预期响应:**
- 如果 API Key 已配置：返回 Google Places 数据（6 条推荐）
- 如果 API Key 未配置：返回 seed 数据（6 条推荐）
- 永远不返回空数组或错误

### 4. 检查服务器日志
启动服务器时，应该看到：
```
Server running on http://localhost:3001/
```

如果看到导入错误，检查：
- `api/spend/today.ts` 文件是否存在
- `server/local-api-adapter.ts` 中的导入路径是否正确
- 所有依赖是否正确安装

## 快速验证命令

```powershell
# 测试路由是否存在
Invoke-WebRequest -Uri "http://localhost:3001/api/spend/today?nocache=1" -Method GET

# 查看响应内容
$response = Invoke-WebRequest -Uri "http://localhost:3001/api/spend/today?nocache=1" -Method GET
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

## 如果仍然失败

1. **检查环境变量**：
   ```powershell
   # 检查 .env 文件是否存在
   Test-Path .env
   
   # 查看 .env 内容（确保 GOOGLE_PLACES_API_KEY 已设置）
   Get-Content .env | Select-String "GOOGLE_PLACES"
   ```

2. **检查文件是否存在**：
   ```powershell
   Test-Path api\spend\today.ts
   Test-Path server\local-api-adapter.ts
   ```

3. **查看服务器启动日志**：
   检查是否有导入错误或语法错误

4. **验证导入**：
   确保 `server/local-api-adapter.ts` 中正确导入了 `spendTodayHandler`
