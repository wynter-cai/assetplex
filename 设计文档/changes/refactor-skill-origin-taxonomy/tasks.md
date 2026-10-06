# tasks: refactor-skill-origin-taxonomy

> spec: [skill-origin-taxonomy.spec.md](./specs/skill-origin-taxonomy.spec.md) | 契约: [api-contract.ts](./api-contract.ts)
> 约定：每任务 TDD（先红后绿）；验证命令用 node 直调（禁 npx/.ps1）；前端改完 `vite build` 即生效（服务按请求读 dist，2026-10-06 实证无需重启）

## Phase 1: 后端（TDD）

- [x] **T1 (P0)** 推导纯函数：`deriveProvenance(inventoryOrigin, curateSource)` + `inLibrary`，单测 8 例（vault 无 source→self / vault source=marketplace:*→marketplace / personal|project→self / plugin / marketplace / builtin / 未知兜底→builtin 计警示）。`tests/unit/skill-provenance.test.ts` 先红后绿
  - 验证：`node node_modules/vitest/vitest.mjs run tests/unit/skill-provenance.test.ts`
- [x] **T2 (P0)** inventory 输出改造：SkillInfo 对外语义 `provenance`+`inLibrary` 替换 `origin`（内部 vault 标识与磁盘路径不动）；修复既有单测（scanner/merger/curation 标签断言）
  - 验证：`node node_modules/vitest/vitest.mjs run`（全量红转绿）
- [x] **T3 (P0)** API 过滤：`GET /api/skills?provenance=&status=`（origin 参数移除）+ `countByProvenance`/`countByStatus` 随 status+search 联动重算；集成测试覆盖 chips 计数与交集查询（未入库×市场=292）
  - 验证：`node node_modules/vitest/vitest.mjs run tests/integration/`
- [x] **T4 (P0)** 写管理契约等价迁移：可写判定 vault→inLibrary（行为逐条等价：非库只读/库可写/删除分发/错误体 status 不变）；契约回归测试全绿
  - 验证：`node node_modules/vitest/vitest.mjs run tests/unit/skill-write* tests/integration/`
- [x] **T5 (P1)** curate 术语迁移：错误文案「沉淀自」→「来自」、内部 source frontmatter 与缓存 key 不动
  - 验证：`node node_modules/vitest/vitest.mjs run tests/unit/skill-curation*`
- [x] **T6** `node node_modules/typescript/bin/tsc -b` 0 错 + 全量测试绿

## Phase 2: 前端（TDD，web/）

- [x] **T7 (P0)** 类型与标签：api.ts 新类型 + `PROVENANCE_LABELS`/`LIBRARY_STATUS_LABELS`；SkillsView chips 单行四类 + 三档状态分段控件（全部/我的库/未入库）与出处 chips 正交组合；组件测试（计数联动/交集查询/组合筛选）
  - 验证：`node node_modules/vitest/vitest.mjs run src/components/skills/`
- [x] **T8 (P0)** 全 UI 文案替换：我的库/收藏到我的库/来自 市场/删除确认/批量条/对话框/Home 与导航残留；agent-labels「保险箱」→「我的库」（agent 分类结构不动）
  - 验证：`Grep 保险箱|沉淀` web/src 零命中（测试快照除外）
- [x] **T9 (P1)** 详情徽章「来自 市场」+ SkillsView/AgentView chips 计数联动测试补齐
  - 验证：前端全量 `node node_modules/vitest/vitest.mjs run`
- [x] **T10** `node node_modules/typescript/bin/tsc -b` + `node node_modules/vite/bin/vite.js build` 双绿

## Phase 3: 验收与收尾

- [x] **T11 (P0)** API 回环：四类计数 99/292/27/24（合计 442）、status=未入库×provenance=marketplace 交集=292、写契约回归（非库只读/库可写/收藏复制+source 保留）；数据清回基线（vault 31 不变）
- [x] **T12 (P0)** 浏览器走查（陌生用户视角）：技能页 chips 四类 + 状态分段组合查询、详情徽章「来自 市场」、全页无「保险箱/沉淀」字样；完成后关闭全部标签
- [x] **T13** spec Scenario 逐条核对记录入验收 section；按任务分层独立 commit（后端/前端/验收三个，`git -c user.name="Wynter-Cai" -c user.email="299045391+wynter-cai@users.noreply.github.com"`）

## 验收记录（2026-10-06）

**后端 501/501 测试全绿（33 文件）、tsc 0 错、tsup 构建成功；前端 95/95 全绿（10 文件）、tsc 0 错、vite build 成功。**

T11 API 回环（真实数据，服务重启后实测）：

| 验证点 | 预期 | 实测 |
|--------|------|------|
| GET /api/skills 全量 | total 442，countByProvenance self 99 / marketplace 292 / plugin 27 / builtin 24，countByStatus in 31 / out 411 | ✅ 一致 |
| status=out&provenance=marketplace 交集 | items 292（待收藏候选） | ✅ 292 |
| status=in 视图 | items 31，countByProvenance {self:31, 其余 0}（我的库全自建） | ✅ 一致 |
| PUT/DELETE 非库技能（12306） | 400 `{"error":"未入库技能只读，请先收藏到我的库"}` | ✅ 逐字一致 |
| provenance=foo 非法值 | 400 `{"error":"无效来源：foo，支持：self, marketplace, plugin, builtin"}` | ✅ 一致 |
| curate 临时副本回环 | 201 + source 溯源（库内市场技能出处记 marketplace）→ in 32 → DELETE 200 → 回基线 in 31 / total 442 | ✅ 零污染 |

T12 浏览器走查（3 轮子代理，最终 DOM 直查定案）：chips 四类与计数、状态分段（全部 442 / 我的库 31 / 未入库 411）、组合筛选（未入库×市场安装）、按职能子选项卡切换、详情面板（文件位置/副本数/SKILL.md 预览高度/Esc 关闭）、全页无「保险箱/沉淀」字样——全部通过。走查过程中「我的库显示空」为正交筛选下残留市场安装过滤的正确空态（我的库×市场安装=0 与 API countByProvenance 一致），非 Bug。

**验收抓出并修复的真 Bug（TDD，前端测试 94→95）**：前端 SkillInfo 类型漏按契约同步（`variants: string[]`/`sourcePath`），后端已按契约返回 `variants: number`/`path`——组件测试 mock 全用数组未暴露，浏览器实测详情面板 `variants.map is not a function` 白屏。修复：types/api.ts 对齐契约（path + variants: number）、SkillCard 副本徽章、SkillDetail 副本列表改主路径+数值副本数，三个测试 fixture 换新契约并新增多副本渲染用例（先红后绿）。

**顺带清理**：`agent-write.ts` 错误文案「仅保险箱智能体…」→「仅我的库中的智能体…」、`skill-curation.ts` 内部错误「技能沉淀后」→「技能收藏后」（用户可见消息与开源术语一致；代码注释不在本次清零范围）。

**回滚预案**：单 revert 前端 commit 回退 UI；后端按层 revert；内部 vault 目录/source frontmatter/AI 缓存零迁移，revert 无数据残留风险。

## 风险与回滚

- origin 字段引用面广（scanner/merger/curation/write/routes/web）→ 按层提交，每层全量测试过再进下层
- AI 分类缓存不受影响（key=内容 hash 与 origin 无关），无需重分类
- 回滚：单 revert 前端 commit 即可回退 UI；后端按层 revert
