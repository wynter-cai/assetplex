# Proposal: add-project-skills-discovery

> 级别：M | 日期：2026-10-06 | 状态：待审核

## Goal

TRAE 技能有两个作用域：全局技能（`~/.trae-cn/skills`）与**项目级技能**（`<工作区>\.trae\skills\<name>\SKILL.md`）。当前盘点只扫全局位置，用户在各 TRAE 项目里自建的技能全部漏扫（实测 3 个项目共 67 个，`personal=0`）。

本变更：
1. 盘点覆盖项目级技能，新增来源类别「项目技能」（origin=`project`），展示所属项目；
2. 自动发现 TRAE 打开过的工作区（读 TRAE 自身的 `storage.json`），同时支持手动补充工作区根目录；
3. 项目技能复用现有沉淀工作流进入保险箱（沉淀是复制，源文件不动），符合「开源开箱即用、智能默认」原则。

## Scope

**做**：
1. core 新增纯逻辑工作区发现模块：解析 TRAE `storage.json`（backupWorkspaces / windowsState / profileAssociations 三个区段）、手动根展开（根本身或其一级子目录）、合并去重/禁用/数量上限
2. 技能盘点新增 project 来源：扫描 `<workspace>/.trae/skills`，SkillInfo 增加所属项目信息；来源优先级 vault > personal > project > plugin > marketplace > builtin
3. server 新增工作区配置（`~/.assetplex/workspaces.json`）与 `GET/PUT /api/workspaces`，技能盘点接入解析后的工作区列表
4. 前端来源体系增加「项目技能」（筛选/计数/徽章），卡片与详情显示所属项目；设置页管理工作区（自动发现开关、手动根、禁用单项）
5. 项目技能的沉淀行为以场景锁定（现有沉淀逻辑按非 vault 通用复制，预期零改动通过）

**不做**：
- 项目技能的写管理（在 AssetPlex 里新建/编辑/删除项目目录内技能）——项目内技能只做只读盘点 + 沉淀
- TRAE SOLO CN / 其他 IDE 的工作区发现（解析器留纯函数扩展点，本轮只接 Trae CN 的 storage.json）
- 项目级 rules / agents / mcp 等其他资产盘点（本变更只解决技能）
- 文件监听实时刷新（沿用现有盘点时机，重开页面/重新扫描即可见）

## Risks

- **同名翻转**：项目技能与市场技能同名时（如社区改编版），按新优先级主条目从 marketplace 翻成 project，市场计数下降、项目计数上升——这是正确语义（本地改编版才是用户实际资产），spec 用场景锁定
- **TRAE storage.json 格式随版本变化**：解析为 best-effort，文件缺失/损坏/区段为空时静默返回空列表并在 API `errors` 中提示，手动根始终可用兜底
- **工作区路径不可访问**（已删除/网络盘/权限）：跳过该项，不影响其余盘点
- **扫描面扩大**：仅扫固定结构 `<workspace>/.trae/skills/<name>/SKILL.md`，工作区数量设上限（默认 100，超出截断并在响应中标记 truncated），不做任意深度递归
- 零数据上传：工作区路径与技能内容仅在本机读写，不经过任何远端（与现有架构一致）
