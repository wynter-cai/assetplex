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

## 三档视口 + 键盘主链真机走查（2026-11-18 夜班补验）

三档（1440 / 1180 / 800）× 七页：横向溢出 0、越界元素 0、控制台报错 0；单资产类别免点击展开、多资产不越权展开、正文可见、Esc 关闭后焦点归还触发卡片、关闭后本次停留不再自动重开。摘要四态中 never / valid 已在真机走到（valid 由实际诊断 1 次产生），stale / available=false 仅单测覆盖。

走查中发现并修复一处缺陷：新资产首次打开详情时，「还没有诊断过」与「摘要暂不可用（读取失败）」同时显示。根因是后端把「无记录」也算 `available=false`；现已收窄为「记录损坏 / 正文读不到」才算不可用。

未执行：应用修复 → 自动复检 → 分发 → 失败重试 → 撤销（会写真实资产）；三种降级（无 Key / 分发不可用 / 文件被删，需改配置或磁盘）。均由单测覆盖或留待人工按需抽查。详细记录见 `.trae/schedule/reports/2026-11-18-夜班-T13.md`（本机留存，不入库）。

## 已知边界

- 摘要「有效」但医生报告缓存被外部清空时，会出现 valid 且 willCallModel=true 的组合（正常流程不产生）。
- 规格注释里残留 `/api/swap/rollback` 字样，实际接口已按 B21 更名 `/api/remediations/rollback`，本次未改规格正文。
