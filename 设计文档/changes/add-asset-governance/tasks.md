# tasks: add-asset-governance

> 前置：本 tasks 与 proposal/specs/api-contract 需维护者审核通过后才允许动代码（SDD 铁律）。
> 全流程 TDD：每条后端任务先写失败测试（RED）→ 最小实现（GREEN）→ 重构；前端核心组件同测。
> 约束：禁止 any / @ts-ignore；core 不得依赖 server/cli/web；单文件 ≤300 行；测试夹具一律中性示例名。
> 顺序：H 健康分 → I 整改 → J MCP → K 去重 → L 建议 → M 验收（对应 proposal 四步路径，第④步未立项）。

## Phase H — 真实健康分与下钻（specs/asset-health-score.spec.md Scenario 1-6、10）

- [x] H1 `src/core/governance-health.ts`：四维评分的纯函数（输入：各类别资产清单 + 机械诊断结果 + 分发状态 + 重复分组；输出 GovernanceHealth）。权重 30/30/25/15，`not-applicable` 权重重归一化，`data-missing` 不伪造分数。测试 Scenario 1/2/4
- [x] H2 完整性/规范性/唯一性三个维度的数据装配：复用 `runMechanicalChecks` 与 `distribution-status`，不新写检查逻辑。测试 Scenario 1/5（AI 未配置 → qualityMode=mechanical-only）
- [x] H3 `src/server/routes/governance.ts`：`GET /api/governance/health` + `GET /api/governance/issues`（下钻分页、严重度排序）。测试 Scenario 3/6；断言 0 资产时 grade=empty、score=0 且前端不展示（接口不报错）
- [x] H4 web：首页健康卡替换 `HomeHero` 的假分数——总分 + 四维条 + 最大扣分项一句话；点击维度进问题清单，点条目进资产详情并展开 DiagnosisPanel。组件测试 Scenario 1/3/6
- [x] H5 缓存与刷新：`refresh=1` 时先返回估算（将调用 N 次）再执行；默认只读缓存。测试 Scenario 10

## Phase I — 一键整改（specs/asset-health-score.spec.md Scenario 7-9）

- [x] I1 `src/core/governance-remediation.ts`：计划生成（可修复项聚合、不可修复项给原因、单批上限 20、估算调用数），零写库。测试 Scenario 7
- [x] I2 `POST /api/governance/remediation/apply`：逐项复用 `applyAssetFix`（草案 → 写库 → 可选分发），独立成败聚合、batchId 落盘记录、rollbackAvailable 判定。测试 Scenario 8
- [x] I3 `POST /api/governance/remediation/undo`：按 batchId 逐项 `undoApplyFix`，失败逐条回报。测试 Scenario 9
- [x] I4 web：整改计划页（勾选、估算、不可修复项折叠）+ 执行进度 + 汇总条 + 撤销入口。组件测试 Scenario 7/8/9；断言「一键整改」不等同跳过确认（必须有确认按钮）

## Phase J — MCP 第二入口（specs/mcp-entry.spec.md）

- [x] J1 依赖与骨架：新增 `@modelcontextprotocol/sdk`；`src/mcp/server.ts` 组装 stdio server（契约见 `mcp-contract.ts`），`assetplex mcp` 子命令启动（不开浏览器、不占端口、不要求 HUB 运行）。测试 Scenario 2
- [x] J2 只读工具：`assetplex_identity_get` / `assets_list` / `asset_get` / `health_get` / `asset_diagnose`（useAi 默认 false）。测试 Scenario 1/7
- [x] J3 两段式写入：`asset_propose`（草稿缓存 + pendingChangeId + TTL 10 分钟，零写库）与 `asset_commit`（凭 id 落盘、写前备份、默认不分发）。测试 Scenario 3/4/5（含过期 id、越界路径、环境条目三种拒绝）
- [x] J4 引导语注入：`sync` 写入带起止标记的 AssetPlex 引导块，重复同步原地更新，关闭后移除且不动其余内容。测试 Scenario 6
- [x] J5 错误与一致性：统一 `McpToolError` 结构化返回，进程不崩；MCP 写入后 HUB 立即可见（同一数据源，不另建索引）。测试 Scenario 9/10
- [x] J6 文档：README 补三行接入示例（TRAE / Claude Code / 通用 stdio）；PRIVACY.md 补 MCP 边界（Scenario 8）

