# P0-3 实现总结：前端统一处理三态渲染

## ✅ 改动文件列表

1. **`client/src/components/FinanceOverview.tsx`** (修改)
   - 更新接口定义，添加新字段支持
   - 添加辅助函数（getSourceInfo, getStatus, getNumericValue）
   - 更新数据处理逻辑（优先新字段，fallback legacy）
   - 更新渲染逻辑（根据status显示不同UI）

## 三种状态的UI行为

### 1. status="ok" (正常)
- ✅ 正常显示数值和涨跌
- ✅ 显示source链接
- ✅ 正常颜色和样式

### 2. status="stale" (过期)
- ⚠️ 正常显示数值
- ⚠️ 右上角黄色时钟图标
- ⚠️ "数据可能已过期"提示
- ⚠️ 不显示涨跌信息

### 3. status="unavailable" (不可用)
- ❌ **不显示旧值**
- ❌ 显示"不可用"文字
- ❌ 显示错误信息（如果有）
- ❌ 右上角红色警告图标
- ✅ 显示"查看来源"链接
- ✅ 卡片透明度降低

## 向后兼容性

- ✅ 优先使用新字段（status, source, asOf）
- ✅ Fallback到legacy字段（source_name, source_url, as_of）
- ✅ 安全降级：字段缺失时使用默认值或根据value判断

## 验证步骤

### 1. 编译检查
```bash
npx tsc --noEmit
```

### 2. 启动开发环境
```bash
pnpm dev:full
```

### 3. 浏览器验证
- 打开 `http://localhost:3000`
- 检查 FinanceOverview 组件
- 正常状态：数值和涨跌正常显示
- unavailable状态：显示"不可用" + 错误信息 + "查看来源"链接

### 4. 模拟 unavailable（可选）
- 方法1：临时修改API返回unavailable
- 方法2：断网测试
- 方法3：使用 `?nocache=1` 并让一个源失败

## 总结

✅ **P0-3 已完成**
- ✅ 三态处理统一
- ✅ 向后兼容
- ✅ unavailable不显示旧值
- ✅ 友好提示和可点击链接
- ✅ 不重构整体布局

**测试状态**: ✅ 通过编译
**向后兼容**: ✅ 完全兼容
