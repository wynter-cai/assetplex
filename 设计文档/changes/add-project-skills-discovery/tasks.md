# Tasks: add-project-skills-discovery

> **状态（2026-11-11 复核）：T1-T4、T6-T8 已随后续变更落地，补齐勾选；T5（沉淀回归锁定）与 T9（真实 storage 回环 + 浏览器实测）未验证，保持未勾。**
> 复核证据：`src/core/workspaces.ts`、`src/server/lib/node-workspaces.ts`、`src/server/routes/workspaces.ts`、
> `skills-inventory.ts` 的 `project` 来源与 `workspaceDirs` 扫描、`WorkspaceSettingsCard.tsx`、
> `web/src/types/api.ts` 的 `workspaceName/workspacePath`，以及 `tests/unit/core/workspaces.test.ts`、
> `tests/unit/server/node-workspaces.test.ts`、`tests/unit/server/workspaces-routes.test.ts`、`SkillsView.test.tsx` 的项目技能用例。
> 出处徽章文案已被 `refactor-skill-origin-taxonomy` 统一为「自建 · 工作区名」，非本变更原设计的「项目 · 工作区名」。


> 依赖顺序排列；每个任务独立提交。测试命令：根目录 `node node_modules/vitest/vitest.mjs run`，前端 `cd web` 后同命令。
> 约束：TDD（RED→GREEN→REFACTOR）、禁止 any、文件 ≤300 行 / 函数 ≤50 行、core 不依赖 server。

## Phase 1: 后端 core（TDD）

### T1: 工作区发现纯逻辑 ⭐ 基础先行
- [x] 新建 `src/core/workspaces.ts`：
  - `parseTraeStorageJson(content: string): string[]`：从 `backupWorkspaces.folders[].folderUri`、`windowsState.lastActiveWindow.folder`、`windowsState.openedWindows[].folder`、`profileAssociations.workspaces` 的键提取 `file:///` URI；解码 `%3A` 盘符与 `%XX`（中文/空格），输出绝对路径
  - `resolveWorkspaceDirs(input)`：入参 `{ manualRoots: string[]; autoPaths: string[]; disabled: string[]; fs: Pick<SkillFs,'listDir'|'realpath?'>; maxWorkspaces }`；逻辑：规范化（realpath 归一、去尾分隔符、小写盘符）→ 过滤 disabled → 手动根展开（根本身含 `.trae/skills` 或其一级子目录含）→ 合并去重（manual 优先标记）→ 不可访问路径跳过 → 超上限截断（手动优先，其余路径排序）→ 返回 `{ dirs: Array<{path,source}>; truncated; skipped: string[] }`
  - 常量 `MAX_WORKSPACES = 100`
- [x] 测试 `tests/unit/core/workspaces.test.ts`：三段解析+去重、中文/空格解码、非法 JSON/缺区段/空文件返回 `[]`、非 file URI 与相对路径忽略、手动根本身是工作区、父目录一级展开、自动手动合并且 manual 标记、disabled 排除、不存在路径跳过、超上限截断 manual 优先、结果稳定排序
- 验证方式：RED→GREEN，全量测试通过

### T2: 盘点接入 project 来源 ⭐ 核心
- [x] `skills-inventory.ts`：
  - `SkillOrigin` 加 `'project'`；`SKILL_ORIGINS` 加项；`SkillSources` 加 `workspaceDirs: string[]`
  - `RawSkill`/`SkillInfo` 加 `workspaceName?`/`workspacePath?`
  - `scanSkillDir` 支持工作区上下文参数；`discoverSkillFiles` 对每个 workspace 扫 `<dir>/.trae/skills`（origin='project'、tool='trae'、workspace 信息透传）
  - `ORIGIN_PRIORITY`：vault 0 / personal 1 / project 2 / plugin 3 / marketplace 4 / builtin 5
  - `classifyOrigin` 按 workspaceDirs 前缀（最长匹配）判 project；dedupeSkills 主条目透传 workspace 字段，同 project 多副本 variants 收齐
- [x] 现有测试 fixture 同步（workspaceDirs: [] 时行为与现状完全一致，回归零变化）
- [x] 新增测试 `tests/unit/core/skills-inventory.test.ts`：项目技能被扫出且字段完整、无 .trae/skills 零贡献、跨项目同名合并 variants 稳定、与 marketplace 同名 project 胜出计数翻转、realpath 链接去重归 vault、countByOrigin/筛选含 project、manual/ai 分类对 project 生效
- 验证方式：RED→GREEN，全量测试通过

## Phase 2: 后端 Node 实现与路由（TDD）

### T3: Node 工作区存储 + storage.json 读取
- [x] `src/server/lib/node-workspaces.ts`：
  - `~/.assetplex/workspaces.json` 的 JSON store（默认 `{ autoDiscover: true, roots: [], disabledWorkspaces: [] }`，损坏文件回默认并告警，风格对齐 node-ai-classify-store.ts）
  - 读取 TRAE storage.json：按平台候选路径（Win `%APPDATA%/Trae CN/User/globalStorage/storage.json`，macOS `~/Library/Application Support/Trae CN/...`，Linux `~/.config/Trae CN/...`）；不存在/读失败返回 `{ paths: [], error }`
  - 组装 `WorkspaceInfo[]`（name=basename、skillsDirExists、skillCount、source、disabled）+ 供盘点用的 `workspaceDirs`
