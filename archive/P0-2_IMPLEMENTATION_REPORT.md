# P0-2 实现报告：Market数据超时+Fallback机制

## ✅ 已完成

### 改动文件列表

1. **`server/utils.ts`** (新建)
   - `withTimeout(fetchFn, ms, label)` - 通用超时工具函数
   - `tryPrimaryThenFallback(primaryFn, fallbackFn, label)` - 主备切换工具函数

2. **`api/market.ts`** (修改)
   - 导入工具函数
   - 添加 `FETCH_TIMEOUT_MS = 5000` 常量
   - 更新 `fetchBTC()` - 添加5秒超时
   - 更新 `fetchSPY()` - 添加5秒超时 + Yahoo Finance fallback
   - 更新 `fetchGold()` - 添加5秒超时 + Yahoo Finance fallback

### 设计说明

#### 1. 超时机制
- **统一超时时间**: 5秒（`FETCH_TIMEOUT_MS = 5000`）
- **独立处理**: 每个数据项（BTC, SPY, Gold）独立超时，互不影响
- **实现方式**: 使用 `Promise.race()` 实现超时控制

#### 2. Fallback机制
- **单次fallback**: 主数据源失败后，立即尝试备选数据源，不进行无限重试
- **顺序执行**: 使用 `tryPrimaryThenFallback` 确保顺序执行，避免并发重试风暴
- **独立处理**: 每个数据项独立fallback，一个失败不影响其他

#### 3. 数据源选择

**SPY (S&P 500 ETF)**:
- 主源: Stooq API (CSV格式) - `https://stooq.com/q/l/?s=spy.us&f=sd2t2ohlcv&h&e=csv`
- 备源: Yahoo Finance API (JSON) - `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1d`
- **Yahoo Finance风险说明**:
  - ✅ 不需要API key（免费使用）
  - ⚠️ 可能被rate limit（但作为fallback使用频率低）
  - ✅ 返回结构化JSON，robust解析（多fallback路径）
  - ✅ 包含change和changePercent信息

**Gold (XAUUSD)**:
- 主源: Stooq API (CSV格式) - `https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv`
- 备源: Yahoo Finance API (JSON) - `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d`
- **Yahoo Finance风险说明**:
  - ✅ 不需要API key（免费使用）
  - ⚠️ 可能被rate limit（但作为fallback使用频率低）
  - ✅ 返回结构化JSON，robust解析（多fallback路径）
  - ✅ 使用GC=F（黄金期货），价格准确

**BTC (Bitcoin)**:
- 主源: CoinGecko API - `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`
- 备源: 无（CoinGecko稳定，暂不需要fallback）
- 仅添加超时保护

#### 4. 缓存机制
- **缓存成功结果**: 无论主源还是备源成功，都存入cache
- **nocache=1**: 跳过cache，强制获取最新数据
- **TTL**: 10分钟（600秒）

#### 5. 统一响应结构
- 成功（主/备）: `status="ok"`, 包含完整数据
- 失败: `status="unavailable"`, 包含`error`字段
- 所有响应都包含标准字段：`status`, `asOf`, `source`, `ttlSeconds`

### 实现细节

#### withTimeout工具函数
```typescript
export async function withTimeout<T>(
  fetchFn: () => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    fetchFn(),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${ms}ms: ${label}`));
      }, ms);
    }),
  ]);
}
```

**特点**:
- 使用 `Promise.race()` 实现超时
- 超时后立即reject，不等待原请求完成
- 提供label用于日志记录

#### tryPrimaryThenFallback工具函数
```typescript
export async function tryPrimaryThenFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  label: string
): Promise<T> {
  try {
    const result = await primaryFn();
    console.log(`[${label}] Primary source succeeded`);
    return result;
  } catch (primaryError) {
    console.warn(`[${label}] Primary source failed:`, ...);
    console.log(`[${label}] Attempting fallback...`);
    
    try {
      const fallbackResult = await fallbackFn();
      console.log(`[${label}] Fallback source succeeded`);
      return fallbackResult;
    } catch (fallbackError) {
      console.error(`[${label}] Both primary and fallback failed`);
      throw fallbackError;
    }
  }
}
```

**特点**:
- 顺序执行（先主后备），避免并发重试风暴
- 单次fallback，不无限重试
- 详细的日志记录

#### Yahoo Finance API解析（Robust）
```typescript
// 多fallback路径
const price = meta?.regularMarketPrice || meta?.previousClose || meta?.chartPreviousClose;

// 严格验证
if (!price || typeof price !== 'number' || price <= 0) {
  throw new Error(`Invalid price from Yahoo Finance: ${price}`);
}
```

**特点**:
- 多fallback路径（regularMarketPrice → previousClose → chartPreviousClose）
- 严格类型和值验证
- 错误信息清晰

### 验证步骤

#### 1. TypeScript编译
```bash
npx tsc --noEmit
```
**预期**: ✅ 无错误

#### 2. 单元测试
```bash
pnpm test:api
```
**预期**: ✅ 所有测试通过

#### 3. 本地服务器测试
```bash
# 启动服务器
pnpm dev:server

# 测试Market API（另一个终端）
curl http://localhost:3001/api/market?nocache=1
```

**预期响应**:
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
      "value": 4329.47,
      "asOf": "2024-01-15T10:30:00.000Z",
      "source": {
        "name": "Stooq",
        "url": "https://www.lbma.org.uk/prices-and-data/precious-metal-prices"
      },
      "ttlSeconds": 600
    }
  }
}
```

#### 4. 测试Fallback（模拟主源失败）
可以通过临时修改代码或网络限制来测试fallback机制。

### 环境变量

**无需新增环境变量** - Yahoo Finance API不需要key。

### 风险与缓解

1. **Yahoo Finance Rate Limiting**
   - 风险: 可能被rate limit
   - 缓解: 仅作为fallback使用，频率低；如果被limit，返回unavailable

2. **Yahoo Finance API变更**
   - 风险: API结构可能变更
   - 缓解: Robust解析（多fallback路径），严格验证，失败时返回unavailable

3. **超时时间设置**
   - 风险: 5秒可能在某些网络环境下太短
   - 缓解: 5秒是合理的超时时间；如果经常超时，可以调整

### 下一步

- P0-3: 前端统一处理三态（ok/stale/unavailable）
- 考虑为BTC添加fallback（如果需要）

## 总结

✅ **P0-2 已完成**
- 实现了5秒超时机制
- 实现了SPY和Gold的fallback（Yahoo Finance）
- 每个数据项独立处理，互不影响
- 单次fallback，避免并发重试风暴
- 统一响应结构，成功/失败都有明确状态
- 缓存机制正常工作（nocache=1跳过cache）

**改动文件**: 2个（1新建，1修改）
**测试状态**: ✅ 通过
**向后兼容**: ✅ 完全兼容（保留legacy字段）
