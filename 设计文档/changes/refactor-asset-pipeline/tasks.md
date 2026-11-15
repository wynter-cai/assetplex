# tasks: refactor-asset-pipeline（单资产流水线）

> 前置：本 tasks 与 proposal / spec / api-contract 需维护者审核通过后才允许动代码（SDD 铁律）。
> 范围严格限定「资产详情工作台 + 一个只读摘要接口」：不改诊断引擎、规则集、缓存 key 算法、批量能力与分发通道。
> 后端严格 TDD（先红后绿）；前端核心组件同步补测试。每个任务独立可提交。
> 命令在 PowerShell 5.1 下用 node 直调；提交前跑 `node scripts/privacy-check.mjs`（退出码 0 才可提交）。

## 前置说明（必读）

1. **唯一新增接口**：`GET /api/doctor/summary`（零模型）。不要顺手扩展 `/api/doctor/estimate`，也不要新增 `/api/remediations`。
2. **唯一新增本地文件**：`~/.assetplex/doctor-last.json`（摘要 + 三要素指纹，无正文）。若维护者否决（proposal 开放问题 2），T1/T2 退化为会话内记忆，其余任务不受影响。
3. **不改**：`src/core/doctor.ts` 的 prompt / 解析 / 缓存 key；`doctor-fix.ts`、`doctor-apply.ts`、`doctor-backup.ts`；同步引擎与适配器。
4. **不写假数据**：摘要缺失一律「尚未诊断 / 暂不可用」，禁止用 0 条问题冒充健康。

---

## Phase 0 — 摘要数据面（后端）

## T1【P0】上次运行记录（core 纯逻辑 + 诊断写入点）

- [ ] `src/core/doctor-cache.ts`：新增 `DoctorLastRunRecord` / `DoctorLastRunSummary` 类型、按 `kind + hubRelativePath` 的读写与 `sanitizeDoctorLastRuns`（闭集校验、脏条目丢弃不抛错）
- [ ] 新增纯函数 `diffLastRunInputs(stored, current): Array<'content'|'criteria'|'model'>`，与缓存 key 同源（同一套内容哈希、准则集哈希、模型名）
- [ ] `src/core/doctor.ts`：`diagnoseAsset` 成功返回前写入记录（**唯一写入点**；mechanicalOnly 也写，标记 `mechanicalOnly=true`）
- [ ] 端口注入：core 不直接读写文件，通过 `lastRunStore` 依赖传入（缺省不写，保持既有测试零改动）
- **测试**：`tests/unit/core/doctor-last.test.ts`
  - 首次诊断写入 / 同内容再诊断覆盖时间戳 / 正文变 / 准则变 / 模型变 四种 `staleReasons`
  - 脏 JSON（缺字段、overall 非法、路径空）被丢弃且不影响其他条目
  - 记录不包含正文（断言序列化后无正文片段）
- **验证**：`npx vitest run tests/unit/core/doctor-last.test.ts` 全绿；`npm run typecheck` 0 错

## T2【P0】`GET /api/doctor/summary` 路由 + Node 存储

- [ ] `src/server/lib/node-ai-classify-store.ts`：`createNodeDoctorLastRunStore()` → `~/.assetplex/doctor-last.json`（与 reports / drafts 分文件）
- [ ] `src/server/routes/doctor.ts`：新增 `GET /summary`
  - 参数校验复用 `parseEstimateCategory` 风格的闭集校验 + `isHubInternalPath` 守卫（非库内 403）
  - 读取正文与当前准则集/模型，计算当前缓存键；命中则 `state='valid'` 且 `willCallModel=false`
  - 有记录但三要素有变 → `state='stale'` + `staleReasons`
  - 无记录 / 读不到正文 / 记录损坏 → `available=false` + `state='never'`（不返回 500）
  - **断言：任何分支都不创建 LlmClient、不调用 `llm.chat`**
