# Spec: 技能职能批量调整

## Goal

技能库有 374 个技能，逐一修改职能分类效率太低。允许用户多选技能卡片，一次性批量设置职能分类。

## Scope

- **做**：卡片多选（复选框）→ 顶部批量操作条 → 批量设置职能 → 一次 API 调用 → 刷新列表
- **做**：批量条内「全选当前筛选结果 / 清空选择」
- **不做**：批量恢复自动分类（移除覆盖）、跨页全选、批量删除技能

## Requirements

### ADDED Requirement: 批量选择技能

**Scenario: 勾选卡片进入批量模式**
- Given 技能列表已加载
- When 用户勾选某张技能卡片上的复选框
- Then 该卡片呈现选中态，顶部出现批量操作条并显示「已选 N」
- When 用户再取消该复选框且无其他选中卡片
- Then 批量操作条消失

**Scenario: 全选当前筛选结果**
- Given 技能列表按职能「编码开发」筛选出 3 张卡
- When 用户在批量操作条点击「全选」
- Then 恰好这 3 张卡被选中，批量条显示「已选 3」
- When 用户切换筛选条件或维度
- Then 选中状态清空，批量条消失

### ADDED Requirement: 批量设置职能

**Scenario: 批量应用成功**
- Given 用户已选中 3 张卡，并在批量条下拉中选择「数据处理」
- When 用户点击「应用」
- Then 前端调用批量接口一次，3 个技能的职能均变为「数据处理」且带「已手动分类」标记
- And 选中状态清空，列表刷新，批量条消失

**Scenario: 部分 id 已不存在（如技能被外部删除）**
- Given 用户选中 3 个技能，其中 1 个已从磁盘消失
- When 用户点击「应用」
- Then 其余 2 个技能正常更新，界面提示 1 个未找到的技能名
- And 选中状态清空

**Scenario: 全部取消勾选后批量条消失**
- Given 批量操作条可见（已选 N）
- When 用户取消全部复选框
- Then 批量操作条消失（无选中时无入口，天然不可用）

**Scenario: 职能非法（接口侧防护）**
- When 客户端提交非法职能值
- Then 接口返回 400 与错误说明，已有覆盖数据不变

## API Contract

见同目录 [api-contract.ts](../api-contract.ts)。

## 验证方式

- 后端：`node node_modules/vitest/vitest.mjs run`（core + routes 新增用例）
- 前端：`cd web; node node_modules/vitest/vitest.mjs run`（SkillsView 组件用例）
- 手动：浏览器打开技能库，勾选 → 全选 → 批量应用 → 刷新后分类保持
