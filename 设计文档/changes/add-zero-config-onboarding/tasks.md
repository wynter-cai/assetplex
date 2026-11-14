# tasks.md：add-zero-config-onboarding

> 类型 S（新页面 + CLI 首跑 + 少量接口扩展）。完成一项勾一项，勿批量预勾。
> 原则：改造而非重写。每个任务先确认「复用什么」，再写测试与实现。
> 禁止 `any` / `@ts-ignore`；文件 ≤300 行、函数 ≤50 行。

## 阶段 0：规格（审核门）

- [x] T1 规格评审：proposal + onboarding.spec + api-contract + 本文件通过维护者审核后才动代码
  - 验证：spec 覆盖 8 个必测场景 + 隔离/错误场景；确认「新增端点只有 3 个」

## 阶段 1：core 与接口扩展（先测后写）

- [x] T2 引导状态 `src/core/onboarding-state.ts`
  - 复用：`getHubRoot()`（ASSETPLEX_DIR）
  - 测试 `tests/unit/core/onboarding-state.test.ts`：
    - autoEnter 四组合（无 hub.toml / 资产 0 / 已标记 / 有资产无标记）
    - marker 缺失、坏 JSON、未知 version → 视为未完成且不抛错
    - 写入 completed/skipped + step；写入失败返回 persisted=false
  - 实现：`readOnboardingState`、`writeOnboardingMarker`（临时文件 + rename 原子写）、`resolveAutoEnter`
  - 验证：`node node_modules/vitest/vitest.mjs run tests/unit/core/onboarding-state.test.ts`

- [x] T3 骨架初始化抽取 `src/core/hub-skeleton.ts`
  - 复用：`src/cli/commands/init.ts` 的目录/初始文件常量（迁出共享，init 改为调用）
  - 测试 `tests/unit/core/hub-skeleton.test.ts`：空目录建齐目录 + hub.toml + mcp.sources.json + README；已存在不覆盖；返回 created/skipped；无身份/规则空模板
  - 回归：`assetplex init` 现有测试全绿，行为不变
  - 验证：单测 + `tests/unit/cli` 相关用例

- [x] T4 盘点洞察 `src/core/onboarding-insights.ts` + 扩展 `/api/sync/scan`
  - 复用：`scanAll()` / `ToolInventory` / `DiscoveredItem`（结构不改）
  - 测试 `tests/unit/core/onboarding-insights.test.ts`（注入 readHash）：
    - 跨工具同名 → 重复；哈希不同 → 版本不一致；缺哈希不参与比对但仍计副本
    - 单工具资产 → 覆盖不全（只陈述事实）；0 条目 → 全空
  - 测试 `tests/unit/server/sync-scan-insights.test.ts`：
    - 不传 `insights` → 响应与现在完全一致（回归）
    - `insights=1` → 返回 insights，且与实际 fixture 哈希一致
  - 实现：纯函数 `buildOnboardingInsights(inventories, readHash)`；`/api/sync/scan` 增加可选查询参数
  - 验证：单测 + 路由测试

- [x] T5 分发四分类 `src/core/sync-engine.ts` 增加 `targetExists`
  - 测试 `tests/unit/core/sync-engine.test.ts`（现有文件内补）：
    - 目标不存在 → targetExists=false；存在 → true；skip 项也如实给出
  - 测试 `web/src/lib/onboarding-distribute.test.ts`（纯函数）：
    - skip → unchanged；不存在 → create；存在 → overwrite；distributions=conflict → conflict
  - 实现：plan 生成处补 `targetExists`；前端分类函数 `classifyDistribute(plan, distribution)`
  - 验证：双端单测

