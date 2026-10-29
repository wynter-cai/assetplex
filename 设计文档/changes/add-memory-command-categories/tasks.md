# tasks: add-memory-command-categories

> 执行顺序即编号顺序；后端一律 TDD（先红后绿），前端核心路径补 RTL 用例。
> 每完成一组做一次验证并独立提交，不混 commit（`docs` / 声明源 / 扫描 / 前端分开）。
> 提交前必跑 `node scripts/privacy-check.mjs` 且退出码 0。

## 组 1 · 声明源与契约（后端 core）

- [ ] **T1** `src/core/asset-categories.ts` 新增两条声明：`memory`（记忆，order 55，hubDir `memory`，legacyHubDirs `['preferences']`，syncable true，doctorSupported true）、`command`（命令，order 58，hubDir `commands`，syncable true，doctorSupported true）；`AssetCategoryDescriptor` 增加 `legacyHubDirs?: readonly string[]`；`ASSET_CATEGORY_DECLARED_AT` 更新
  - 验收：单测断言新两条字段齐全、order 升序且裁决准则仍在末位；既有六条的 label/order 未被改动
- [ ] **T2** `src/core/types.ts`：`DiscoveredCategory` 增加 `command`（并确认 `agent` 已在其中）；`DOCTOR_ASSET_KINDS` 增加 `memory`
  - 验收：`tsc --noEmit` 0 错；类型扩展导致的 switch 穷尽性报错逐个补齐（不得用 `any`）
- [ ] **T3** `src/core/assets.ts`：`AssetCategory` 与 `DIR_TO_CATEGORY` / 反向映射增加 `memory`、`command`；列表读取 `memory` 时并入 `preferences/`，条目上标记兼容来源
  - 验收：`GET /api/assets?category=memory` 能同时返回 `memory/` 与 `preferences/` 的文件；`?category=command` 只返回 `commands/`
- [ ] **T4** `src/core/overview.ts`：`FrontendCategory` 与 `CATEGORY_MAP` 增加 `command`；首页快照计数随声明源输出两类
  - 验收：overview 单测断言两类计数出现在快照中，口径仍为 `library`

## 组 2 · 扫描归类纠正（适配器）

- [ ] **T5** `src/core/adapters/claude-code.ts`：发现项 `commands/` 由 `preference` 改为 `command`，`agents/` 由 `preference` 改为 `agent`
  - 验收：新单测（先红）断言发现项 category；收藏落点前缀 `commands/`、`agents/`
- [ ] **T6** `src/core/adapters/trae-cn.ts`：`memory/user_profile.md` 保持 `identity`，`memory/` 其他 `.md` 由 `preference` 改为 `memory`
  - 验收：单测断言三类发现项归类；`session_memory.md` 目标路径 `memory/session_memory.md`
- [ ] **T7** 扫描结果按 `absolutePath` 去重，同一文件不同规则命中时以 T5/T6 规则表为准
  - 验收：构造重复命中夹具，断言发现列表长度不重复，收藏不写两份

## 组 3 · 前端（声明源派生，不改清单文件）

- [ ] **T8** `web/src/config/asset-categories.ts`：仅补 fallback 两条（同字段）+ `CATEGORY_ICONS` 增加 `memory`（Brain）、`command`（Terminal）图标
  - 验收：后端声明源与 fallback 的逐字段比对单测通过（含 `legacyHubDirs`）
- [ ] **T9** `web/src/types/api.ts`：`DiscoveredCategory` 与后端对齐（`agent`/`memory`/`command` 补齐）
  - 验收：`tsc -b` 0 错
- [ ] **T10** `web/src/components/import/FileItem.tsx`：删掉本地 `categoryLabels` 与图标硬编码，改用声明源（`useAssetCategories` 或 `CATEGORY_ICONS` + 接口清单），未知类别回退默认图标
  - 验收：收藏向导中命令/记忆分组显示正确中文名；既有六类显示不变；新增守护用例防止再写死
- [ ] **T11** 「记忆」类别页空态与失败态：空态文案「我的库里还没有记忆」+ 唯一动作「从已安装的工具收藏记忆」；错误态给重试，不显示「共 0 项」
  - 验收：RTL 用例覆盖空态与错误态文案（Scenario 3）
- [ ] **T12** 同步对话框对不支持命令的工具显示「该工具不支持命令」并禁用（复用既有支持矩阵原因文案机制）
  - 验收：用例断言 TRAE 行禁用 + 文案存在（Scenario 6）

## 组 4 · 验收与档案

- [ ] **T13** 全量验证：后端 `npm.cmd test` / `npm.cmd run typecheck` / `npm.cmd run build`；`web` 下 `vitest run` / `tsc -b` / `vite build`
- [ ] **T14** API 回环：造中性示例文件 → `GET /api/assets?category=memory|command` 计数正确 → 同步到 WorkBuddy/Claude Code → 状态转 `synced` → 清理测试数据
- [ ] **T15** 浏览器走查 Scenario 1–9（含 800px 窄屏），截图落系统临时目录（不入库），走查完关闭标签页
- [ ] **T16** 文档同步：`assetplex-asset-taxonomy.md` 第二/第三梯队状态列改为「✅ 已管理」；本文件勾选并填 commit 短哈希
- [ ] **T17** 拍板点复核：A（命令是否进切换包）建议保持不进；B（`preferences/` 迁移）留阶段 2；C（legacy 路由）另立 `retire-legacy-routes`

## 预估与风险

- 预估：后端 1.5 天、前端 1 天、验收 0.5 天（净 3 个工作日/周末段）
- 风险 1：`preferences/` 目录可能已被某个工具软链占用 → 只读并入，绝不迁移（明确写入 D2）
- 风险 2：`AgentEdit`/资产编辑器的新建流程可能硬编码类别 → T12 之前先跑一次 `grep -r "identity.*skill.*rule" web/src` 排查
- 风险 3：医生对 memory 的检查规则缺失 → 复用既有体积/空文检查，不为 memory 新写专用规则
