# AgentHub P0+P1 冲突处理增强 Spec

> 版本: 1.0 | 日期: 2026-08-09 | 状态: 开发中

## 概述

三个功能点，均围绕"冲突处理"主题：

| 优先级 | 功能 | 目标 |
|--------|------|------|
| P0 | 导入向导 diff 预览 | 让用户在冲突确认阶段看到两边的具体内容差异，做出知情决策 |
| P1 | Markdown 结构化合并 | 对 identity/profile.md 等有固定字段的文件，按字段粒度智能合并，避免重复追加 |
| P1 | 同步冲突预警 | 同步前检测目标工具中已有非 symlink 同名文件，提示用户将被覆盖 |

---

## P0: 导入向导 Diff 预览

### 需求

当前 ConflictDialog 只显示文件路径和大小对比，用户无法看到具体内容差异，只能盲选合并策略。

**目标**：在 Step 3 冲突确认时，点击冲突项可展开查看源文件 vs Hub 文件的内容 diff。

### 技术方案

#### 后端

新增 API 端点：`GET /api/sync/diff`

```
GET /api/sync/diff?sourcePath={absolutePath}&hubTargetPath={relativePath}
```

返回：
```json
{
  "sourceContent": "源文件内容",
  "hubContent": "Hub 已有内容（若存在）",
  "sourcePath": "...",
  "hubTargetPath": "..."
}
```

实现位置：`src/server/routes/sync.ts`

#### 前端

1. **新增 `DiffView` 组件** (`web/src/components/import/DiffView.tsx`)
   - 并排对比视图（左：源文件，右：Hub 文件）
   - 简单文本 diff：按行对比，高亮差异行
   - 用 `diff` 色系：绿色=新增行、红色=删除行、黄色=修改行

2. **改造 `ConflictDialog` 组件**
   - 新增可展开/收起区域，点击后显示 DiffView
   - 展开时异步请求 `/api/sync/diff` 获取内容
   - 保持现有策略选择按钮不变

3. **改造 `Import.tsx` Step 3**
   - 无需改动，ConflictDialog 自包含展开逻辑

### 验收标准

- [ ] 在 Step 3 点击冲突项可展开 diff 视图
- [ ] diff 视图正确显示两边内容差异（绿色新增/红色删除/黄色修改）
- [ ] 展开不阻塞策略选择（合并/覆盖/跳过按钮仍可用）
- [ ] 内容为空或无差异时显示友好提示

---

## P1: Markdown 结构化合并

### 需求

当前 `mergeMarkdown()` 粗暴地将新内容整段追加到现有内容后面。对于 `identity/profile.md` 这类有固定字段结构的文件，应做到字段级智能合并。

**示例场景**：
- Hub 已有 profile.md：`name: 张三\nrole: 前端工程师`
- WorkBuddy 导入 profile.md：`name: 张三\nrole: 全栈工程师\nskills: React, Node.js`
- 期望合并结果：`name: 张三（不变）\nrole: 全栈工程师（更新）\nskills: React, Node.js（新增）`

### 技术方案

#### 后端：`src/core/merger.ts` 新增 `mergeStructuredMarkdown()`

结构化 Markdown 解析规则：
- 识别 `**字段名**：值` 或 `- **字段名**：值` 格式的行
- 提取为 key-value map
- 合并策略：
  - Hub 中有、新内容无 → 保留 Hub 字段
  - Hub 中有、新内容有 → 优先用新内容（导入源更新）
  - Hub 中无、新内容有 → 添加新字段
  - 无法解析为结构化字段的行 → 按原方式追加

**触发条件**：
- 仅当 `hubTargetPath` 匹配 `identity/*.md` 时启用结构化合并
- 其他 `.md` 文件仍走原有 `mergeMarkdown()` 逻辑

#### 后端改动

1. `merger.ts` 新增函数：
   - `parseStructuredMd(content: string): Map<string, string>` — 解析结构化字段
   - `mergeStructuredMd(existing: string, incoming: string, source: string): { content: string; action: 'merged' }` — 结构化合并
   - `isStructuredTarget(hubTargetPath: string): boolean` — 判断是否启用结构化合并

2. `mergeFile()` 修改：对 `identity/*.md` 路径走 `mergeStructuredMd()`

#### 前端

无需改动 — 合并逻辑完全在后端，前端只展示结果。

### 验收标准

- [ ] `identity/profile.md` 合并时，相同字段用新值更新，不同字段追加
- [ ] 非结构化部分（如自由文本段落）正常追加到末尾
- [ ] 其他 `.md` 文件（如 `rules/*.md`）仍走原有追加逻辑
- [ ] 单元测试覆盖：同名字段更新、新字段添加、空内容、纯文本无结构化字段

---

## P1: 同步冲突预警

### 需求

当前同步页面（Sync.tsx）的同步计划只显示"执行什么动作"，不警告用户目标工具中已有**非 symlink 的同名文件将被覆盖**。用户可能意外丢失工具中的自定义内容。

**目标**：在同步计划中增加冲突检测，当目标路径已存在非 symlink 文件时，标记为"覆盖预警"。

### 技术方案

#### 后端：`src/core/sync-engine.ts` `planForAdapter()` 增强

在 `planForAdapter()` 中，对每个 `(item, target)` 增加检查：

```typescript
// 检查目标路径是否已有非 symlink 文件
if (existsSync(target.targetPath) && !isSymlink(target.targetPath)) {
  // 标记为覆盖预警
  return {
    item, target,
    action: target.strategy as SyncAction,
    warning: '目标路径已有非 symlink 文件，同步后将覆盖',
  };
}
```

在 `SyncPlanItem` 类型中新增 `warning?: string` 字段。

#### 前端：`Sync.tsx` 展示预警

在同步计划列表中，对 `warning` 不为空的条目显示黄色警告图标 + 警告文字。

### 验收标准

- [ ] 同步计划中，目标已有非 symlink 文件时显示警告标记
- [ ] 已是正确 symlink 的文件不显示警告（正常跳过）
- [ ] 不存在的目标路径不显示警告
- [ ] 警告不影响同步执行（用户知情后仍可执行）

---

## 实现任务清单

| # | 任务 | 涉及文件 |
|---|------|----------|
| 1 | 后端：新增 `GET /api/sync/diff` 端点 | `src/server/routes/sync.ts` |
| 2 | 前端：创建 `DiffView` 组件 | `web/src/components/import/DiffView.tsx` |
| 3 | 前端：改造 `ConflictDialog` 支持展开 diff | `web/src/components/import/ConflictDialog.tsx` |
| 4 | 后端：实现 `mergeStructuredMarkdown()` | `src/core/merger.ts` |
| 5 | 后端：`mergeFile()` 对 identity 文件启用结构化合并 | `src/core/merger.ts` |
| 6 | 后端：`SyncPlanItem` 增加 `warning` 字段 | `src/core/types.ts` |
| 7 | 后端：`planForAdapter()` 增加覆盖预警检测 | `src/core/sync-engine.ts` |
| 8 | 前端：Sync 页面展示冲突预警 | `web/src/pages/Sync.tsx` |
| 9 | 单元测试：结构化合并测试 | `tests/` 或 `src/core/merger.test.ts` |
| 10 | 构建验证 + 启动测试 | 全量 |

---

## 技术约束

- 遵循 [assetplex-constitution.md](./assetplex-constitution.md) 核心原则
- 前端组件 ≤300 行，后端函数 ≤50 行
- TypeScript 严格模式，禁止 `any`/`as`
- 保持向后兼容：不影响现有导入/同步流程