# tasks: refactor-skill-catalog

> 遵循 AGENTS.md：后端严格 TDD（Red → Green → Refactor），前端核心组件补测试；
> 每个任务独立 commit，格式 `feat|refactor|test: <中文描述>（refactor-skill-catalog T<n>）`。
> 依赖顺序：T1–T4（纯逻辑）→ T5–T7（API）→ T8–T12（诊断流水线）→ T13–T15（分发）→ T16–T17（收口）。
> 全部任务不改扫描来源根、不改五值出处判定、不提供批量修复。

## T0 基线与夹具（0.5 天）

- 跑一遍现状：`npm test`、`npm run typecheck`、`cd web && npx vitest run`，记录基线到本文件末尾「基线」区
- 造中性夹具：`tests/fixtures/skills-catalog/` 下用 `demo-a`、`demo-b` 等示例名（禁止真实技能名/目录名）
- 验收：基线全绿；夹具不含任何本机路径与用户名

## T1 三分组映射与分类依据（纯逻辑，0.5 天）

- 新增 `src/core/skill-catalog.ts`：
  - `toProvenanceGroup(provenance)`：self→self；builtin/plugin→platform；marketplace/github→imported
  - `provenanceBasisOf(origin, source)`：目录优先；vault 且 source 带前缀→metadata；否则 directory
  - `functionBasisOf(functionSource)`：manual/ai/keyword 直映射
  - `classifyOrigin` 无法判定的情况返回 `unknown`（不静默改判 builtin）
- 测试 `tests/unit/core/skill-catalog.test.ts`：五值全覆盖、unknown 场景、依据优先级
- 验收：纯函数无 IO；行/分支覆盖达标

## T2 最近更新字段（0.5 天）

- `src/core/skills-inventory.ts`：主副本 mtime 经注入的 `SkillFs` 读取（复用现有 `dirMtime` 能力，缺失时 null）
- `src/server/lib/skill-api.ts`：`SkillApiInfo` 增 `lastModifiedAt: string | null`
- 测试：mtime 可读 / 不可读 / 目录不存在三种情况；不得用 `Date.now()` 兜底
- 验收：`GET /api/skills` 响应新增字段，旧字段零变化

## T3 目录聚合（纯逻辑，1 天）

- `src/core/skill-catalog.ts` 增 `buildCatalogOverview(input)`：
  - 入参：技能列表（已按筛选过滤）、摘要映射、AI 缓存命中数、筛选条件
  - 出参：契约 `SkillCatalogOverview`（三组 + 九类 + countByProvenanceGroup + recent + diagnosis + aiClassify）
  - 计数口径必须复用 `filterAndCountSkills` 的分面语义，不另写一套
- 测试：三组之和 = 资产总数；unknown 单列；stale 不计入问题数；recent 最多 5 条且排除 null
- 验收：函数 ≤50 行（超出拆子函数）；看板合计与列表 total 有断言

## T4 摘要存储（纯逻辑 + Node 实现，0.5 天）

- 新增 `src/core/skill-diagnosis-summary.ts`：校验（overall 闭集、计数非负整数）、合并、按当前内容哈希判 stale
- 新增 `src/server/lib/node-skill-summary-store.ts`：落 `~/.assetplex/skill-diagnosis-summaries.json`
- 测试：脏数据过滤、部分写入、哈希变化后 stale、清空不影响其他存储
- 验收：存储只读用于展示；不参与诊断结论

## T5 `GET /api/skills/catalog`（1 天）

- `src/server/routes/skills.ts` 增路由：复用现有 query 参数（scope/function/provenance/status/search）
- 条目同时扩展 `lastModifiedAt / provenanceGroup / provenanceUncertain / provenanceBasis / functionBasis / diagnosis`
- 测试 `tests/unit/server/skills-catalog-route.test.ts`：筛选联动、unknown 计数、看板 total 与列表一致、局部失败不 500 整页
- 验收：契约字段齐全；新增字段不含绝对路径（既有 `path` 保持现状）

## T6 `POST /api/skills/diagnose/estimate`（1 天）

- 入参 ids：去重；逐条解析库内与文件可读性；不可诊断进 `unDiagnosable`
- 命中未过期摘要计 `cacheHits`；未配置 AI → `mechanicalOnly=true`、`willCall=0`
- 上限常量集中定义（maxSelection=100 / confirmThreshold=50 / maxCalls=200）
- 测试：混合选择、全部未入库、超限、配置缺失、id 不存在
- 验收：不发起任何模型调用；错误码按契约

