# Change: add-skill-agent-write-management

> Change ID: `add-skill-agent-write-management`
> 类型: S 级（智能体/技能纳入保险箱写管理）
> 状态: 待审核
> 日期: 2026-10-06
> 作者: 用户拍板（2026-10-06 双方向之一）

## 背景与问题（Problem）

上一变更（add-agents-skills-projects）落地后，智能体与技能已可**只读盘点**。但两者仍是"别人目录里的镜像"：

1. **技能/智能体没有保险箱主本**。身份、规则、MCP 已是"Hub 存储 → 分发到各工具"的模式（可新建/编辑/分发），而技能与智能体只能看各工具目录里已有的东西——用户没法在 AssetPlex 里沉淀自己的技能/智能体资产。
2. **详情面板明示"只读盘点，暂不支持编辑或分发"**，与项目定位（保险箱+分发中心）不符。
3. **分发管道其实已存在**：`trae-cn` 适配器已映射 `hub/skills/` → `~/.trae-cn/skills`（symlink），`claude-code` 适配器已映射 `hub/agents/` → `~/.claude/agents`（symlink）。缺的只是 Hub 侧的写入口与盘点纳入。

## 预期结果（Proposed outcome）

1. 用户可在资产库**新建/编辑/删除**自己的技能（存为 `hub/skills/<name>/SKILL.md`，与 Agent Skills 标准结构一致）。
2. 用户可在资产库**新建/编辑/删除**自己的智能体（存为 `hub/agents/<name>.md`，Claude Code 子代理格式）。
3. 保险箱技能/智能体**立即出现在技能/智能体盘点中**（来源标记「保险箱」），与各工具副本同名时按既有规则合并。
4. 详情面板提供**分发**入口，复用既有同步引擎把 Hub 资产推到已启用工具。

## 范围（Scope）

### 做什么

**A. Hub 写管理（后端）**
- 技能 CRUD：新建（生成 SKILL.md frontmatter）、编辑（整文件保存）、删除（删整个技能目录）
- 智能体 CRUD：新建（生成 `<name>.md` frontmatter）、编辑、删除
- 名称校验：非法字符（`/ \ : * ? " < > |`、`..`、空名）拒绝；重名（大小写不敏感）拒绝
- 删除路径安全：仅允许删 Hub 内 `skills/<name>/`、`agents/<name>.md`，防路径穿越

**B. 盘点纳入（后端 core）**
- 技能盘点新增来源 `vault`（保险箱），扫描 `hub/skills/`；与既有同名技能合并（已符号链接时同一目录不重复计数）
- 智能体盘点新增工具 `hub`（保险箱），扫描 `hub/agents/*.md`（kind=custom-subagent、userCreated=true）；与 `~/.claude/agents` 同名合并
- 保险箱技能/智能体同样支持手动职能分类（复用 override 机制）

**C. 写管理 UI（前端）**
- SkillsView / AgentsView 工具栏增加「新建」；新建用表单（名称/描述/正文）
- 详情面板增加「编辑」（textarea，整文件保存）、「删除」（确认对话框，警示会影响已分发工具）、「同步分发」（触发既有 POST /api/sync/run，显示各工具结果）

### 不做什么（Non-Goals）

- ❌ 不做工具目录到 Hub 的反向纳管（把已有工具技能"收编"进 Hub）——已有导入向导覆盖，且涉及改名/冲突策略，另立变更
- ❌ 不编辑 TRAE 内置 persona、插件智能体、CodeBuddy Expert（非用户资产，只读不变）
- ❌ 不做重命名/移动（MVP 删除重建即可）
- ❌ 不做 Codex config.toml 内嵌 agents 的写回（TOML 结构特殊，风险大）
- ❌ 不做分发状态可视化（哪台工具已装哪个技能）——Phase 2 再说
- ❌ 不新增框架/依赖（后端继续 Hono，前端继续既有栈）

## 受影响系统

- 后端：`src/core/hub-files.ts`（目录删除）、`src/core/skills-inventory.ts`（origin=vault）、`src/core/agent-inventory.ts`（tool=hub）、`src/server/routes/skills.ts`、`src/server/routes/agents.ts`
- 前端：`web/src/components/skills/SkillsView.tsx`、`web/src/components/agents/AgentsView.tsx`、`web/src/lib/api.ts`、`web/src/types/api.ts`、`web/src/config/asset-categories.ts`
- 数据：写 `~/.assetplex/skills/`、`~/.assetplex/agents/`；分发复用既有 sync，不改适配器

## 约束（Constraints）

- 遵循单向依赖：写逻辑放 core/（纯函数 + 注入 fs），路由只做参数校验与挂接
- 禁止 `any` / `@ts-ignore`；公共函数显式返回类型
- 后端覆盖率门槛：行 80% / 函数 80% / 分支 75%
- TDD：先写失败测试再实现
- 中文名/ID 规则沿用 `\p{L}\p{N}` 经验（避免纯中文名生成空 ID）

## 风险（Risks）

| 风险 | 影响 | 缓解 |
|------|------|------|
| 删除的是工具目录 symlink 的真身 | 删 Hub 技能 = 各工具同时消失 | 删除必须二次确认，文案明示"将从 Hub 及所有已分发工具删除" |
| `skills/<name>/SKILL.md` 目录结构与 assets API 的 `skills/<name>.md` 平铺文件并存 | 两套技能文件格式混淆 | 写管理只走目录结构；assets API 的 skill 类别后续废弃或迁移，不在本变更范围 |
| 盘点重复计数（hub 与工具目录互为 symlink） | 同一技能显示两条 | 同名去重已有机制；补充 scenario 验证 symlink 场景合并为一条 |
| 名称含 Windows 非法字符 / 保留名 | 创建目录失败 | 前后端双重校验，非法字符明确报错 |

## 实施阶段

- **Phase 1**：Hub 写管理 core + API（技能/智能体 CRUD，TDD）
- **Phase 2**：盘点纳入（origin=vault / tool=hub，TDD）
- **Phase 3**：前端写管理 UI（新建/编辑/删除/分发，组件测试）
- **Phase 4**：构建验证 + 浏览器实测 + 独立提交

## 关联文档

- [资产分类法](../../assetplex-asset-taxonomy.md) — skill/agent 均为第一、二梯队资产，本变更补齐"保险箱"能力
- [上一变更](../add-agents-skills-projects/proposal.md) — 只读盘点的基础设施
