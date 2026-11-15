# 验收记录 — refactor-asset-pipeline（单资产流水线）

> 记录口径：只写中性示例名与库内相对路径，不含本机真实资产名与绝对路径。
> 日期：2026-11-15

## 自动化验收

| 项 | 命令 | 结果 |
|---|---|---|
| 后端单测 | `node node_modules/vitest/vitest.mjs run` | 1223 passed（含新增 21 例） |
| 后端类型 | `node node_modules/typescript/bin/tsc -b` | 0 错 |
| 后端构建 | `node node_modules/tsup/dist/cli-default.js` | 成功 |
| 前端单测 | `node node_modules/vitest/vitest.mjs run`（web/） | 561 passed（含新增 34 例） |
| 前端类型 | `node node_modules/typescript/bin/tsc -b`（web/） | 0 错 |
| 前端构建 | `node node_modules/vite/bin/vite.js build`（web/） | 成功 |
| 隐私终检 | `node scripts/privacy-check.mjs` | 0 命中 |

## Scenario 逐条对照（自动化）

| 场景 | 覆盖用例 | 结论 |
|---|---|---|
| 打开详情即读摘要、不点不诊断 | `AssetEditor.test.tsx`「打开详情即读摘要」 | 通过 |
| 摘要四态文案（从未 / 有效 / 过期 / 不可用） | `DiagnosisSummaryBar.test.tsx` 6 例 | 通过 |
| 成本披露与字面一致（将调用 1 次模型 / 结果有效） | 同上 + `FixFlow.test.tsx` 确认屏 | 通过 |
| 问题清单含规则编号、置信度、来源与证据 | `IssueList.test.tsx` 7 例 | 通过 |
| 证据不足固定文案、不冒充可修复 | `IssueList.test.tsx` | 通过 |
| 修复后自动复检一次并报已修复/剩余 | `FixFlow.test.tsx`「自动复检」5 例 | 通过 |
| 撤销不触发诊断、只标过期 | 同上「撤销成功只标记摘要过期」 | 通过 |
| 复检通过才给分发主入口 | `DistributionGate.test.tsx` 3 例 | 通过 |
| 分发结果就地展示、只重试失败工具 | `DistributionDialog.test.tsx`「失败项可只重试失败工具」 | 通过 |
| 首页待办直达详情深链 | `TodayQueue.test.tsx` + `homeFixTargetPath` 用例 | 通过 |
| 0 / 1 / ≥2 资产三态布局 | `Vault.test.tsx` 10 例（新增） | 通过 |
| 深链为唯一真源、replace 不刷历史、未命中不诊断 | 同上 | 通过 |
| 未配置 AI 降级入口不指向技能页 | `DiagnosisPanel.test.tsx`「T11」 | 通过 |
| 读屏播报与区域名称 | `DiagnosisPanel` role=status、`FixFlow` 修复流、`DistributionDialog` 分发结果 | 通过 |

## 待人工补验（本轮未做）

三档视口（1440 / 1180 / 800）真机走查与全键盘串联未执行：本轮为无人值守自动验收，未开浏览器。
建议 5 分钟抽查：单资产类别进入即见正文且关闭后不重开、摘要四态文案、诊断→证据→草案→应用→自动复检→分发→重试→撤销一条链。

## 已知边界

- 摘要「有效」但医生报告缓存被外部清空时，会出现 valid 且 willCallModel=true 的组合（正常流程不产生）。
- 规格注释里残留 `/api/swap/rollback` 字样，实际接口已按 B21 更名 `/api/remediations/rollback`，本次未改规格正文。
