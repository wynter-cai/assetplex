# Tasks: add-agents-skills-projects

> 对应 proposal: [proposal.md](proposal.md)
> 规则：后端严格 TDD（先红后绿）；每个 Phase 结束跑通测试、typecheck、build。
> 覆盖率门槛：行 80% / 函数 80% / 分支 75%。

---

## Phase 1：智能体只读盘点

### 后端（core，TDD）

- [x] 1.1 在 `src/core/` 新增 `agent-inventory.ts`，定义 `AgentInfo`/`AgentKind`/`AgentTool` 与聚合结果类型
- [x] 1.2 🔴 写 TRAE 内置 persona 解析测试（给 mock 的 manifests/solo.json + builtin 目录）→ 失败
- [x] 1.2 实现 `parseTraePersonas()`：从 manifests + builtin 目录产出 `builtin-persona` 条目 → 🟢
- [x] 1.3 🔴 写用户自建子代理解析测试（Claude agents/*.md frontmatter、Codex TOML 内嵌）→ 失败
- [x] 1.3 实现 `parseCustomAgents()`（复用现有 frontmatter/TOML 解析）→ 🟢
- [x] 1.4 🔴 写 CodeBuddy expert 解析测试（含 sessions 为空对象）→ 失败；实现 `parseCodeBuddyExperts()` → 🟢
- [x] 1.5 🔴 写插件 agent 解析测试；实现 `parsePluginAgents()` → 🟢
- [x] 1.6 🔴 写聚合 `listAgents({tool,kind,search})` 测试：筛选、计数、排序、目录缺失降级；实现 → 🟢
- [x] 1.7 实现 `getAgentRawContent(id)`（读取原始定义；目录型 persona 返回 manifest 摘要），测试覆盖

### 服务端（routes）

- [x] 1.8 新增 `src/server/routes/agents.ts`：`GET /`（参数校验）、`GET /:id`（404 处理）
- [x] 1.9 在 `server/index.ts` 挂载 `/api/agents`；路由层测试（非法 kind 返回 400）

### 前端

- [x] 1.10 `web/src/config/asset-categories.ts` 新增「智能体」类别（code=agent，图标 Bot，order=50），标注 `external: true`（数据不走 /api/assets）
- [x] 1.11 `web/src/types/api.ts` 增加 AgentInfo 等类型；`lib/api.ts` 增加 `listAgents/getAgent`
- [x] 1.12 新增组件 `components/agents/AgentCard.tsx`、`AgentDetail.tsx`（无写操作入口）、筛选与计数条
- [x] 1.13 在 Vault 中识别 agent 类别并渲染智能体视图（只读面板）
- [x] 1.14 前端组件测试（渲染、筛选、只读断言）

### 验收
- [x] 1.15 `npm test`、`npm run typecheck`、`npm run build` 全绿；对照 agents-inventory.spec 全部 Scenario 手动验证

---

## Phase 2：技能分类全貌

### 后端（core，TDD）

- [x] 2.1 新增 `skills-inventory.ts`，定义 `SkillInfo`/`SkillFunction`/`SkillOrigin`
- [x] 2.2 🔴 写跨来源发现测试（用户/builtin/persona/插件/CodeBuddy 市场 mock）；实现 `discoverSkillFiles()` → 🟢
- [x] 2.3 🔴 写职能自动分类测试（pdf→writing、browser→browser、xlsx→data、无匹配→other 等）；实现 `classifyFunction()`（关键词规则表，规则与代码分离）→ 🟢
- [x] 2.4 🔴 写来源判定测试；实现 `classifyOrigin()` → 🟢
- [x] 2.5 🔴 写同名去重 + variants + 来源优先级测试；实现 `dedupeSkills()` → 🟢
- [x] 2.6 🔴 写手动覆盖存取测试；实现 Hub 元数据读写（不触碰 SKILL.md）与 `overrideFunction(id, fn)`，覆盖项在重扫时保持 → 🟢
- [x] 2.7 🔴 写聚合 `listSkills({function,origin,search})` 与两套计数测试；实现 → 🟢
- [x] 2.8 缺失 frontmatter（name/desc 回退）与目录缺失降级测试

### 服务端
- [x] 2.9 新增 `routes/skills.ts`：`GET /`、`PUT /:id/function`（校验 + 404）；`index.ts` 挂载 `/api/skills`

### 前端
- [x] 2.10 重构技能页为分类全貌：维度切换（职能/来源）、分类计数条、分组视图、筛选与搜索
- [x] 2.11 技能卡显示职能、来源、版本、variants 数量；提供「修改职能分类」操作
- [x] 2.12 `api.ts`/types 接入；组件测试（维度切换、去重展示、覆盖操作）

### 验收
- [x] 2.13 全量 test/typecheck/build 全绿；对照 skills-taxonomy.spec 手动验证（重点：覆盖持久化、同名去重）

---

## Phase 3：AI-Coding 项目模块

### 后端（core，TDD）

- [x] 3.1 新增 `projects.ts`，定义 `ProjectInfo`/`ProjectToolMarker`/`ProjectAssetStats`/`ProjectGitInfo`
- [x] 3.2 🔴 写 workspaceStorage 解析测试（mock 多个 workspace.json + mtime，file URI 解码）；实现 `readTraeWorkspaces()` → 🟢
- [x] 3.3 🔴 写 worktrees 历史补充与路径去重测试；实现合并逻辑（无真实路径→exists=false 历史条目）→ 🟢
- [x] 3.4 🔴 写 AI 工具标记识别测试（.trae/.claude/AGENTS.md）；实现 `detectToolMarkers()`（跳过 node_modules）→ 🟢
- [x] 3.5 🔴 写资产统计测试（rules/skills/docs，排除依赖目录）；实现 `collectAssetStats()` → 🟢
- [x] 3.6 🔴 写 git 信息测试（分支/未提交变更/非 git）；实现 `readGitInfo()` → 🟢
- [x] 3.7 🔴 写 `listProjects({existingOnly,search})` 聚合排序测试；实现 → 🟢
- [x] 3.8 实现 `openProject(path,target)`：校验 path 属于已扫描清单；explorer/terminal/ide 三种打开方式；非法/越界拒绝，测试覆盖

### 服务端
- [x] 3.9 新增 `routes/projects.ts`：`GET /`、`POST /:id/open`；`index.ts` 挂载 `/api/projects`

### 前端
- [x] 3.10 Sidebar 在资产库与连接之间新增「项目」顶级项；`App.tsx` 增加 `/projects` 路由
- [x] 3.11 新增 `pages/Projects.tsx` 与 `components/projects/ProjectCard.tsx`：基础信息、工具标记、资产统计、git、三个打开按钮、"仅看存在"开关、搜索
- [x] 3.12 空状态（无 TRAE 记录）处理；`api.ts`/types 接入；组件测试

### 验收
- [x] 3.13 全量 test/typecheck/build 全绿；对照 projects-page.spec 手动验证（重点：安全打开、已删除路径样式）

---

## 全局收尾

- [x] G.1 三个 Phase 完成后执行三 pass 自审（Bugs / Security / Compliance），更新仓库 `REVIEW.md`
- [x] G.2 若分类法（assetplex-asset-taxonomy.md）需同步 agent 前置，做最小文档更新
- [ ] G.3 每个 Phase 独立提交（`feat:` 前缀），不混合功能（待用户确认后执行）

## 风险检查点

- Phase 1 1.6：来源目录缺失降级必须先有测试
- Phase 2 2.6：覆盖持久化不得写入原始 SKILL.md
- Phase 3 3.8：open 接口的路径白名单是安全关键，必须 TDD