## T7 `PUT /api/skills/diagnosis-summary`（0.5 天）

- 服务端按 id 解析路径并计算当前内容哈希，前端不回传哈希；非法项进 `rejected`，不整体失败
- 测试：部分成功、越界路径拒绝、闭集外 overall 拒绝
- 验收：写入后可被 `GET /api/skills/catalog` 读到；内容变化后自动 stale

## T8 看板视图（1.5 天）

- 新增 `web/src/components/skills/SkillCatalogBoard.tsx`：两组分类行、数量、最近更新、问题数分布、展开/收起
- 与列表共用同一筛选状态（`SkillsView` 持有），不另存一份
- 测试 `SkillCatalogBoard.test.tsx`：展开只影响本行、计数渲染、接口失败局部降级
- 验收：键盘可达（行可 Enter/ Space 展开，`aria-expanded`）；默认收起；空组不撑高

## T9 卡片与详情增量（0.5 天）

- `SkillCard`：最多加 1 个「问题数/未体检/已过期」标记，不突破「常驻徽章 ≤2」规范
- `SkillDetail`：显示最近更新、来源与用途的分类依据、摘要时间与「已过期」提示
- 测试：三种摘要态的渲染快照/断言；不影响既有徽章与勾选行为

## T10 选择模型与两个新入口（1 天）

- `SkillsView` 增「本次所选」概念：勾选集、当前分组、当前筛选三者可组合
- `SkillsBatchBar`：新增「诊断选中 N 个」「分发选中 N 个」；未入库项在点击后由预估/影响清单说明
- 分组行：新增「诊断本类」「分发本类」
- 测试：勾选变化清空旧选择、按钮计数正确、未入库时按钮仍可点（由预估解释）
- 验收：不改变现有 AI 分类 / 收藏 / 批量改职能行为

## T11 预估与发起（1.5 天）

- 抽出现有 `BatchCheckup` 的并发池与进度骨架为可复用 hook/组件，供「全部体检」与「子集体检」共用（避免两套并发逻辑）
- 新流程：预估 → 展示 total/cacheHits/willCall/mechanicalOnly/unDiagnosable → 确认（>50 次或超阈值）→ 逐条执行
- 成本未知（接口失败/字段缺失/超硬上限）时按钮禁用并给原因
- 测试：预估失败禁用、机械降级、二次确认、超限提示、只对可诊断项执行
- 验收：任何路径都不会在未预估时调用模型

## T12 结果聚合面板（1.5 天）

- 新增 `web/src/components/skills/SkillDiagnosisResults.tsx`：按技能分组、有风险→需关注→健康→失败排序；技能内按严重度排序
- 行内「去修复」：打开该技能详情并滚动到医生面板；不提供批量修复
- 「重试失败项」只重跑失败 id；完成后回写摘要（T7）并刷新看板
- 结果底部披露 rulesVersion / model / generatedAt / mechanicalOnly
- 测试：排序、失败重试、跳转回调、摘要回写调用次数

## T13 分发预览后端（1.5 天）

- 新增 `src/server/routes/skill-distribution.ts`：`POST /api/skills/distribution/preview`
- 复用 `SwapEngine.preview(tool)` 逐工具取条目，按本次技能主文件过滤；统计 created/overwritten/unchanged/conflicts
- `defaultSelected`：已安装 + 支持 + 该工具已存在本次任一技能；`statusUnknown` 独立标记
- token = 快照（技能 id + 路径 + 各工具预览时间 + 指纹），有效期建议 10 分钟
- 测试：临时 Hub + Fake 适配器；不支持类别、未安装、冲突、技能缺失、未入库
- 验收：预览零写入；`sampleTargets` 只给工具内相对路径

## T14 分发执行后端（1.5 天）

- `POST /api/skills/distribution/execute`：校验 token → 逐工具 `SwapEngine.execute({ onlyHubRelativePaths })`
- 冲突项默认不覆盖；`overwriteConflicts=true` 才写入；逐「技能 × 工具」产出结果
- 单工具失败不中断其他工具；结果附 swapId 供回滚；执行后失效分发索引缓存
- 测试：部分失败、冲突跳过、token 过期 409、重复执行 409、回滚映射正确
- 验收：库内正文零变化（断言文件哈希）；备份由 swap 生成

## T15 分发对话框（1.5 天）

