# Vercel 环境变量问题排查指南

## 问题：GOOGLE_PLACES_API_KEY 已添加但仍报错

### 检查清单

#### 1. 确认环境变量名称
- ✅ 正确：`GOOGLE_PLACES_API_KEY`
- ❌ 错误：`GOOGLE_PLACES_API`、`GOOGLE_PLACES_KEY`、`GOOGLE_PLACES_API_KEY_` 等

#### 2. 检查环境变量作用域
在 Vercel Dashboard → Settings → Environment Variables 中：

- **Production**: 生产环境（主域名）
- **Preview**: 预览环境（PR 部署）
- **Development**: 本地开发（通常不需要）

**重要**：确保环境变量已添加到正确的环境！

如果只在 Production 添加，Preview 部署会找不到变量。

#### 3. 重新部署
添加或修改环境变量后，**必须重新部署**才能生效：

1. 在 Vercel Dashboard → Deployments
2. 找到最新的部署
3. 点击 "..." → "Redeploy"
4. 或者推送新的 commit 触发自动部署

#### 4. 检查部署日志
在 Vercel Dashboard → Deployments → 选择部署 → Logs：

查找以下日志：
```
[Spend Today] GOOGLE_PLACES_API_KEY status: Set (length: XX)
```

如果看到：
```
[Spend Today] GOOGLE_PLACES_API_KEY status: Not set
```

说明环境变量确实没有加载。

#### 5. 验证环境变量值
在 Vercel Dashboard → Settings → Environment Variables：

- 点击环境变量右侧的 "..." → "View"
- 确认值不为空
- 确认没有多余的空格或换行

#### 6. 检查环境变量是否被覆盖
某些情况下，`.env` 文件或其他配置可能覆盖了 Vercel 的环境变量。

检查项目根目录是否有：
- `.env` 文件（不应该提交到 Git）
- `.env.local` 文件
- `.env.production` 文件

#### 7. 使用 Vercel CLI 验证
```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 查看环境变量
vercel env ls
```

### 快速修复步骤

1. **在 Vercel Dashboard 确认**：
   - Settings → Environment Variables
   - 确认 `GOOGLE_PLACES_API_KEY` 存在
   - 确认已添加到 **Production** 和 **Preview**

2. **重新部署**：
   - Deployments → 最新部署 → Redeploy
   - 或推送空 commit：`git commit --allow-empty -m "Trigger redeploy" && git push`

3. **检查日志**：
   - 部署完成后，查看 Function Logs
   - 查找 `[Spend Today] GOOGLE_PLACES_API_KEY status` 日志

4. **如果仍然失败**：
   - 检查 API key 是否有效（在 Google Cloud Console 验证）
   - 检查 API key 是否有正确的权限（Places API (New)）
   - 检查 API key 是否启用了正确的 API

### 临时解决方案

如果环境变量确实无法加载，代码已经添加了 fallback 机制：
- 会使用 stale cache（如果有）
- 会使用 seed data（本地数据）
- **不会抛出错误**，会返回有效数据

### 调试信息

代码已添加调试日志，在部署日志中会看到：
```
[Spend Today] GOOGLE_PLACES_API_KEY status: Set (length: XX)
[Spend Today] All env vars containing "GOOGLE": GOOGLE_PLACES_API_KEY, ...
```

如果看到 "Not set"，说明环境变量确实没有加载。
