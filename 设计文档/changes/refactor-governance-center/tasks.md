# tasks: refactor-governance-center（质量中心）

> 变更：S 级；每个任务可独立提交、独立回滚。
> 提交格式：`<type>: <中文描述>（refactor-governance-center T<n>）`
> 通用 DoD：`node node_modules/vitest/vitest.mjs run` 全绿 + 双端 `tsc -b` 0 错 + `tsup` / `vite build` 成功 + `node scripts/privacy-check.mjs` 退出码 0。
> 提交前逐文件 `git diff` 复核，不用 `git add -A`。

## 依赖前置

| 前置 | 影响任务 | 未就绪时的处理 |
|---|---|---|
| `add-diagnosis-rules` T4（LLM 增量 / 忽略清单） | T4、T7 | 忽略接口按「未就绪」降级展示，不伪造空白清单 |
| `add-diagnosis-rules` T5（规则列表接口） | T2、T7 | 聚类退化为按标题聚合并在界面标注；规则页只读版本文案 |
| `refactor-asset-pipeline`（深链 `?asset=`） | T3、T9 | 深链先指向类别页并提示「资产详情地址即将支持」；对方落地后改为直达 |
| B18 裁决准则迁移拍板 | T8 | 若拍板维持 `/vault/criteria`，T8 取消，仅保留组内「裁决准则」入口 |

---

## 验收状态（2026-11-18 收口）

**结论**：T1-T11 全部完成，质量中心从 `/governance` 迁移到 `/quality` 并落地全局体检报告、跨类别批量诊断/修复、规则与忽略管理、裁决准则迁入；B18 同步满足。

**提交清单**：T1 `91c26ec`、T2 `6570353`、T3 `2adcb7b`、T9 文档回写 `f51bc5a`、T0 规则化语义链路 `ff7e3fe`、T4 `f56272c`、T5 `61e9361`、T6 `fcffc42`、T7 `634625c`、T8-T10 `8ff3ccb`、T11 `f32a220`。

**真实数据验收（2026-11-18，本机 Hub 只读）**
- 三处同源：首页 `issues.total=17` = 质量中心 `pendingTotal=17` = 侧栏徽标来源同一快照。
- 聚类：12 条，首条「frontmatter 缺失必填字段：name」，影响 6 个资产 / 命中 6 次 / 高 6，聚合依据 `title`，影响面 18。
- 批量预估：`willCall=48`、`cacheHits=0`、`semanticSkipped=0`、按类别规则覆盖度 22/16/15，超限与二次确认口径由组件测试覆盖。
- 规则页：版本 1.0.0、71 条（静态 45 / AI 26）、跨资产通用 8 条单列、用户 0 条。
- 旧地址：`/governance` 浏览器访问替换式落到 `/quality`；`/vault/criteria` 由路由测试覆盖。
- 页面边界：真实页面无「应用修复」「重新诊断」；聚类展开后的「在资产库中打开」深链由 `QualityCenter.test.tsx` 断言。
- 视口：1440×900 / 800×900 两档 PASS（`.trae/schedule/reports/2026-11-18-白班-C4.md`）。

**未在真实库执行（避免写真实资产）**：手工清单第 5 条「批量修复 + 整批撤销」需隔离 Hub；第 7 条「无 AI Key」由 `governance-batch-estimate` / `QualityBatch.test` 覆盖。

**收口基线**：后端 **1382 passed + 1 skipped**、前端 **663 passed**、双端 `tsc -b` 0、tsup + vite 构建成功、`privacy-check.mjs` 0 命中。

## T1 [P0] 命名与路由迁移（纯前端）

- 新增 `/quality`、`/quality/batch`、`/quality/rules`、`/quality/criteria` 路由；`/governance*` → `/quality*`、`/vault/criteria` → `/quality/criteria` 全部替换式重定向。
- 侧栏组名改「质量中心」，子项改为：体检报告、跨类别批量、规则与忽略、重复项、裁决准则；窄屏摘要与页面标题同步。
- 旧 `pages/Governance.tsx` 内容移入 `pages/QualityCenter.tsx` 骨架（本任务先保留原只读内容，避免空页）。

**验证**：`App.routes.test.tsx` 补重定向用例（`/governance`→`/quality`、`/vault/criteria`→`/quality/criteria`，含按返回不被弹回）；`Sidebar.test.tsx` 改组名与子项断言；手工访问这两个旧地址。

