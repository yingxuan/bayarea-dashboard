# P2-2: 信息架构按4核心块重排

## 改动文件
- `client/src/pages/Home.tsx` - 重排布局为4核心块

## 布局结构

### 首屏（3列grid）
1. **Asset Summary** (左侧) - FinanceOverview组件
2. **Market-moving News** (中间) - Industry News，重命名为"市场要闻"
3. **Videos** (右侧) - Finance/Tech两个Tab，目前为占位

### 第二屏（折叠）
4. **生活类模块** - Food, Shows, Gossip, Deals
   - 默认折叠
   - 有数据时显示"展开/收起"按钮
   - 点击展开显示所有生活类模块

## 改动内容
- 使用`lg:grid-cols-3`实现3列布局（desktop）
- 移动端自动变为1列垂直堆叠
- 生活类模块默认折叠，节省首屏空间
- 保留所有P0/P1三态显示和source link功能
- 不新增模块，只重排和折叠

## 验证命令
```bash
npx tsc --noEmit
pnpm dev
```