## Phase K — 重复治理（specs/duplicate-governance.spec.md）

- [x] K1 `src/core/duplicates.ts`：归一化哈希（exact）+ 名称/描述归一化 + token 集合相似度（near/gray 分组），零模型调用；阈值可配。测试 Scenario 1/2/6/8
- [x] K2 `POST /api/governance/duplicates/scan`：确定性扫描；`useAiJudgement=true` 时先估算再调模型，AI 未配置返回 503。测试 Scenario 2/7
- [x] K3 合并草案：`merge-draft` 产出合并正文 + unified diff + 待归档清单，零写库；灰区组必须显式勾选才可生成。测试 Scenario 3/7
- [x] K4 `duplicates/apply`：写保留项（备份）→ 归档其余成员到 `.archive/duplicates/<date>/<category>/` → 可选分发；逐项成败回报。测试 Scenario 4
- [x] K5 `duplicates/undo`：还原归档成员 + 恢复保留项原文 + 重算分发状态，失败逐条回报。测试 Scenario 5
- [x] K6 web：重复治理页（分组卡、保留项改选、草案编辑、执行与还原）。组件测试 Scenario 1/3/4/6；断言跨类别永不合并、环境条目不可归档

## Phase L — 主动性建议与首屏第一印象（specs/proactive-guidance.spec.md）

- [x] L1 `src/core/governance-suggestions.ts`：由健康分 + 重复分组 + 分发状态 + AI 配置合成建议，最多 3 条可执行 + 至多 1 条信息项，按「影响面 × 可执行性」排序。测试 Scenario 2/3/7
- [x] L2 `GET /api/governance/suggestions`：本地生成，零模型调用；每条建议必须带既有流程入口。测试 Scenario 4
- [x] L3 web：首页建议条（结论句 + 规模 + 一键动作 + 本次忽略）；首次进入的「先收拾烂摊子」引导（主 CTA 帮我收拾 / 次 CTA 先看看）。组件测试 Scenario 1/5/6

## Phase M — 验收与收尾

- [x] M1 全量：`npm test` / `npm run typecheck` / `npm run build` / 前端 `vitest run` + `tsc -b` + `vite build` 全绿；覆盖率不降
- [x] M2 API 回环：造中性示例资产（`example-skill-a/b` 重复各一份、一份缺 description）→ 健康分下降 → 下钻 → 整改计划 → apply（只改库）→ undo → 重复扫描 → 合并 → 还原；临时脚本用毕即删
- [x] M3 MCP 回环：`assetplex mcp` 用 Inspector 或测试客户端走 `identity_get` → `propose` → `commit` → HUB 可见；过期 id 与越界路径两类拒绝
- [x] M4 浏览器走查（走完关闭全部标签页）：首页真实分数与下钻、整改执行、重复页、建议条、首次引导五类场景
- [x] M5 隐私终检 `node scripts/privacy-check.mjs` 退出码 0；按 Phase 分层 commit（docs spec / feat 健康分 / feat 整改 / feat MCP / feat 去重 / feat 建议 / docs 收尾）
- [x] M6 文档回写：taxonomy 补「管家层」；HANDOFF 进度与测试基线更新（本机私有，不入库）

## 风险与预留

- **权重争议**：一期固定并在界面披露构成；二期再开放 hub.toml 覆盖，避免一期引入配置漂移
- **近重复误判**：默认只归档不删除 + 逐组人工确认 + 可还原；灰区永不自动执行
- **MCP 写入越权**：两段式 + TTL + 宿主确认语义 + 写前备份，四道闸；commit 不提供批量写
- **批次中断**：batchId 落盘，进程崩溃后可凭 batchId 查询与撤销已完成项
- **性能**：健康分聚合需并行读取而非逐文件串行；200 资产场景首页响应 < 1s（本地），不达标则分维度懒加载
- **与 add-asset-doctor 的边界**：本变更不修改医生诊断/草案/apply 内部逻辑，只编排调用；如需改动，回写 add-asset-doctor 的 spec 与测试