## T2 [P0] 概览聚合接口（聚类 + 排序 + 覆盖度，只读）

- `src/core/quality-overview.ts`：按 ruleId（缺失时按归一化标题）聚类、影响面分、稳定排序、覆盖度汇总的纯函数。
- `GET /api/governance/overview`；`GET /api/governance/issues` 逐项补 `ruleId` / `confidence` / `source` / `evidence` / `ignored` / `deepLink`。
- 与 `/api/home/dashboard` 的待处理数共用同一快照装配，禁止二次计算。

**验证**：`tests/unit/core/quality-overview.test.ts`（同规则多资产合并、跨类别通用规则只计一次、同分按成本升序、ruleId 缺失退化）；`tests/server/governance-overview.test.ts`（分页、数据缺失、零资产）；断言 `pendingTotal` 与 dashboard 同值。

## T3 [P0] 前端体检报告页

- 四维分数区（复用既有健康卡构成与不适用口径）+ 聚类列表 + 展开样例 + 排序依据说明 + 空态（零资产 / 全部健康 / 忽略披露 / 语义未评估 / 数据缺失）。
- 删除质量中心内的 `DiagnosisPanel` 内嵌，问题行改深链（与 T9 共用一次组件改造，可先落深链、T9 再做文案与回改）。

**验证**：组件测试覆盖 Scenario 2.1–2.6；断言页面中不存在「应用修复」「重新诊断」按钮；手动确认展开聚类不产生网络诊断请求。

## T4 [P1] 跨类别批量诊断预估接口

- `POST /api/governance/diagnose/estimate`：按 kinds / clusterKeys / ruleIds 圈选，返回总数、缓存命中、需调用、语义跳过、不可诊断明细、按类别规则覆盖度、上限。
- 复用 `computeDoctorCacheKey` 与既有 estimate 口径；不新增执行接口（执行复用 `POST /api/doctor/diagnose`）。

**验证**：`tests/server/governance-batch-estimate.test.ts`（AI 未配置 → willCall=0、环境条目进 unDiagnosable、规则过滤后 count 正确、规则集致命错误 → 422/503 按契约）。

## T5 [P1] 前端跨类别批量诊断

- 选择器（类别多选 + 问题类型多选 + 交集计数）、预估条（缓存命中 / 需调用拆分，缺字段禁用发起）、>50 次二次确认、100/200 上限提示。
- 执行编排：并发 4 逐资产调用诊断，结果按「问题类型 → 资产」聚合，失败项单独重试。

**验证**：组件测试覆盖 Scenario 3.1–3.6（含「预估失败按钮禁用」「超限不静默截断」）；沙箱内用 Fake LLM 跑一次 3 资产批量的成功 + 失败混合路径。

## T6 [P1] 跨类别批量修复

- 扩展 `governance-remediation.ts`：`ruleIds` 过滤、计划项输出 `ruleIds`、类别分布、`nonBatchableCount`。
- 前端：影响清单 → 二次确认 → 复用 `apply` → 汇总 → 整批 `undo`；执行中禁用重复发起。
- 页面任何问题行仍不出现「应用修复」。

**验证**：`tests/server/remediation-rule-filter.test.ts`（过滤只影响可修复项、20 上限不因过滤放大、未命中规则不出现在计划）；前端组件测试覆盖 Scenario 4.1–4.6；隔离 Hub 跑一次 2 资产批量修复 + 撤销，校验备份恢复。

## T7 [P1] 规则与忽略管理页

- 规则列表（编号 / 类别 / 严重度 / 模式 / 来源 / 覆盖标记）、按类别筛选与编号搜索、按需加载覆盖度披露、规则集版本。
- 用户规则：复用 `/api/files` 写入 + 新增 `POST /api/diagnosis/rules/validate`；保存前校验、坏规则告警条。
- 忽略清单与恢复（沿用 `/api/diagnosis/ignore*`），失效条目标注。

**验证**：`tests/server/rules-validate.test.ts`（缺字段 / 非法编号 / 覆盖内置 / 多规则文件混入坏条）；前端组件测试覆盖 Scenario 5.1–5.7；断言规则页无自动诊断请求。

## T8 [P2] 裁决准则迁入

- `/quality/criteria` 承载现有 `CriteriaView`；资产库类别子项移除 `criteria`；`/vault/criteria` 替换式重定向。
- 页面补「准则为偏好层、不新增规则编号、不计入健康分」说明；后端 criteria API 与数据目录零改动。