- **测试**：`tests/server/doctor-summary.test.ts`（never / valid / stale×3 / 未配置 AI 时 willCallModel 恒 false / 403 越界 / 文件不存在 / 记录损坏降级 / 零调用断言）
- **验证**：`npx vitest run tests/server/doctor-summary.test.ts` 全绿；`npm run build` 成功；既有 `tests/server/doctor*.test.ts` 不回归

## T3【P0】前端类型与请求方法

- [ ] `web/src/types/api.ts`：`DoctorSummaryResponse`、`DoctorLastRunSummary`；`DiagnosisReport` 补 `findings` / `coverage` / `rulesVersion` / `rejected` / `aiEvaluated`（与 api-contract 逐字段一致）
- [ ] `web/src/lib/api.ts`：`getDoctorSummary({ kind, hubRelativePath })`
- **验证**：`node node_modules/typescript/bin/tsc -b`（在 `web/` 下）0 错

---

## Phase 1 — 版面与深链（纯前端）

## T4【P0】资产库三套布局

- [ ] `web/src/pages/Vault.tsx`：按 `assets.length` 分支
  - 0：居中空态 + 单一主操作（复用现有空态文案与出口），不渲染筛选 / 分页 / 详情栏
  - 1：自动展开该资产详情（仅一次，`useRef` 防重复；用户关闭后本次停留不再重开）；列表保留单卡选中态，不拉伸整行
  - ≥2：维持自适应网格 + 详情栏
- [ ] `web/src/components/vault/AssetListPanel.tsx`：单资产时隐藏分页；保留「共 N 项」计数
- [ ] 类别切换时重置详情、搜索、筛选与滚动位置
- **测试**：`web/src/pages/Vault.test.tsx` 增补（空态无网格 / 单资产自动展开且只一次 / 关闭后出现「展开详情」且不再自动开 / 多资产网格 / 切换类别清理）
- **验证**：`npx vitest run src/pages/Vault.test.tsx` 全绿

## T5【P0】单资产深链与来源回退

- [ ] `web/src/pages/Vault.tsx`：以 `?asset=<库内相对路径>` 为详情打开的唯一真源
  - 直接打开：按路径在已取回列表中定位；未命中时等列表落地后再判定
  - 关闭详情：`setSearchParams` 移除参数并使用 `replace`（不新增历史记录）
  - 路径不存在：落类别列表 + 提示「资产不存在或已被移动」，且**不发起诊断**
- [ ] 返回来源：优先浏览器后退语义；不为来源页硬编码跳转
- [ ] 深链命中后自动展开的详情不重复触发诊断（只读摘要）
- **测试**：`Vault.test.tsx` 增补（打开 / 关闭改地址且不新增历史 / 不存在提示且无诊断请求 / 与单资产自动展开互不重复）
- **验证**：`npx vitest run src/pages/Vault.test.tsx` 全绿

## T6【P1】其它入口改为深链

- [ ] `web/src/lib/use-home-dashboard.ts`：`homeFixTargetPath` 返回 `/vault/<kind>?asset=<encodeURIComponent(hubPath)>`（保持纯函数可测；未知类别回退 `/vault`）
- [ ] 首页待办 / 治理页问题行：新增「在资产库中打开」深链（治理页就地展开行为不变）
- **测试**：`web/src/components/home/TodayQueue.test.tsx`、`web/src/pages/Governance.test.tsx` 增补 href 断言；`use-home-dashboard` 单测覆盖编码
- **验证**：`npx vitest run src/components/home src/pages/Governance.test.tsx` 全绿

---

## Phase 2 — 详情工作台（诊断 → 治理 → 分发）

## T7【P0】诊断摘要栏

- [ ] 新增 `web/src/components/doctor/DiagnosisSummaryBar.tsx`（≤200 行，纯展示）
  - 四态：`never` / `valid` / `stale` / `available=false`
  - 文案：结论徽标、问题数（含高严重度）、可修复数、上次时间、「结果有效（不会调用模型）」/「上次结果，已过期（正文已变更 / 准则集已更新 / 模型已更换）」
  - `willCallModel=true` 时旁注「本次将调用 1 次模型」；`aiConfigured=false` 时旁注「语义未评估」+ 配置入口
  - 主按钮文案随状态变化（开始诊断 / 重新诊断 / 运行检查）
