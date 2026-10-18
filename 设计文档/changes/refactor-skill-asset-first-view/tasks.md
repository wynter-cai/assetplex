# tasks: refactor-skill-asset-first-view

> spec: [asset-first-view.spec.md](./specs/asset-first-view.spec.md) | 契约: [api-contract.ts](./api-contract.ts)
> 约定：每任务 TDD（先红后绿）；验证命令 node 直调；前端改完 `vite build` 即生效

## Phase 1: 后端（TDD）

- [ ] **T1 (P0)** 纯函数：`skill-listing.ts` 新增 `deriveScope(provenance, inLibrary)` 与 `filterByScope`；`filterAndCountSkills` 支持 `scope` 参数（scope 先行 + countByScope 联动，排除自身维度）；`validateSkillListParams` 增 scope 校验。测试先红：`tests/unit/core/skill-listing`（或既有归属文件）覆盖 Scenario 5/6 + 资产定义边界（入库市场沉淀→asset、未入库自建→asset、未入库市场→environment）
  - 验证：`node node_modules/vitest/vitest.mjs run tests/unit/core/skill-listing*`
- [ ] **T2 (P0)** 路由：`GET /api/skills` 解析 `scope` 透传，响应补 `countByScope`；非法 scope → 400（消息逐字对齐契约）。集成测试断言不带 scope 的旧行为与 `scope=all` 等价（Scenario 6）
  - 验证：`node node_modules/vitest/vitest.mjs run tests/unit/server/skills-routes*`
- [ ] **T2.5 (P0)** 盘点源补齐（Scenario 7，用户批准并入）：`SkillSources` 新增 `qoderUserSkillsDir?`；discoverSkillFiles 扫 Qoder 用户级（origin=personal、tool=qoder）与各工作区 `.qoder/skills`（origin=project）；classifyOrigin 同步新前缀；`defaultSkillSources()` 按 `~/.qoder-cn/skills` 优先回退 `~/.qoder/skills` 解析。测试先红：Qoder 发现/容错/同名合并/classifyOrigin 四组用例
- [ ] **T3** `node node_modules/typescript/bin/tsc -b` 0 错 + 后端全量测试绿 + `npm run build`

## Phase 2: 前端（TDD，web/）

- [ ] **T4 (P0)** `types/api.ts` 与 `lib/api.ts`：listSkills 参数与响应补 scope/countByScope（mock fixture 必须与真实响应同构——上次 variants 类型假绿教训）
- [ ] **T5 (P0)** SkillsView：列表固定资产视图（**无平级分段**）；底部折叠入口「本机技能环境」+计数；展开环境列表（出处 chips 按市场→插件→内置排序，收藏保留，可收起，Scenario 2/8）；搜索空态指向入口（Scenario 4）；总计数/职能分面改资产口径（Scenario 1）；组件测试断言默认调用 `api.listSkills` 参数含 `scope:'asset'`，mock fixture 与真实响应同构
  - 验证：`node node_modules/vitest/vitest.mjs run src/components/skills/`
- [ ] **T6 (P1)** 收藏成功后的视图联动：invalidate 后条目按新归属从环境列表消失/资产列表出现，入口计数 -1（Scenario 3）
- [ ] **T7** `node node_modules/typescript/bin/tsc -b` + `node node_modules/vite/bin/vite.js build` 双绿 + 前端全量测试

## Phase 3: 验收与收尾

- [ ] **T8 (P0)** API 回环（真实数据）：scope=asset/environment 计数互斥且合计=total；`scope=environment&provenance=marketplace` 交集正确；不带 scope 旧调用逐字段与基线一致；资产口径内无任何 marketplace 未入库条目；Qoder 用户级技能（~/.qoder*/skills）与项目级 .qoder/skills 已纳入盘点（Scenario 7）
- [ ] **T9 (P0)** 浏览器走查：默认视图无市场技能且无平级分段、折叠入口计数正确；展开环境列表可见 chips/收藏；收起回到资产视图；搜 12306 空态指向入口；收藏一个市场技能后资产列表 +1、入口计数 -1；完成后关闭全部标签页
- [ ] **T10** spec Scenario 逐条核对；分层独立 commit（后端/前端/验收），提交前跑 `node scripts/privacy-check.mjs` 退出码 0

## 风险与回滚

- 回滚：前端 revert 视图 commit 即回到原「全部」列表；后端 scope 参数为增量，旧调用不受影响，可按层 revert；引擎扫描范围本次零改动
