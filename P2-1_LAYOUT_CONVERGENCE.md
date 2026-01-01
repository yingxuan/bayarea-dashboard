# P2-1: Layout收敛

## 改动文件
- `client/src/pages/Home.tsx` - 统一section间距，删除空模块
- `client/src/components/DealsGrid.tsx` - 统一grid breakpoints
- `client/src/components/FoodGrid.tsx` - 统一grid breakpoints和padding
- `client/src/components/NewsList.tsx` - 统一间距
- `client/src/components/GossipList.tsx` - 保持统一间距
- `client/src/components/ShowsCard.tsx` - 统一间距
- `client/src/components/FinanceOverview.tsx` - 统一padding和间距

## 改动内容

### 1. 统一grid breakpoints
- Desktop: `lg:grid-cols-3` (3列) 或 `lg:grid-cols-2` (2列)
- Tablet: `md:grid-cols-2` (2列)
- Mobile: `grid-cols-1` (1列)
- 统一使用 `md:` 作为tablet断点，`lg:` 作为desktop断点

### 2. 统一card padding/gap
- Card padding: `p-4` (统一)
- Grid gap: `gap-4` (统一)
- List spacing: `space-y-3` (统一)

### 3. 统一标题行高度
- Section标题: `mb-3` (统一)
- Section间距: `mb-8` (统一，从mb-12减少)
- Main padding: `py-6` (从py-8减少)

### 4. 删除无价值占位
- 删除空模块显示（bubbleTeaShops为空时不显示）
- 删除多余空白行
- 只在有数据时显示section

## 验证命令
```bash
npx tsc --noEmit
pnpm dev
```

## 截图点位
1. Desktop: 完整页面布局（3列grid对齐）
2. Mobile: 响应式布局（1列）
3. 关键区域: FinanceOverview indices grid (3列对齐)
