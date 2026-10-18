# tasks: add-llm-conflict-arbitration

> 前置：本 tasks 与 proposal/specs/api-contract 需维护者审核通过后才允许动代码（SDD 铁律）。
> 全流程 TDD：每条后端任务先红测试；前端组件用 React Testing Library。

## Phase A — 准则元资产（specs/criteria-meta-asset.spec.md）

- [x] A1 `hub-files.ts`：`HubFileCategory` + `HUB_CATEGORIES` 增 `'criteria'`；红测试：list/write/read/delete criteria 文件走既有守卫（路径穿越拒绝、类别校验 400 文案自动包含 criteria）。✅ 实测：5 用例红→实现后 11/11 绿
- [x] A2 `src/core/criteria.ts`：frontmatter 解析/序列化纯逻辑（name/description/priority/enabled/appliesTo/source + body；缺省 enabled=true、priority=100、appliesTo=['all']）；`listCriteria(fs)` 按 priority→slug 排序；`hashCriteria(criteria[]): string`（组装与缓存用）。测试：Scenario 1/2/4 数据面 ✅ 实测：解析宽容/往返/排序/哈希 11 用例绿
- [x] A3 `criteria.ts` 增 `assembleCriteriaPromptBlock(enabled, targetCategory, budget=4000)`：先按 appliesTo 匹配目标类别，再按序取入至预算耗尽，返回 `{ block, used: slug[], skipped: number }`。测试 Scenario 5（类别过滤 + 截断披露）✅ 实测：单条超预算整条舍去、停用不计 skipped，5 用例绿
- [x] A4 内置**业内准则包**：先派内容任务——调研并改写业内最佳实践为准则模板（≥6 条：Anthropic Agent Skills 设计指南/渐进披露、AGENTS.md 写作规范、token 效率实践、rule 简洁性、agent 配置规范、description 触发写法；每条标 appliesTo 与 source，改写不直搬原文避License 风险），存为 core 模板常量；`insertCriteriaPack(fs, slugs[])` 按勾选生成、同名拒绝。测试 Scenario 1b/3 ✅ 实测：7 条准则（skill×2/token-all/rule/agents-md/agent/identity），模板往返无损+导入 6 用例绿；全量 618 测试、tsc 0 错
- [x] A5 server：criteria 走现有 `/api/files?category=criteria` 零新路由验证（集成测试：400 文案、CRUD 回路）；`GET /api/criteria` 聚合只读接口（frontmatter 解析后的 CriterionAsset[]，供 UI 列表）。✅ 实测：routes/criteria.ts 三接口（GET /、GET /pack、POST /import-pack），7/7 绿；写通道复用 /files 零新增
- [x] A6 web：`types/api.ts` + `lib/api.ts` 增 CriterionAsset / listCriteria / createHubFile/updateHubFile/deleteHubFile 复用；「裁决准则」页（列表卡 + 新建/编辑对话框 + 启用开关 + 删除确认 + 空态两动作）。组件测试覆盖 Scenario 1/2/4 UI 面。✅ 实测：CriteriaView+CreateDialog+PackDialog+criteria-model，7 用例红→绿；前端全量 167/167、web tsc 0 错、vite build ok
- [x] A7 资产导航动态类别接入：准则页入口进资产库导航，验证"不是写死第 5 个"（导航由类别清单驱动）。测试：导航渲染含 criteria 且未来加类别无需改导航代码。✅ 实测：asset-categories.ts 增 criteria 条目，Sidebar 纯 ASSET_CATEGORIES.map 驱动、/vault/:category 通配路由，零导航代码改动

## Phase B — 仲裁引擎（specs/conflict-arbitration.spec.md）