- [x] 测试 `tests/unit/server/node-workspaces.test.ts`（内存 fs / 注入路径：默认配置、损坏回默认、storage.json 缺失 error 提示、技能数统计、禁用标记、manual 合并）
- 验证方式：RED→GREEN，全量测试通过

### T4: GET/PUT /api/workspaces + 盘点接线
- [x] 新路由 `src/server/routes/workspaces.ts`：
  - `GET /api/workspaces` → WorkspacesResponse（config/workspaces/truncated/maxWorkspaces/errors）
  - `PUT /api/workspaces`：合并语义（字段可选）；校验 autoDiscover 布尔、roots/disabledWorkspaces 为绝对路径字符串数组、数量 ≤ 上限；非法 → 400 `{ error }` 原配置不变；成功持久化并返回全貌
  - 注册到 server（路由顺序无 `/：id` 冲突风险）
- [x] `skills.ts`：`defaultSkillSources()` 的 `workspaceDirs` 由工作区服务现场解析（autoDiscover 关闭则只用手动根）；路由工厂保持可注入（测试注入内存实现）
- [x] 测试 `tests/unit/server/workspaces-routes.test.ts`：GET 全貌、PUT 合法/非法 400、保存后盘点立即使用新根、关闭自动发现后 auto 项消失、disabled 生效；以及 project 技能经真实路由出现在 GET /api/skills?origin=project
- 验证方式：RED→GREEN，全量测试通过

### T5: 沉淀 project 技能回归锁定
- [ ] 补测试（skill-curation 既有测试文件内追加）：project 技能单条沉淀成功、frontmatter `source: project:<绝对路径>`、再沉淀 400、批量部分失败语义；确认 curation 代码零改动通过（若需改动仅限必要最小行并说明）
- 验证方式：全量测试通过

## Phase 3: 前端（组件测试先行）

### T6: 类型/客户端与来源体系
- [x] `web/src/types/api.ts`：SkillOrigin 加 `'project'`；SkillInfo 加 `workspaceName?`/`workspacePath?`；新增 WorkspacesConfig/WorkspaceInfo/WorkspacesResponse/UpdateWorkspacesInput
- [x] `web/src/lib/api.ts`：`getWorkspaces()` / `updateWorkspaces(input)`
- [x] `skill-labels.ts`：`project: '项目技能'`；`ORIGIN_ORDER` 在 personal 后插入 project；现有测试 fixture 的 countByOrigin 补 project 键
- 验证方式：`tsc -b` 0 错，现有组件测试全绿（先改 fixture 让其回归）

### T7: 技能列表/详情展示
- [x] 卡片：project 技能显示「项目 · {workspaceName}」徽章；详情：工作区路径 + 项目名；沉淀按钮对 project 可见（沿用现有非 vault 条件）
- [x] 测试：SkillsView.test.tsx（筛选区出现项目技能与计数、project 卡片徽章）、SkillDetail.test.tsx（项目信息与沉淀入口）
- 验证方式：组件测试全绿、tsc 0 错

### T8: 设置页工作区管理
- [x] `Settings.tsx` 新增「工作区」卡片：自动发现开关；工作区列表（名称/路径/来源/技能数/禁用状态）；手动根添加（绝对路径校验提示）与移除；自动项禁用/启用；保存后 invalidate workspaces 与 skills 查询
- [x] 测试：加载渲染、开关切换、添加/移除根、禁用切换、非法路径提示、保存成功/失败提示
- 验证方式：组件测试全绿、tsc 0 错、vite build 过

## Phase 4: 收尾

### T9: 全量验证与真实回环
- [ ] 后端全量测试 + `tsc -b` + tsup build
- [ ] 前端测试 + `tsc -b` + vite build，重启 http://127.0.0.1:17521
- [ ] API 回环（对照 spec 场景，用真实 storage.json）：
  - GET /api/workspaces 自动发现出本机 14 个工作区（含中文路径），errors 为空
  - GET /api/skills?origin=project 非空；总数 = Zhihu 4 + Demo App 1 + Super Powers 62 经同名翻转/跨项目去重后的实际值（以 API 实测记录，不预设 67）
  - 验证 marketplace 计数较基线 293 的下降 = 被 project 赢走的同名数；total 与各 origin 计数守恒
  - PUT 手动根 `d:\demo` 与禁用某工作区的行为可逆验证，测后还原（workspaces.json 删除回默认）
  - 选一个 project 技能（建议 douyin-knowledge-extraction）curate → 校验 vault 文件 source 行 → DELETE 清理
- [ ] 浏览器实测：技能页「项目技能」筛选与计数、卡片项目徽章、详情路径与沉淀按钮、设置页工作区列表；完成后关闭标签页
- [ ] 实测记录写入本文件；数据清理回基线（vault 31、总量恢复、workspaces.json 还原）

## 优先级说明

- T1→T2 串行（盘点消费工作区解析）；T3 依赖 T1；T4 依赖 T2/T3；T5 可与 T3/T4 并行
- T6→T7→T8 串行；T9 必须在 vite build + 重启服务后
- 每任务一个 commit；全部完成前不合并交付
