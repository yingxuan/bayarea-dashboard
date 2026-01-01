# P0-1: 统一Market API响应结构

## 改动说明

### 目标
统一Market API响应结构，遵循标准格式：`{status, value, asOf, source, ttlSeconds, error?}`

### 修改的文件
- `api/market.ts` - 统一所有数据项的响应结构

### 具体改动

#### 1. 更新 `MarketDataItem` 接口
- ✅ 添加 `status: "ok" | "stale" | "unavailable"`
- ✅ 添加 `asOf: string` (标准字段名)
- ✅ 添加 `source: {name: string, url: string}` (标准结构)
- ✅ 添加 `ttlSeconds: number` (缓存TTL)
- ✅ 添加 `error?: string` (仅当status === "unavailable"时)
- ✅ 保留legacy字段 (`source_name`, `source_url`, `as_of`) 用于向后兼容

#### 2. 更新所有fetch函数
- ✅ `fetchBTC()` - 返回标准结构，status="ok"或"unavailable"
- ✅ `fetchSPY()` - 返回标准结构，status="ok"或"unavailable"
- ✅ `fetchGold()` - 返回标准结构，status="ok"或"unavailable"
- ✅ `fetchMortgageRate()` - 返回标准结构，status="unavailable"
- ✅ `fetchPowerball()` - 返回标准结构，status="unavailable"

### 响应结构示例

#### 成功响应 (status="ok")
```json
{
  "name": "BTC",
  "value": 88551,
  "unit": "USD",
  "status": "ok",
  "asOf": "2024-01-15T10:30:00.000Z",
  "source": {
    "name": "CoinGecko",
    "url": "https://www.coingecko.com/en/coins/bitcoin"
  },
  "ttlSeconds": 600,
  "source_name": "CoinGecko",  // Legacy
  "source_url": "https://...",  // Legacy
  "as_of": "2024-01-15T10:30:00.000Z"  // Legacy
}
```

#### 不可用响应 (status="unavailable")
```json
{
  "name": "POWERBALL",
  "value": "Unavailable",
  "unit": "USD",
  "status": "unavailable",
  "asOf": "2024-01-15T10:30:00.000Z",
  "source": {
    "name": "Powerball.com",
    "url": "https://www.powerball.com/"
  },
  "ttlSeconds": 0,
  "error": "Scraping not allowed, no reliable API available"
}
```

### 向后兼容性
✅ **完全向后兼容** - 保留了所有legacy字段，前端代码无需立即修改

### 验证命令

#### 1. 本地测试
```bash
pnpm test:api
```
**预期**: 所有测试通过，响应包含新字段和legacy字段

#### 2. 本地服务器测试
```bash
pnpm dev:server
# 在另一个终端
curl http://localhost:3001/api/market?nocache=1
```
**预期**: 响应包含 `status`, `asOf`, `source`, `ttlSeconds` 字段

#### 3. 前端验证
```bash
pnpm dev:full
# 打开浏览器 http://localhost:3000
# 检查 FinanceOverview 组件是否正常显示
```
**预期**: 前端正常显示，因为legacy字段仍然存在

### 下一步
- P0-2: 添加超时处理和fallback数据源
- P0-3: 前端统一处理三态（ok/stale/unavailable）
