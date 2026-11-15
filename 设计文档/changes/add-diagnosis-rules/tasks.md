# tasks: add-diagnosis-rules

> 前置：spec 与规则集需维护者审核通过后才开始编码（AGENTS.md §1 SDD）。
> 全部任务严格 TDD：先写失败测试，再写最小实现。
> 每个任务一个 commit，信息格式 `feat: 中文描述（add-diagnosis-rules T<n>）`。
> 本轮交付边界：只交付本目录文档与 YAML，`src/`、`web/` 零改动。

## 任务清单

| # | 优先级 | 任务 | 交付物 | 验证方式 |
|---|---|---|---|---|
| T1 | P0 | 规则集加载、校验与打包 | `src/core/diagnosis-rules.ts`：解析 YAML、校验必填字段 / 编号唯一 / 枚举合法性、坏规则降级为告警；`tsup` 把 `diagnosis-rules.yaml` 复制进产物 | `tests/unit/core/diagnosis-rules.test.ts`：合法集加载成功、缺字段规则跳过且其余可用、重复 id 拒绝、版本缺失 422；`npm test` + `npm run typecheck` + `npm run build` 后确认 dist 含 YAML |
| T2 | P0 | 静态规则执行器 + 证据定位 | `src/core/diagnosis-static.ts`、`src/core/diagnosis-evidence.ts`：45 条静态规则按「格式 / 阈值 / 引用 / 凭证 / 冲突信号」五组实现；命中即产出 `evidence`（路径 + 行号 + ≤200 字片段） | `tests/unit/core/diagnosis-static.test.ts`：每组至少 2 正 2 反例；断言片段是原文子串、行号准确；断言全程零 `LlmClient` 调用（注入 mock 断言未被调用） |
| T3 | P0 | 报告契约扩展与路由向后兼容 | 扩展 `src/core/types.ts`、`doctor.ts`、`src/server/routes/doctor.ts`：响应新增 `findings / coverage / rulesVersion / aiEvaluated / rejected`，旧 `issues` 由 findings 投影保留 | `tests/unit/core/doctor-diagnosis.test.ts` 与 `tests/unit/server/doctor-routes.test.ts` 扩展：旧字段不缺失、无证据项不进入 `issues`、机械项仍有值；`npx vitest run tests/unit/server/doctor-routes.test.ts` |
| T4 | P1 | AI 增量执行器（闭集 + 证据校验） | `src/core/diagnosis-llm.ts`：只对静态命中项与候选规则发请求；输出必须是候选 ruleId；证据不可定位或结构非法整条丢弃并计入 `rejected`；静态 high 不被模型结论覆盖 | `tests/unit/core/diagnosis-llm.test.ts`：非法编号被拒、编造片段被拒、静态 high 保留、`coverage.skippedReasons` 正确；沿用缓存 key 含 `rulesVersion` |
| T5 | P1 | 忽略清单与透明披露 | `src/core/diagnosis-ignore.ts` + `src/server/routes/diagnosis.ts` 的 ignore / restore / list；按 `ruleId + 路径 + contentHash` 失效 | `tests/unit/core/diagnosis-ignore.test.ts`：同内容再次诊断不提示、内容变更后恢复提示、`expired` 计数正确；路由测试覆盖 400 / 404 |
| T6 | P1 | 治理健康分口径切换 | 扩展 `src/core/governance-health.ts`、`governance-suggestions.ts`：规范性维度由 findings 计算；`DUP-01` 排除在规范性外（避免与唯一性双扣）；未评估语义规则不计为通过 | 扩展 `tests/unit/core/governance-health.test.ts`：同一资产同时含 `DUP-01` 与重复分组时只扣一次；AI 未配置时 `qualityMode` 与分数关系符合 Scenario 7.1 |
| T7 | P2 | 规则列表接口与编写指南数据 | `GET /api/diagnosis/rules`（`DiagnosisRuleListResponse`，含 `counts` / `modeCounts`）；编写指南页面数据由同一响应驱动 | `tests/unit/server/diagnosis-routes.test.ts`：计数与 YAML 一致（71 / 45 / 26）、cross 不计入七类、版本透出 |
| T8 | P2 | 标注集与回归脚本 | `tests/fixtures/diagnosis/`（七类 × 应报 / 不应报，中性命名）+ `src/core/diagnosis-eval.ts` + 脚本输出 `DiagnosisEvalReport` | `tests/unit/core/diagnosis-eval.test.ts`：差异计算正确、指标公式正确；跑一次基线把结果写入验收记录；CI 只告警不阻断 |
| T9 | P2 | 隐私与降级专项 | 发送层断言（只发片段与元数据）、无 AI 全静态、超时 / 预算降级路径 | `tests/unit/core/diagnosis-privacy.test.ts`：请求体不含全文 / 不含绝对路径 / 不含其他资产；无配置时零网络调用；超时后静态结论完整且标记降级 |

## 依赖与分批

```
T1 → T2 → T3            （只读基线，第一批可独立上线）
            ↘ T4 → T5   （增量与忽略，第二批）
                     ↘ T6 → T7 → T8 → T9  （治理口径、指南、评测，第三批）
```

- **第一批（T1-T3）**：只读诊断，最坏情况是「多报少报」，不改任何资产，风险最低。
- **第二批（T4-T5）**：引入模型与忽略写入，需同时上线隐私断言（T9 的最小集可提前到本批）。
- **第三批（T6-T9）**：改变健康分口径与页面数据，需与前端变更同步评审。

## 每个任务的完成定义（沿用 AGENTS.md §5）

1. 对应测试先红后绿，且未修改既有测试的断言来「迁就实现」；
2. `npm run typecheck` 无错误；
3. `npm run build` 成功；
4. 对照本目录 spec 的对应 Scenario 逐条手动验证；
5. 无新增 lint / 类型告警；
6. commit 前跑 `node scripts/privacy-check.mjs`，退出码为 0。

## 明确不在本变更任务内

- 治理中心分类页、证据展开、忽略按钮的**前端实现**（另立 web 变更，本变更只冻结数据口径）
- 资产编写指南的**页面排版**（只交付数据来源与规则文案）
- 规则可视化编辑器（proposal D6 已排除）
- MCP 运行时监控与工具指纹自动采集（只做静态规则）
