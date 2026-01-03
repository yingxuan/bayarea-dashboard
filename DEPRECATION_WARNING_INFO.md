# Node.js Deprecation Warning: url.parse()

## 警告信息

```
[DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead.
```

## 原因

这个警告来自**第三方依赖库**（很可能是 `cheerio`），而不是项目代码本身。

## 验证

项目代码中已经正确使用了 WHATWG URL API：

```typescript
// ✅ 正确使用（在多个文件中）
url = new URL(href, baseUrl).toString();
const urlObj = new URL(url);
```

**没有使用**已弃用的 `url.parse()`。

## 影响

- **功能**: ✅ 正常工作，不影响功能
- **安全性**: ⚠️ 警告来自依赖库内部，不影响项目代码
- **性能**: ✅ 无影响

## 解决方案

### 选项 1: 忽略警告（推荐）

这是一个 deprecation warning，不是错误。功能正常工作，可以暂时忽略。

### 选项 2: 更新依赖

检查是否有更新版本的依赖库修复了这个问题：

```bash
# 检查 cheerio 最新版本
pnpm outdated cheerio

# 如果有新版本，更新
pnpm update cheerio
```

### 选项 3: 抑制警告（不推荐）

如果需要，可以在启动时抑制特定警告：

```bash
NODE_OPTIONS="--no-deprecation" pnpm dev
```

**注意**: 不推荐，因为这会隐藏所有 deprecation warnings，可能错过其他重要警告。

## 当前状态

- ✅ 项目代码使用正确的 WHATWG URL API
- ⚠️ 警告来自第三方依赖（cheerio）
- ✅ 功能正常工作
- 📝 等待依赖库更新修复

## 相关文件

使用 `new URL()` 的文件：
- `api/market-news.ts`
- `api/community/leeks.ts`
- `api/community/gossip.ts`