**验证**：`App.routes.test.tsx` 补重定向用例；`CriteriaView.test.tsx` 保持通过（仅改宿主与文案）；手工验证准则包导入不受影响。

## T9 [P2] 与单资产详情的边界收口

- 质量中心全量移除内嵌体检面板与任何写操作入口；统一深链 `deepLink`。
- 详情「查看全局治理」文案改「查看质量中心」；返回保留状态。
- 同步回改 `refactor-asset-pipeline/specs/asset-pipeline.spec.md` Scenario 3.2（「在治理页展开报告」→「从质量中心点条目直达详情」），并跑该变更既有前端用例确认无回归。

**验证**：质量中心组件测试断言不存在修复/诊断按钮；深链往返测试（质量中心 → 详情 → 返回）保留筛选与展开状态。

## T10 [P2] 降级与空态专项 + 收尾

- 规则集致命错误、预估失败、部分失败、数据缺失、规则接口未就绪、批次执行中重复提交，逐项对齐 Scenario 8.1–8.6 文案与按钮状态。
- 文档收尾：更新 `导航子项` 相关既有 spec 引用；跑隐私终检与全量回归。

**验证**：按 Scenario 8 手工走查（断网 / 删规则文件 / 塞坏 YAML / 超限圈选四种故障注入）；`privacy-check.mjs` 0 命中；后端 + 前端全量测试与双端构建。

---

## T11 [C] 缺陷修复：概览误报「AI 未配置」

> 2026-11-18 真实数据验收时发现：AI 端点已配置（`/api/skills/ai-classify/config` 返回 `hasApiKey:true`），
> 但 `/api/governance/overview` 的 coverage 仍报「跳过 18 条 · 原因 no-ai-config」，与
> `/api/governance/diagnose/estimate`（`willCall=48`、`semanticSkipped=0`）自相矛盾，违反 spec 2.5「语义未评估如实披露」。

**根因**：`routes/governance.ts` 的 overview 用 `health.qualityMode === 'mechanical+ai'` 推断 AI 是否配置；
而 `qualityMode` 还要求「已有资产做过语义评估」（`governance-health.ts` 的 `usesAi`），
用户配好 Key 但还没跑过语义体检时恒为 `mechanical-only`，于是被误判成「未配置」。

**行为（Given-When-Then）**
- Given AI 端点已配置但尚无资产完成语义评估
- When 打开质量中心概览
- Then 不出现「原因 no-ai-config」；`skippedRules=0`、`skippedReasons=[]`，仍显示「语义未评估」徽标
- And 覆盖度说明改为「语义规则尚未评估…在资产详情运行一次体检可补充语义检查」，不再让用户去重复配置 AI
- Given AI 端点确实未配置
- When 打开概览
- Then 跳过原因仍为 `no-ai-config`，说明文案仍指向配置入口（现有行为不回退）

**改动文件**
- `src/server/routes/governance.ts`：新增 `aiConfiguredNow()`（`deps.aiConfigured` 优先，缺省读 `aiConfigStore` + `isAiConfigComplete`）；`/overview` 与 `/suggestions` 改用它
- `src/core/quality-overview.ts`：`QualityCoverage` 增 `aiConfigured: boolean`
- `web/src/types/api.ts`：同步增字段；`web/src/components/quality/ClusterList.tsx` 按 `coverage.aiConfigured` 分支文案
- 测试：`tests/unit/server/governance-overview.test.ts` 补「AI 已配置但未评估」用例（harness 增 `evaluated` 开关）；`web/src/pages/QualityCenter.test.tsx` 补对应文案断言并更新既有 fixture

**验证**：定向用例绿 → 双端 `tsc -b` 0 → 后端 tsup / 前端 vite build 成功 → `privacy-check.mjs` 0 命中。

## 手工回归清单（验收时逐条勾）

1. 旧 `/governance`、`/vault/criteria` 两个地址可达且不被返回弹回。
2. 首页「待治理」= 侧栏徽标 = 质量中心待处理数。
3. 聚类能读出「9/18 是技能缺 description」这类句子，排序依据可点开。
4. 批量诊断预估同时显示缓存命中与需调用；删掉预估接口响应字段后发起按钮禁用。
5. 批量修复影响清单含库内路径与预计调用；执行后可整批撤销。
6. 质量中心任意位置都找不到「应用修复」。
7. 无 AI Key 时静态结果完整、语义标未评估。
8. 规则页能看见内置条数、用户规则覆盖标记与坏规则告警。
