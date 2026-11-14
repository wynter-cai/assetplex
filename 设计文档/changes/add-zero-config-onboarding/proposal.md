# proposal：add-zero-config-onboarding（首次使用向导）

> 类型 S（新页面 + CLI 首跑路径 + 少量接口扩展）。本文件先于代码，审核通过后才进入 TDD。
> 视觉与交互真相源：`设计文档/prototypes/onboarding-prototype.html` 的 s0–s6（s7–s10 不在本次范围）。
> 原则：**改造而非重写**。现有扫描、导入、体检、分发、AI 配置链路能复用的一律复用，只补缺口。

## Goal

新用户从「装完工具、资产散落各处」到「看见自己的真实资产并收进一个库」，全程零手写 Markdown、零配置、≤ 60 秒（不含人工阅读时间）。

现状证据（backlog P0-2）：
- `src/cli/commands/init.ts` 的 `importExisting` 只有声明，函数体从未使用。
- `npx assetplex` 后只得到空模板，用户被要求自己填人设。
- 扫描、导入、静态体检、分发能力都已存在，只是没接进首跑链路。

## 现有能力复用清单（本变更的事实基础）

| 环节 | 复用对象 | 位置 | 复用方式 |
|---|---|---|---|
| 工具检测 | `adapter.detect()` | `src/core/adapters/base.ts` | 直接调用 |
| 盘点 | `scanAll()` / `GET /api/sync/scan` | `src/core/scanner.ts`、`src/server/routes/sync.ts` | 扩展响应增加 `insights`，不新建扫描接口 |
| 收纳 | `executeImport()` / `POST /api/sync/execute-import` | `src/core/sync-engine.ts`、`src/server/routes/sync.ts` | 直接复用；冲突策略、二进制字节写入现成 |
| 导入 UI | `Import.tsx` + `ToolCard`/`FileItem`/`ConflictDialog`/`ConfirmGroup`/`ProgressBar` | `web/src/pages/Import.tsx`、`web/src/components/import/*` | 抽取共享构建函数，组件直接复用 |
| 静态体检 | `GET /api/governance/health`、`GET /api/governance/issues` | `src/server/routes/governance.ts` | 直接复用，零模型 |
| AI 诊断 | `BatchCheckup`（预算护栏/并发/进度）、`DiagnosisPanel` | `web/src/components/doctor/*` | 直接复用 |
| AI 配置 | `AiConfigDialog` + `/api/skills/ai-classify/config` | `web/src/components/skills/AiConfigDialog.tsx`、`src/server/routes/skills.ts` | 复用组件，补一个可选预设入参 |
| 分发预览 | `GET /api/sync/plan`、`GET /api/distributions`、`sync-impact.ts`、`TargetToolCard`/`ToolPlanDetail`/`SyncActionBar` | `web/src/pages/Sync.tsx`、`web/src/components/sync/*` | 直接复用，仅补 `targetExists` 字段做四分类 |
| 分发执行 | `POST /api/sync/run` | `src/server/routes/sync.ts` | 扩展 `backup=1`，其余语义不变 |
| 备份 | `backupTarget` / `pruneSwapBackups` / `makeSwapId` | `src/core/swap-fs.ts` | 直接复用，备份根改为 `<Hub>/.backups/onboarding` |
| 空态/对话框/提示 | `AssetListPanel` 空态、`ui/dialog`、`toast-store`、`ErrorState` | `web/src/components/**` | 直接复用 |
| 初始化 | `init.ts` 的目录/模板常量 | `src/cli/commands/init.ts` | 抽出 `ensureHubSkeleton`，init 与向导共用 |

## Scope（做）

1. **首次进入判定**：未完成过引导，且（`hub.toml` 不存在或资产库为 0）时自动进入；完成或跳过后写本机标记，永不再自动弹出。
2. **CLI 首跑**：无子命令 `npx assetplex` 在首次环境创建骨架并拉起 Web 向导；`assetplex init --import-existing` 真正执行盘点导入。
3. **盘点**：复用 `/api/sync/scan`，展示真实工具与条目；扩展返回重复/版本不一致洞察。
4. **结果洞察**：同一资产多工具各存一份、内容不一致、只在部分工具存在；全部来自真实扫描，不写死、不编造时间成本。
5. **收纳**：复用 `/api/sync/execute-import`；同名冲突默认跳过并如实报告，不静默覆盖。
6. **静态体检**：复用治理健康分/问题清单；AI 深度诊断复用 `BatchCheckup` + `AiConfigDialog`，不配置也能完成。
7. **分发**：复用 `/api/sync/plan` 与 `/api/sync/run`；预览新增/覆盖/冲突/无变化与文件清单，二次确认；取消零写入；确认后先备份。
8. **跳过与完成**：每一步都能跳过；跳过与完成都写标记，失败不阻断跳转。