- [x] T6 分发备份 `POST /api/sync/run?backup=1`
  - 复用：`backupTarget` / `pruneSwapBackups` / `makeSwapId`（`src/core/swap-fs.ts`）
  - 测试 `tests/unit/server/sync-run-backup.test.ts`：
    - 不传 backup → 行为与现在一致
    - backup=1 → 覆盖项写入前生成 `<Hub>/.backups/onboarding/<id>/files/*` + manifest；保留最近 3 批
    - 无覆盖项 → 不建目录、backupRef=null
    - 备份失败不阻断同步，响应 warnings 可见
  - 验证：路由测试 + 临时目录哈希断言

- [x] T7 引导路由 `src/server/routes/onboarding.ts`
  - 新增仅 3 端点：`GET /state`、`POST /start`、`POST /complete`
  - 测试 `tests/unit/server/onboarding-route.test.ts`（依赖注入 + 临时 Hub）：
    - state 只读（调用前后文件快照一致）；autoEnter 四组合
    - start 幂等；complete 写标记；非法 outcome/step 400；写失败 persisted=false 仍 200
  - 注册到 `src/server/index.ts`
  - 验证：路由测试 + `node node_modules/typescript/bin/tsc -b`

## 阶段 2：CLI 首跑

- [x] T8 `assetplex init --import-existing` 真实实现（`src/cli/commands/init.ts`）
  - 复用：`engine.scanAll()` + `engine.executeImport()`
  - 测试 `tests/unit/cli/init-import-existing.test.ts`：真实计数输出；同名冲突不覆盖；不写 onboarded 标记；无工具时输出空态
  - 验证：单测 + 临时 `ASSETPLEX_DIR` 手动跑一次

- [x] T9 无子命令 `assetplex` 首跑（`src/cli/index.ts`）
  - 复用：`ensureHubSkeleton` + 现有 `uiCommand`
  - 测试 `tests/unit/cli/bare-command.test.ts`：首次→启动向导决策；非首次→显示帮助；决策函数纯逻辑
  - 验证：单测；`npx assetplex --help` 与子命令回归

## 阶段 3：前端（复用为主）

- [x] T10 抽取 Import 共享逻辑（小重构，不改变现有行为）
  - `web/src/pages/Import.tsx` 抽出 `buildImportRequest` → `web/src/lib/import-request.ts`；抽出步骤条 → `web/src/components/common/StepIndicator.tsx`
  - 测试：现有 `Import` 相关测试全绿；新增 `import-request.test.ts` 覆盖冲突策略/二进制透传
  - 验证：前端全量测试（先跑一次基线）

- [x] T11 `AiConfigDialog` 可选预设（向后兼容）
  - 复用：现有组件与 `/api/skills/ai-classify/config`
  - 测试 `AiConfigDialog.test.tsx` 补：传 `presets` 才渲染预设；点击只改地址与模型、不改 Key；不传时与现在一致
  - 验证：组件测试

- [x] T12 向导壳 + s0/s1/s2
  - 新增 `web/src/pages/Onboarding.tsx` + `web/src/components/onboarding/*`
  - 复用：`StepIndicator`、`ProgressBar`、`ToolCard`、`ErrorState`、`Button`/`Card`/`Badge`
  - 数据：`GET /api/onboarding/state`、`GET /api/tools`、`GET /api/sync/scan?insights=1`
  - 组件测试：开场跳过可达资产库；0 资产空态；单工具失败；无重复文案；状态失败重试；深链不劫持
  - 验证：前端测试 + `vite build`

- [x] T13 收纳步骤
  - 复用：`POST /api/sync/execute-import`、`ConfirmGroup`、`ProgressBar`
  - 行为：二进制默认不选；同名未指定策略按现有语义跳过；pending 期间禁用按钮
  - 组件测试：成功展示真实 created/skipped/errors；重复点击只发一次；失败可重试；跳过进入资产库
  - 验证：前端测试

- [x] T14 体检步骤
  - 复用：`getGovernanceHealth`/`getGovernanceIssues`、`HealthIssuesPanel`、`BatchCheckup`、`AiConfigDialog`
  - 行为：静态结果零模型；未配置 Key 时 AI 区只给入口；配置后按类别使用 `BatchCheckup`
  - 组件测试：未配置不发模型请求；预设只填地址/模型；跳过体检进资产库
  - 验证：前端测试

