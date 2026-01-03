# 如何在 Vercel 中查看函数日志

## 方法 1: 通过 Deployments 页面（推荐）

1. **登录 Vercel Dashboard**
   - 访问 https://vercel.com/dashboard
   - 选择你的项目 `bayarea-dashboard`

2. **进入 Deployments 页面**
   - 点击左侧菜单的 **"Deployments"**
   - 找到最新的部署（通常是列表最上面的）

3. **查看函数日志**
   - 点击最新部署的卡片
   - 在部署详情页面，向下滚动找到 **"Functions"** 部分
   - 点击 `/api/spend/today` 函数
   - 会显示该函数的调用日志

4. **查看实时日志**
   - 在函数详情页面，可以看到：
     - **Invocations**: 函数调用次数
     - **Logs**: 点击可以查看详细的日志输出
     - **Duration**: 执行时间

## 方法 2: 通过 Analytics 页面

1. **进入 Analytics**
   - 点击左侧菜单的 **"Analytics"** 或 **"Functions"**
   - 选择 **"Functions"** 标签

2. **查看函数列表**
   - 找到 `/api/spend/today` 函数
   - 点击函数名称

3. **查看日志**
   - 在函数详情页面可以看到调用历史和日志

## 方法 3: 通过 Vercel CLI（本地）

如果你安装了 Vercel CLI：

```bash
# 查看实时日志
vercel logs

# 查看特定函数的日志
vercel logs --follow

# 查看特定部署的日志
vercel logs <deployment-url>
```

## 方法 4: 直接在代码中添加日志输出

如果以上方法都找不到，可以在代码中添加更明显的日志：

在 `api/spend/today.ts` 的 handler 函数开头添加：

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 在响应头中添加调试信息（仅开发环境）
  if (process.env.VERCEL_ENV) {
    console.log('=== SPEND TODAY DEBUG ===');
    console.log('GOOGLE_PLACES_API_KEY exists:', !!process.env.GOOGLE_PLACES_API_KEY);
    console.log('GOOGLE_PLACES_API_KEY length:', process.env.GOOGLE_PLACES_API_KEY?.length || 0);
    console.log('All GOOGLE env vars:', Object.keys(process.env).filter(k => k.includes('GOOGLE')));
  }
  
  // ... 其余代码
}
```

然后在 API 响应中也可以包含调试信息（仅用于调试）：

```typescript
res.status(200).json({
  // ... 正常响应
  _debug: process.env.VERCEL_ENV ? {
    hasApiKey: !!GOOGLE_PLACES_API_KEY,
    apiKeyLength: GOOGLE_PLACES_API_KEY?.length || 0,
  } : undefined,
});
```

## 快速检查方法

最简单的方法：

1. **访问你的 API 端点**
   - 在浏览器中访问：`https://your-project.vercel.app/api/spend/today`
   - 或者添加 `?nocache=1` 强制刷新：`https://your-project.vercel.app/api/spend/today?nocache=1`

2. **查看响应**
   - 如果返回了数据，说明 API 正常工作
   - 如果返回错误，查看错误信息

3. **在 Vercel Dashboard 查看**
   - 访问后，立即去 Vercel Dashboard → Deployments → 最新部署
   - 在 Functions 部分应该能看到刚才的调用记录

## 如果仍然找不到日志

可以尝试：

1. **检查 Vercel 计划**
   - Hobby 计划可能不显示详细日志
   - 可能需要升级到 Pro 计划才能看到完整日志

2. **使用 API 响应返回调试信息**
   - 在响应中添加 `_debug` 字段（仅开发环境）
   - 直接查看 API 响应就能知道环境变量状态

3. **添加外部日志服务**
   - 使用 Sentry、LogRocket 等第三方日志服务
   - 或者使用 console.log 输出到 Vercel 的标准输出

## 推荐的调试方法

最简单有效的方法：**在 API 响应中添加调试信息**

修改 `api/spend/today.ts`，在成功响应中添加调试字段：

```typescript
res.status(200).json({
  // ... 正常数据
  _debug: {
    hasApiKey: !!GOOGLE_PLACES_API_KEY,
    apiKeyLength: GOOGLE_PLACES_API_KEY?.length || 0,
    env: process.env.VERCEL_ENV || 'local',
  },
});
```

然后直接访问 API 端点就能看到调试信息了。