## 非目标（本次不做）

- 老用户日常首页重设计（原型 s10 已被否掉）、治理中心 s8、市场 s9。
- Cursor / Windsurf 适配器、资产包、Hub 版本化。
- 新建 inventory / collect / distribute-preview / distribute-run 等重复端点。
- 新建批量 AI 诊断后端接口（`BatchCheckup` 已在前端编排现有单资产接口）。
- 上传数据、埋点、遥测；改动已初始化用户的既有资产。

## 关键决策（审核重点）

| # | 决策 | 理由 |
|---|---|---|
| D1 | `npx assetplex` 无子命令仅在首次环境启动向导；非首次仍显示帮助 | 不破坏脚本化与老用户习惯 |
| D2 | 首次环境 = 未标记 onboarded 且（无 hub.toml 或资产数为 0） | 老用户永不自动弹 |
| D3 | 标记存 `<Hub>/onboarding.json`，不进 `hub.toml` | 应用状态与资产配置分离 |
| D4 | 向导初始化只建骨架，不写身份/规则空模板；`assetplex init` 原行为不变 | 空模板会与真实资产冲突，也误导用户 |
| D5 | 收纳直接复用 `execute-import`，未指定策略的同名文件按现有语义跳过 | 不新增策略分支，行为与导入向导一致 |
| D6 | 分发四分类：新增=目标不存在；覆盖=目标存在且计划有覆盖预警；冲突=覆盖中分发索引判定为 conflict；无变化=计划 skip | 只用现有 plan/distributions 事实，不猜「被手改」 |
| D7 | `POST /api/sync/run?backup=1` 执行前备份到 `<Hub>/.backups/onboarding/<批次>`，保留最近 3 批 | 复用 `swap-fs`，取消路径不建目录 |
| D8 | AI 诊断复用 `BatchCheckup`，只在 `AiConfigDialog` 加可选预设；不新增模型调用路径 | YAGNI，且预算护栏现成 |
| D9 | 扫到 0 个资产时展示空态与下一步建议，不假装成功 | 诚实优先 |
| D10 | 前端不伪造进度：盘点为不确定态直到真实返回；收纳用请求 pending 态，完成后展示真实计数 | 与现有 Import 页行为一致 |
| D11 | 首次自动判定只在 `/` 执行，深链不劫持 | 尊重用户明确目标 |
| D12 | 静态体检只读治理接口与既有机械检查；AI 可选 | 不把首跑变成必须联网 |

## 屏幕与原型映射

s0 开场 → s1 盘点 → s2 结果 → s3 收纳 → s4 体检 → s5 分发 → s6 完成 → 资产库。文案与信息层级以原型为准，但原型里写死的「51 个资产」「6 小时」「覆盖 8 个」只作视觉占位，不得进入实现。

**复用与效果的关系（维护者 2026-11-14 拍板）**：复用现有组件是为了省时间提效率，不是目的。视觉与交互效果以原型为准——现有组件能用且不影响效果就用；与原型效果冲突时舍弃复用、按原型实现。兼顾效果与效率。

## Risks

1. **改变 `npx assetplex` 无参行为**：仅首次环境生效；`--help` 与子命令不变。
2. **扫描耗时**：复用单次 `scanAll()`，大目录可能慢。缓解：盘点页先展示工具检测列表，超时显示仍在读取；不造逐工具假进度。
3. **分发覆盖工具侧真实配置**：工具级勾选、文件清单可见、二次确认、覆盖前备份；未勾选工具零写入。
4. **首次判定误伤老用户**：`autoEnter` 必须同时满足资产为 0 或 hub.toml 不存在。
5. **与 P0-1 导航重构冲突**：只新增独立全屏路由 `/onboarding` 与设置页入口，不动 `nav-items.ts`。
6. **标记写入失败**：提示「本次未记录完成状态」，仍进资产库；不回滚已完成的收纳/分发。
7. **慢网重复点击/刷新**：收纳按钮 pending 期间禁用；同名跳过幂等；分发永远二次确认。
8. **服务不可达**：状态读取失败显示错误与重试，不白屏、不写标记。

## 验收口径

1. `ASSETPLEX_DIR` 指向空临时目录启动服务，`/` 自动进入向导。
2. 隔离环境造 2–3 个工具 fixture，盘点数字与实际文件数一致。
3. 从点击「开始盘点」到看见清单 ≤ 60 秒（不计人工阅读）。
4. 每条跳过路径都能到资产库且无报错。
5. 分发确认弹窗点「取消」后目标目录零改动（哈希自证）。
6. 双端 `tsc` 0 错、`tsup` + `vite build` 成功、全量测试通过。
7. `node scripts/privacy-check.mjs` 退出码 0。