- [x] T15 分发步骤 + 确认弹窗
  - 复用：`getTools`、`getSyncPlan`、`getDistributions`、`TargetToolCard`、`ToolPlanDetail`、`SyncActionBar`、`sync-impact`、`ui/dialog`、备份版 `runSync`
  - 行为：四分类计数 + 文件清单；点击主按钮只开确认弹窗；取消/Esc 不发写请求；确认后 `runSync(tools, false, { backup: true })`
  - 组件测试：未选/无内容禁用；取消零写请求；确认展示结果；冲突文案与备份路径可见
  - 验证：前端测试；配合 T17 哈希验收

- [x] T16 完成页、路由守卫、设置与空态入口
  - `/onboarding` 独立全屏路由（AppLayout 之外）；`/` 守卫读 `autoEnter`
  - 完成页数字来自真实接口；未分发不显示「所有工具已同步」
  - 设置页新增「重新运行首次引导」；资产库空态补同一入口
  - 组件测试：autoEnter 重定向/不重定向；完成/跳过均 complete 并跳资产库；complete 失败提示但不阻断；空态入口可见
  - 验证：前端测试 + 隔离目录手工走查

## 阶段 4：验收与收尾

- [x] T17 隔离环境端到端验收（不碰真实 home）
  - 脚本临时放工作区外，跑完删除
  - 隔离：子进程设 `ASSETPLEX_DIR=<temp>/hub` 与 `USERPROFILE=<temp>/home`（Windows `homedir()` 读 USERPROFILE；Claude 另有 `CLAUDE_CONFIG_DIR`）
  - 注意：适配器工具目录是硬编码 `~` 路径，不能靠 `hub.toml.configDir` 重定向
  - 造 2–3 个工具 fixture，断言：
    - AC1 空目录 `/` 进向导（state.autoEnter + 前端守卫）
    - AC2 盘点数量 = fixture 实际文件数
    - AC3 点击到首个真实数字 ≤ 60 秒
    - AC4 全部跳过路径（开场/结果/收纳/体检/分发）可达资产库
    - AC5 预览与取消后目标目录文件哈希零变化
  - 验证：脚本全 PASS，输出断言清单

- [x] T18 全量验证与文档回写
  - 后端 `node node_modules/vitest/vitest.mjs run`；前端 `cd web` 后 `node node_modules/vitest/vitest.mjs run`
  - 双端 `node node_modules/typescript/bin/tsc -b`
  - `node node_modules/tsup/dist/cli-default.js`；`cd web` 后 `node node_modules/vite/bin/vite.js build`
  - `node scripts/privacy-check.mjs` 退出码 0
  - 回写 HANDOFF 第 5 节 + backlog P0-2；本 tasks 勾选
  - 不推送、不 amend、不 reset
  - 验证：命令输出贴入验收记录

---

## 验收记录（T17–T18，2026-11-14）

隔离环境：子进程设 `ASSETPLEX_DIR=<temp>/hub`、`USERPROFILE`/`HOME`/`CLAUDE_CONFIG_DIR=<temp>/home`；fixture 全部为中性示例名；脚本与临时目录跑完即删。

| 项 | 结果 |
|---|---|
| AC1 空目录进向导 | PASS（autoEnter=true / initialized=false / assetCount=0） |
| AC2 盘点数真实 | PASS（scan 11 = fixture 11；duplicateGroups=3、versionMismatch=2） |
| AC3 ≤60 秒 | PASS（start→scan 143 ms） |
| 收藏 | PASS（提交 11 → created 6 / skipped 5 / errors 0，资产库 total 6） |
| AC5 预览取消零改动 | PASS（仅调 plan，工具目录文件哈希零变化） |
| 备份 | PASS（`.backups/onboarding/<批次>/manifest.json` 存在，无警告） |
| AC4 跳过路径 | PASS（welcome/scan/result/collect/doctor/distribute 六步均 200 + persisted=true，随后 onboarded=true / autoEnter=false） |