- 新增 `web/src/components/skills/SkillDistributionDialog.tsx`：影响清单表格（工具 × 文件数、冲突、跳过原因、示例目标路径）、目标勾选、冲突覆盖勾选、确认说明
- 结果页：逐条结果、汇总、回滚按钮（逐工具）；回滚调 `POST /api/swap/rollback`
- 测试：默认勾选、无目标禁用、冲突未勾选时提示、结果渲染、回滚调用
- 验收：Esc 关闭、焦点归还；不显示本机绝对路径

## T16 降级与空态全覆盖（1 天）

- 对照 R7.1–R7.6 逐条实现文案与禁用态；看板/预估/预览三处失败互不牵连
- 测试：空库、全环境、无 AI Key、超限、接口失败、工具状态未知
- 验收：每条 Scenario 有对应断言或手工验收记录

## T17 收口（0.5 天）

- `npm test`、`npm run typecheck`、`npm run build`；`cd web && npx vitest run && node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build`
- 手工对照 spec 全部 Scenario 走一遍，把结果记到本文件「验收记录」
- `node scripts/privacy-check.mjs` 退出码 0
- 自查：无 `any`、无 `@ts-ignore`、函数 ≤50 行、文件 ≤300 行
- 验收：Definition of Done 五条全满足后才可提 review

---

## 依赖与风险提示

| 任务 | 依赖 | 风险 |
|------|------|------|
| T3 | T1/T2/T4 | 计数口径漂移；必须复用分面计数 |
| T6 | T4 | 哈希计算成本：只读文件头？否——需全文哈希，按技能数线性，可接受 |
| T11 | T6 | 与「全部体检」共用并发池时别改坏既有行为 |
| T14 | T13 | `onlyHubRelativePaths` 对技能目录单元的命中语义（主文件命中即整目录）需测试锁定 |
| T15 | T13/T14 | 影响清单与执行快照不一致；用 token + 409 兜底 |

## 基线

- 接手基线：后端 1373 passed + 1 skipped；前端 649 passed；双端 tsc 0；双构建成功；隐私终检 0 命中
- T13-T16 完成后（T17 收口实测）：后端 **1380 passed + 1 skipped**；前端 **662 passed**；双端 tsc 0；tsup + vite 构建成功；`privacy-check.mjs` 0 命中（扫 282 个 commit）

## 验收记录

> 证据以自动化用例为主；标注「人工」的条目尚未做浏览器逐条走查。

| Requirement | 结果 | 证据 |
|---|---|---|
| R1 全貌看板（1.1-1.5） | 通过 | `tests/unit/core/skill-catalog.test.ts`、`skills-last-modified.test.ts`、`SkillCatalogBoard.test.tsx` |
| R2 分类维度与依据（2.1-2.5） | 通过 | `skill-catalog.test.ts`（五值覆盖 / unknown / 依据优先级）、`SkillCard`、`SkillDetail` 用例 |
| R3 展开与筛选（3.1-3.4） | 通过 | `SkillCatalogBoard.test.tsx`（展开/收起/`aria-expanded`）、`SkillsViewFilters.test.tsx`（三维叠加、组合空态） |
| R4 单个与子集诊断（4.1-4.6） | 通过 | `skills-batch-diagnosis.test.ts`、`SkillDiagnosisDialog.test.tsx`（预估、机械降级、二次确认、超限） |
| R5 结果聚合（5.1-5.4） | 通过 | `SkillDiagnosisResults.test.tsx`（排序、失败重试、口径披露）、摘要回写用例 |
| R6 批量分发（6.1-6.5） | 通过 | `skill-distribution.test.ts`、`skill-distribution-execute.test.ts`（零写入、冲突跳过、409、回滚映射）、`SkillDistributionDialog.test.tsx` |
| R7 降级与空态（7.1-7.6） | 通过（7.5 组合场景人工待补） | `SkillsDegradation.test.tsx`（7.1-7.4）、看板/预估/预览各自失败用例（7.5）、`SkillDistributionImpactTable` statusUnknown（7.6） |

### 与 tasks.md 的已知偏差

- T13 `overwritten` 预检恒为 0：引擎预览只有 `none/exists/differs` 三态，没有「本工具托管」信号，`differs` 一律计冲突（默认不覆盖），与「冲突默认不覆盖」口径一致
- T15 占位文案实际在 `SkillsView.tsx`（不在 `SkillsBatchBar`），已在原处替换
- R7.4 分发超限在前端以常量 100 拦截（预览接口不返回 limits）

### 提交清单

- T13 `48a8fad`、T14 `05bde1e`、T15 `6797d8a`、T16 `67f05e2`、术语修正 `e9c78af`、文档回写（本 commit）
