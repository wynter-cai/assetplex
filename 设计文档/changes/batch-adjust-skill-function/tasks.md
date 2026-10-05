# Tasks: 技能职能批量调整

## T1 core 批量覆盖（TDD）

- [ ] RED：tests/unit/skills-inventory.test.ts 增加批量用例（正常批量 / 部分 missing / 非法职能抛错 / 空 ids）
- [ ] GREEN：src/core/skills-inventory.ts 新增 `overrideSkillFunctionsBatch(ids, functionCategory, input)`：一次 buildAll + 一次 load/save，返回 `{ updated, missing }`
- [ ] 验证：vitest run 全绿

## T2 路由（TDD）

- [ ] RED：tests/unit/skills-routes.test.ts 增加 `POST /function-batch` 用例（200 成功 / 400 非法 body / 400 非法职能）
- [ ] GREEN：src/server/routes/skills.ts 挂载 POST /function-batch
- [ ] 验证：vitest run 全绿

## T3 前端批量交互（组件测试）

- [ ] web/src/lib/api.ts 增加 `batchSetSkillFunction`
- [ ] SkillsView：卡片复选框 + 批量操作条（全选/清空/下拉/应用）+ 筛选变化清空选择
- [ ] 组件用例：勾选出现批量条 / 全选计数 / 批量应用调用接口并刷新 / missing 提示 / 未选时应用禁用
- [ ] 验证：web vitest run 全绿

## T4 收尾验证

- [ ] 后端 vitest + tsc -b 全绿
- [ ] 前端 tsc -b + vite build 全绿
- [ ] 浏览器实测（启动 dist/index.js ui）
- [ ] 独立 commit