全量验证（T18）：后端 102 文件 / 1129 项（1128 passed + 1 skipped）；前端 63 文件 / 471 项全绿；双端 tsc 0；tsup + vite 构建成功；`node scripts/privacy-check.mjs` 退出码 0。

## 验收标准自证映射

| AC | 场景 | 自证方式 |
|---|---|---|
| 1 | 空 `ASSETPLEX_DIR` 首页进向导 | T7 state.autoEnter + T16 守卫测试 + T17 |
| 2 | 盘点数量与真实文件一致 | T4 单测 fixture + T17 |
| 3 | 60 秒内看到清单 | T17 记录 scan 接口耗时与首屏时间 |
| 4 | 每条跳过路径可达资产库 | T12-T16 组件测试 + T17 |
| 5 | 取消后目标目录零改动 | T6 备份只读测试 + T15 无写请求测试 + T17 哈希 |
| 6 | 双端 tsc/build/测试全绿 | T18 |
| 7 | 隐私终检 0 命中 | T18 |

## 提交计划（一个任务一个 commit，中文描述）

1. `feat: 引导状态与首次判定（add-zero-config-onboarding T2）`
2. `refactor: 抽取 Hub 骨架初始化供 init 与向导共用（add-zero-config-onboarding T3）`
3. `feat: 扫描响应增加重复与版本不一致洞察（add-zero-config-onboarding T4）`
4. `feat: 同步计划暴露目标存在性与分发四分类（add-zero-config-onboarding T5）`
5. `feat: 同步执行支持覆盖前备份（add-zero-config-onboarding T6）`
6. `feat: 引导状态路由与完成标记（add-zero-config-onboarding T7）`
7. `feat: init 支持盘点式导入（add-zero-config-onboarding T8）`
8. `feat: 无子命令首跑进入向导（add-zero-config-onboarding T9）`
9. `refactor: 抽取导入请求构建与步骤条（add-zero-config-onboarding T10）`
10. `feat: AI 配置弹窗支持可选预设（add-zero-config-onboarding T11）`
11. `feat: 首次使用向导盘点与结果页（add-zero-config-onboarding T12）`
12. `feat: 首次使用向导收纳与体检（add-zero-config-onboarding T13-T14）`
13. `feat: 首次使用向导分发确认与备份（add-zero-config-onboarding T15）`
14. `feat: 完成页与首跑路由守卫（add-zero-config-onboarding T16）`
15. `docs: 首跑向导验收记录与交接更新（add-zero-config-onboarding T17-T18）`

## 已知取舍

- 盘点复用单次 `scanAll()`，不做逐工具流式返回；盘点页先展示工具检测列表，扫描返回后填充真实数量，不伪造动画。
- 收纳复用单次 `execute-import`，不做逐工具进度；pending 态 + 真实结果计数。
- 分发「冲突」只能识别分发索引已判定 conflict 的覆盖项；首次接管旧文件一律记覆盖，不猜「手改」。
- 备份保留最近 3 个 onboarding 批次，不新增回滚 UI。
- AI 诊断复用 `BatchCheckup`，按类别发起；不新增批量后端接口。

## 回滚

- 代码：新增文件 + `init.ts`/`cli/index.ts`/`sync.ts`/`sync-engine.ts`/`types.ts`/`App.tsx`/`Import.tsx`/`AiConfigDialog.tsx`/`Settings.tsx`/空态组件的小改，按 commit 逐条 revert。
- 数据：删除 `onboarding.json` 即恢复「未完成」；分发备份在 `<Hub>/.backups/onboarding/`，手工复制可还原；收纳不做删除。
