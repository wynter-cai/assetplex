# Tasks: add-skill-agent-write-management

> 每个任务独立提交；后端严格 Red→Green→Refactor。

## Phase 1: Hub 写管理 core（TDD）

### T1.1 hub-files 目录删除能力
- `src/core/hub-files.ts` 新增 `deleteHubDirectory(relativePath)`：仅允许删除 `skills/<name>/` 一层技能目录（递归删除），路径越界/根目录/含子路径穿越一律抛错
- 测试：`tests/unit/core/hub-files.test.ts`（正常删除 / 越界拒绝 / 不存在幂等 / 拒绝删非技能目录）
- 验证：`node node_modules/vitest/vitest.mjs run tests/unit/core/hub-files`

### T1.2 技能写服务 core
- 新增 `src/core/skill-write.ts`（纯逻辑，注入 SkillFs）：`createVaultSkill` / `updateVaultSkill` / `deleteVaultSkill`
- 规则：名称校验（空、`..`、非法字符 `/ \ : * ? " < > |` 拒绝；中文用 `\p{L}\p{N}` 保留）；同名（小写比较，跨全部来源）拒绝；创建时生成 frontmatter（name/description）；目录 `skills/<name>/SKILL.md`
- 测试：`tests/unit/core/skill-write.test.ts`（正常创建/重名/非法名/更新/更新404/删除/删除404/frontmatter 内容正确）
- 验证：同命令跑该测试文件

### T1.3 智能体写服务 core
- 新增 `src/core/agent-write.ts`：`createVaultAgent` / `updateVaultAgent` / `deleteVaultAgent`，写 `agents/<name>.md`（frontmatter name/description + 正文）
- 测试：`tests/unit/core/agent-write.test.ts`
- 验证：跑该测试文件

## Phase 2: API 路由与盘点纳入（TDD）

### T2.1 技能路由扩展
- `src/server/routes/skills.ts` 增加 POST `/`、PUT `/:id`、DELETE `/:id`（400/404/201 语义按 api-contract）
- 测试：`tests/unit/server/skills-routes.test.ts` 扩展
- 验证：跑 `tests/unit/server`

### T2.2 智能体路由扩展
- `src/server/routes/agents.ts` 增加 POST `/`、PUT `/:id`、DELETE `/:id`
- 测试：`tests/unit/server/agents-routes.test.ts` 扩展

### T2.3 盘点纳入保险箱
- `skills-inventory.ts`：SkillOrigin 增加 `'vault'`，扫描 `hub/skills/`（新增 source），并入 ORIGIN_PRIORITY（vault 优先级最高——保险箱为主本）；同步场景下同名合并不重复计数
- `agent-inventory.ts`：AgentTool 增加 `'hub'`，扫描 `hub/agents/*.md`（kind=custom-subagent、userCreated=true）；`~/.claude/agents` 为符号链接时同名合并
- 既有类型/计数/前端标签联动：`web/src/types/api.ts`、`SkillsView`/`AgentsView` 的 ORIGIN/TOOL 标签补「保险箱」
- 测试：两个 inventory 测试文件补 vault/hub 场景 + symlink 去重场景
- 验证：跑全部后端测试

## Phase 3: 前端写管理 UI（组件测试）

### T3.1 api 客户端方法
- `web/src/lib/api.ts` 增加 createSkill/updateSkill/deleteSkill/createAgent/updateAgent/deleteAgent
- 验证：`web` 下 `node node_modules/vitest/vitest.mjs run`

### T3.2 SkillsView 写管理
- 工具栏「新建技能」表单（名称/描述/正文）；详情面板对 origin=vault 提供「编辑/删除/同步分发」，其他来源提供「同步分发」；删除确认文案按 spec
- 测试：`SkillsView.test.tsx` 补新建/编辑/删除交互用例

### T3.3 AgentsView 写管理
- 同 T3.2 对 AgentsView；内置/插件/Expert 保持只读
- 测试：`AgentsView.test.tsx` 补用例

### T3.4 分发入口
- 「同步分发」调用既有 `POST /api/sync/run`（支持选目标工具），完成后 toast 展示各工具成功/失败
- 验证：组件测试 + 手动验证

## Phase 4: 收尾

### T4.1 全量验证
- 后端 `node node_modules/vitest/vitest.mjs run` + `node node_modules/typescript/bin/tsc -b` + `node node_modules/tsup/dist/cli-default.js`
- 前端 tsc + vite build
### T4.2 浏览器实测
- 服务 `node dist/index.js ui` → 新建技能/智能体 → 盘点可见 → 编辑 → 分发 → 删除，逐条对照 spec Scenario
### T4.3 独立提交
- Phase 1+2 一个 commit（后端写管理）、Phase 3 一个 commit（前端写管理），沿用 `git -c user.name="Wynter-Cai" -c user.email="299045391+wynter-cai@users.noreply.github.com"`