- [ ] `web/src/components/vault/AssetEditor.tsx`：只读视图顶部挂摘要栏（替换「正文上方只有一个按钮」的现状）
- **测试**：`DiagnosisSummaryBar.test.tsx`（四态文案 / 成本提示 / 未配置 AI / 可访问名称）；`AssetEditor` 用例补「打开即有摘要，不点按钮」
- **验证**：`npx vitest run src/components/doctor src/components/vault` 全绿

## T8【P0】问题行：证据、依据、置信度

- [ ] 拆出 `web/src/components/doctor/IssueList.tsx`（单条问题可展开；`DiagnosisPanel` 保留编排，守住 300 行）
  - 展示：规则编号 + 名称、严重度、置信度、来源（机械 / 静态 / AI）、证据（库内相对路径 + 行号 + 片段）、建议
  - 证据不足：固定文案「证据不足，无法确定」，不可修复、不进入可修复计数
  - 忽略项：显示「已忽略 N 条」与恢复入口（若无恢复接口则只披露条数，不提供假按钮）
  - `findings` 缺失时回退旧 `issues` 字段（兼容，不空屏）
- **测试**：`IssueList.test.tsx`（展开证据 / 证据不足 / 来源徽标 / findings 缺失回退 / 忽略披露）
- **验证**：`npx vitest run src/components/doctor` 全绿

## T9【P0】就地修复 + 自动复检 + 撤销

- [ ] `FixFlow` 接入详情：确认屏增加「保存后将自动复检（将调用 1 次模型）」固定说明
- [ ] apply 成功后自动触发一次复检（显式 loading；结果就地替换摘要与问题列表；给出「已修复 X 项，剩余 Y 项」）
- [ ] 复检失败：保留写库成功事实 +「复检失败：<原因>」+「重试复检」
- [ ] `undo` 成功后：摘要置为 `stale`（原因「已撤销」）且**不自动复检、不调用模型**；结果区给「已撤销」与逐工具回滚入口
- [ ] 写库失败：保留草案与勾选，可返回确认屏重试
- **测试**：`FixFlow.test.tsx` / `DiagnosisPanel.test.tsx` 增补（复检触发一次 / 复检失败保留写库事实 / 撤销不触发诊断 / 写库失败可重试）
- **验证**：`npx vitest run src/components/doctor` 全绿；确认无新增模型调用路径的隐式触发

## T10【P0】分发衔接

- [ ] 复检通过（无 high/medium，或只剩 low/建议项）→ 详情内出现主按钮「分发到工具」；未通过则为主入口隐藏 + 次要「仍要分发」+ 风险说明
- [ ] 复用同步管理对话框：工具清单、安装状态、类别支持原因、当前同步状态、默认勾选规则
- [ ] 执行走 `runSync(targets, false, { backup: true })`；结果就地展示（写入 / 跳过 / 失败 + 原因）
- [ ] 「重试失败项」只重发失败工具；成功后 `invalidateQueries(['distributions'])` 刷新列表徽标
- [ ] 确认屏已勾选分发时直接展示结果，不再二次询问
- [ ] 无可用目标：按钮禁用 + 具体原因 +「去连接工具」
- **测试**：分发区块组件测试（入口出现条件 / 不支持说明 / 就地结果 / 失败重试只含失败工具 / 状态失效刷新 / 无目标禁用）
- **验证**：`npx vitest run src/components/vault src/components/doctor` 全绿

---

## Phase 3 — 降级与可达性

## T11【P1】降级与空态全覆盖