- [x] B1 `src/core/arbitration.ts`：`buildArbitrationPrompt({ category, left, right, leftLabel, rightLabel, criteriaBlock })` → system 含内置裁决骨架 + 准则区 + JSON 输出契约；user 含两侧内容（各截断 6000 字符）。测试：准则为空时骨架仍在；预算披露进 prompt。✅ 实测：5 用例绿（含截断标注/准则区条件渲染）
- [x] B2 `parseArbitrationOutput(output)`：fenced 容忍 → JSON → decision 四值闭集校验 → merge 必有 mergedContent，非法 throw。测试 Scenario 6 全部非法形态。✅ 实测：10 用例绿（含杂文提取/非 merge 草案忽略/rationale 回退）
- [x] B3 `arbitrateConflict(input, deps)`：DI LlmClient/Fs/CriteriaStore/AiCacheStore/config；缓存 key = sha256(左+右+准则集哈希+model)，命中不调模型返回 cached=true；配置不全抛 AiConfigIncompleteError。测试 Scenario 7/8。✅ 实测：9 用例绿（含内容/准则集变化失效、失败不写缓存）；另补 ArbitrationFileError/OutputError 专用错误类供路由映射
- [x] B4 server 路由 `POST /api/arbitration`：请求体校验（400/404）、错误映射（400 配置 / 422 输出非法）、成功回 ArbitrationResponse。红测试先行。✅ 实测：routes/arbitration.ts 全依赖注入，8 用例绿；index.ts 注册；后端全量 664/664、tsc 0 错、tsup build 成
- [x] B5 `src/core/skill-ai-cache.ts`（或新 `arbitration-cache.ts`）：仲裁建议缓存条目存储复用/扩展。测试往返 + 失效。✅ 实测：新建 arbitration-cache.ts（key 含类别/双内容/准则哈希/模型五要素），脏 JSON 过滤/merge 草案约束/增量写入 9 用例绿；Node store 落地 ~/.assetplex/arbitrations.json

## Phase C — 导入向导接入（UI）

- [x] C1 `ConflictDialog`：differs 项展开区加「AI 仲裁」按钮（none/exists 不渲染）；建议卡渲染决策徽标+理由+criteriaUsed 清单+截断提示+cached 标注。组件测试 Scenario 1/2 ✅（ArbitrationPanel.test 9 用例 + ConflictDialog.test 4 用例；preference 等非闭集类别不渲染入口）
- [x] C2 草案采纳流：merge 建议的可编辑草案框 +「以此为准」→ 项策略置 merge 且携带草案；keep-left/right 采纳 → overwrite/skip；manual-review 无采纳按钮。测试 Scenario 3/4/5（含"未确认导入前不落盘"断言）✅（面板只回调 onAdopt，不发任何写请求）
- [x] C3 降级与失败态：400 未配置 → 提示 + 跳设置链接；422 → "仲裁失败：原因"且手动策略按钮不受影响。测试 Scenario 6/8 ✅（按错误文案分流：含「配置」→ config-missing+链接 /skills；否则原样展示「仲裁失败：…」）
- [x] C4 Import 流程把草案文本透传到确认导入请求（后端 merge 分支优先采用显式草案，而非机械追加）。红测试先行 ✅（后端 commit 1d41bf2：sync-engine-import 4 用例红→绿；前端 conflictResolutions 升级 {strategy,draft?} 并在 buildImportRequest 透传 mergeDraft；nodeRead 支持 Hub 相对路径+防越界）

## Phase D — 验收与收尾

- [ ] D1 全量：`npm test` / `tsc -b` 双端 / tsup + vite 构建全绿
- [ ] D2 API 回环脚本：造两条真实分叉内容 → 仲裁 → 采纳 merge 草案 → 确认导入 → 校验落盘内容=草案（临时脚本用毕即删）
- [ ] D3 浏览器走查（Browser 子代理，用完即关）：准则页 CRUD、differs 仲裁、草案编辑采纳、未配置降级四类场景
- [ ] D4 文档回写：taxonomy 增「元资产：criterion」层与版本历史行；PRIVACY.md / data-and-privacy.md 补仲裁数据流出说明（Scenario 9 / D6）
- [ ] D5 隐私终检 `node scripts/privacy-check.mjs` 退出码 0；分层 commit（docs spec / feat 准则 / feat 引擎 / feat UI 接入 / docs 收尾）；本 tasks 勾选与实测记录

## 风险与预留

- 模型质量依赖用户端点能力：manual-review 与失败隔离保证"最坏等于没有仲裁"；prompt 骨架保持短（准则才是可迭代的资产，不用改代码）
- 大文件冲突：两侧各 6000 字符截断进 prompt，超限部分不裁决并在理由中提示（草案仅对已见内容负责）——走查时验证观感
- swap 方向入口：契约字段 direction 预留位不加（避免空头承诺），下期按同一 ArbitrationRequest 扩展
