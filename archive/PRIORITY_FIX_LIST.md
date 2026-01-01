# 优先级修复清单

## P0: Market Data (票子) - 最高优先级

### 问题清单
1. ❌ **响应结构不统一** - 需要统一为 `{status, value, asOf, source, ttlSeconds, error?}`
2. ⚠️ **SPY/Gold CSV解析脆弱** - 需要fallback数据源
3. ❌ **"Unavailable"项没有明确UI状态** - 前端需要处理三态
4. ⚠️ **没有超时处理** - API调用可能hang
5. ⚠️ **没有fallback数据源** - 主数据源失败时无备选

### 修复计划

#### P0-1: 统一Market API响应结构
**文件**: `api/market.ts`
**改动**:
- 每个数据项返回标准结构: `{status, value, asOf, source, ttlSeconds, error?}`
- status: "ok" | "stale" | "unavailable"
- 保持向后兼容（前端逐步迁移）

#### P0-2: 添加超时和Fallback
**文件**: `api/market.ts`
**改动**:
- SPY: Stooq (主) → Yahoo Finance API (备)
- Gold: Stooq (主) → LBMA/Kitco API (备)
- 超时: 5秒
- 超时后返回stale cache或unavailable

#### P0-3: 前端统一处理三态
**文件**: `client/src/components/FinanceOverview.tsx`
**改动**:
- 根据status渲染不同UI
- "unavailable"时显示"不可用 - 点击查看来源" + source link
- "stale"时显示警告图标

---

## P1: News/Video - 高优先级

### 问题清单
1. ❌ 响应结构不统一
2. ⚠️ 空数组时没有明确状态
3. ⚠️ 没有超时处理

### 修复计划
- 统一响应结构
- 添加超时（10秒）
- 空数组返回 {status: "unavailable"}

---

## P2: Layout & Optional Modules - 中优先级

### 问题清单
1. ❌ 所有模块响应结构不统一
2. ⚠️ 空数组时没有明确状态
3. ⚠️ 可选模块需要API key

### 修复计划
- 统一所有API响应结构
- 添加超时处理
- 可选模块：key缺失时返回 {status: "unavailable"}