- [ ] 逐条对齐 spec Requirement 6：无 Key / 从未诊断 / 诊断失败（保留上次结果）/ 分发不可用 / 非库内条目 / 文件已消失 / 摘要读取失败
- [ ] 旧文案修正：降级配置入口不得再指向技能页；指纹/摘要读取失败不影响正文
- **测试**：`DiagnosisPanel` / `AssetEditor` / `Observation` 相关用例逐条覆盖；断言"未配置 AI 时不出现调用次数"与"摘要失败不空屏"
- **验证**：`npx vitest run src/components/doctor src/components/vault` 全绿

## T12【P1】宽窄屏与键盘

- [ ] `Vault` 详情容器：≥1280 双栏固定宽度区间；1024–1279 证据与结果默认折叠；<1024 全屏覆盖 + 返回
- [ ] 键盘：卡片 Enter/Space 打开；详情内 Tab 顺序合理；Esc 关闭并归还焦点；确认类操作可键盘触发
- [ ] 结果区 `role="status"` + `aria-live="polite"` 播报「诊断完成：N 个问题」「已修复 X 项」「分发完成：M 个工具」
- [ ] 区域可读名称：体检报告 / 修复流 / 分发结果
- **测试**：键盘与 aria 断言用例（焦点归还 / 播报文案 / region 名称）
- **验证**：`npx vitest run src/pages/Vault.test.tsx src/components/doctor` 全绿

---

## Phase 4 — 验收与收尾

## T13【P0】全量回归与手工走查

- [ ] 后端：`npm test`、`npm run typecheck`、`npm run build` 全绿
- [ ] 前端（`web/`）：`npx vitest run`、`node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build` 全绿
- [ ] 手工走查三档视口（1440 / 1180 / 800）与全键盘：
  1. 单资产类别进入即见正文；关闭后不重开
  2. 摘要四态（从未 / 有效 / 过期 / 不可用）文案正确，成本提示与文字一致
  3. 诊断 → 展开证据 → 草案 → 应用 → 自动复检 → 分发 → 失败重试 → 撤销
  4. 从治理页 / 首页待办直达详情并返回
  5. 无 Key / 分发不可用 / 文件被删三种降级
- [ ] 走查记录写入本目录 `ACCEPTANCE.md`（中性示例名，无真实资产名与绝对路径）
- **验证**：命令退出码 0；对照 spec 全部 Scenario 勾选

## T14【P1】文档回写与提交

- [ ] 若本变更定稿：在 `设计文档/changes/add-asset-governance/proposal.md` 与 `add-asset-doctor/proposal.md` 各加一行「单资产入口已由 refactor-asset-pipeline 收敛到资产详情」，不改其规格正文
- [ ] `HANDOFF.md` 进度表补一行（本机私有，不入库）
- [ ] 每个任务单独提交，提交信息格式：`<type>: <中文描述>（refactor-asset-pipeline T<n>）`
- [ ] 提交前 `node scripts/privacy-check.mjs` 退出码 0
- **验证**：`git log --oneline -5` + `git status` 自证；隐私终检 0 命中

---

## 依赖与顺序

```
T1 ┐
   ├→ T2 → T3 →（T7 ∥ T8）→ T9 → T10 ┐
T4 ┤                                  ├→ T13 → T14
T5 ┤→ T6                              │
   └→ T11 ∥ T12 ─────────────────────┘
```

- T1/T2 必须先于 T7：摘要栏没有数据面就只能显示假状态。
- T4/T5 是纯前端，可与 T1–T3 并行；但 T5 的"深链打开后只读摘要"依赖 T3 的请求方法。
- T9 必须先于 T10：分发入口的出现条件来自复检结果。
- T11/T12 放最后统一收口，避免逐任务改样式后组合回归失败。

## 明确不做（防止范围蔓延）

- 不改诊断引擎、prompt、规则集、缓存 key 算法、机械检查阈值
- 不做后台/定时/打开即诊断；不引入轮询
- 不改批量体检、一键整改、健康分算法与 `/governance` 结构
- 不改造 `SkillsView` / `AgentsView` 内部
- 不给 mcp 增加语义诊断
- 不新增页面、顶层路由、分发通道或写接口
- 不在本变更内收窄诊断发送面（只保证不扩大，文案与实际一致）
