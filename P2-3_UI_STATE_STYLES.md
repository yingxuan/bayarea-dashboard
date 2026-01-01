# P2-3: 统一UI空态/时间戳样式

## 改动文件

### 新建共用组件
- `client/src/components/DataStateBadge.tsx` - 统一status显示（ok/stale/unavailable）
- `client/src/components/TimeAgo.tsx` - 统一相对时间显示，hover显示ISO
- `client/src/components/SourceLink.tsx` - 统一source链接显示，位置固定

### 更新组件
- `client/src/components/FinanceOverview.tsx` - 使用共用组件
- `client/src/components/NewsList.tsx` - 使用共用组件
- `client/src/components/GossipList.tsx` - 使用共用组件
- `client/src/components/DealsGrid.tsx` - 使用共用组件
- `client/src/components/ShowsCard.tsx` - 使用共用组件
- `client/src/components/FoodGrid.tsx` - 使用共用组件
- `client/src/components/VideoGrid.tsx` - 使用共用组件

## 改动内容

### 1. DataStateBadge组件
- ok: 绿色CheckCircle2图标 + "正常"
- stale: 黄色Clock图标 + "过期"
- unavailable: 红色AlertCircle图标 + "不可用"
- 统一视觉样式和tooltip

### 2. TimeAgo组件
- 显示相对时间（刚刚/分钟前/小时前/天前/周前）
- hover显示完整ISO时间戳
- 统一字体和颜色（text-xs text-muted-foreground font-mono）

### 3. SourceLink组件
- 位置固定：`card-bottom`（卡片右下角）或`title-row`（标题行）
- 统一样式：蓝色链接 + ExternalLink图标
- 自动处理空URL（不显示）

## 验证命令
```bash
npx tsc --noEmit
pnpm dev
```
