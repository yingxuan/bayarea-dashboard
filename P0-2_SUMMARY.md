# P0-2 实现总结：Market数据超时+Fallback

## ✅ 改动文件列表

1. **`server/utils.ts`** (新建)
   - `withTimeout(fetchFn, ms, label)` - 通用超时工具
   - `tryPrimaryThenFallback(primaryFn, fallbackFn, label)` - 主备切换工具

2. **`api/market.ts`** (修改)
   - 导入工具函数
   - 添加 `FETCH_TIMEOUT_MS = 5000`
   - `fetchBTC()` - 添加5秒超时
   - `fetchSPY()` - 添加5秒超时 + Yahoo Finance fallback
   - `fetchGold()` - 添加5秒超时 + Yahoo Finance fallback

## 为什么这样设计

### 1. 超时机制 (5秒)
- **原因**: 防止API hang导致整个请求阻塞
- **实现**: `Promise.race()` 实现超时控制
- **独立处理**: 每个数据项独立超时，互不影响

### 2. Fallback机制
- **原因**: 提高数据可用性，主源失败时自动切换备源
- **实现**: 顺序执行（先主后备），避免并发重试风暴
- **单次fallback**: 不无限重试，失败后返回unavailable

### 3. 数据源选择

**SPY Fallback: Stooq → Yahoo Finance**
- Yahoo Finance API不需要key（免费）
- 风险：可能被rate limit，但作为fallback使用频率低
- Robust解析：多fallback路径，严格验证

**Gold Fallback: Stooq → Yahoo Finance (GC=F)**
- 使用GC=F（黄金期货），价格准确
- 同样不需要key，robust解析

### 4. 缓存机制
- **缓存成功结果**: 无论主/备成功，都存入cache
- **nocache=1**: 跳过cache，强制获取最新数据
- **TTL**: 10分钟（600秒）

## 验证步骤

### 1. TypeScript编译
```bash
npx tsc --noEmit
```
**结果**: ✅ 通过

### 2. 单元测试
```bash
pnpm test:api
```
**结果**: ✅ 通过 (10/10 for Market API)

### 3. 本地服务器测试
```bash
# 启动服务器
pnpm dev:server

# 测试API（另一个终端）
curl http://localhost:3001/api/market?nocache=1
```

**预期响应示例**:
```json
{
  "data": {
    "spy": {
      "status": "ok",
      "value": 681.92,
      "asOf": "2024-01-15T10:30:00.000Z",
      "source": {
        "name": "Stooq",
        "url": "https://finance.yahoo.com/quote/SPY/"
      },
      "ttlSeconds": 600
    },
    "gold": {
      "status": "ok",
      "value": 4330.265,
      "asOf": "2024-01-15T10:30:00.000Z",
      "source": {
        "name": "Stooq",
        "url": "https://www.lbma.org.uk/prices-and-data/precious-metal-prices"
      },
      "ttlSeconds": 600
    }
  },
  "fetched_at": "2024-01-15T10:30:00.000Z",
  "cache_hit": false
}
```

### 4. 测试Fallback（可选）
可以通过临时修改代码或网络限制来测试fallback机制。

## 环境变量

**无需新增环境变量** - Yahoo Finance API不需要key。

## 总结

✅ **P0-2 已完成**
- ✅ 5秒超时机制
- ✅ SPY和Gold的fallback（Yahoo Finance）
- ✅ 每个数据项独立处理
- ✅ 单次fallback，避免并发重试风暴
- ✅ 统一响应结构
- ✅ 缓存机制正常工作

**测试状态**: ✅ 通过
**向后兼容**: ✅ 完全兼容
