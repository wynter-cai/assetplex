# Tasks：删除「切换工具」（remove-tool-swap）

> 命令在 PowerShell 5.1 下用 node 直调（见 HANDOFF §7）；先改测试断言，再改实现
> 后端删除任务因真实依赖暂缓，见 T4

## T1 删除前端入口

- [x] 删除 `web/src/pages/Swap.tsx`、`Swap.test.tsx`
- [x] 删除 `web/src/components/swap/SwapPreviewPanel.tsx`、`SwapResultPanel.tsx`、`SwapHistoryList.tsx`、`swap-labels.ts`
- [x] `App.tsx` 移除页面 import 与路由渲染
- [x] `nav-items.ts` 移除「切换工具」子项与 `Repeat` 图标
- [x] `api.ts` 删除 `swapPreview` / `swapExecute` / `getSwapHistory`
- [x] `types/api.ts` 删除页面专属类型（`SwapPreview*` / `SwapExecuteResult` / `SwapHistoryEntry` 等）
- [x] 保留 `getSwapTools` / `swapRollback` 与 `SwapToolCandidate` / `SwapRollbackResult`（医生与分发对话框真实依赖）
- **验证**：`node node_modules/vitest/vitest.mjs run src/App.routes.test.tsx src/components/layout/Sidebar.test.tsx src/components/doctor/FixFlow.test.tsx src/components/vault/DistributionDialog.test.tsx`

## T2 旧 URL 兼容

- [x] `/swap` 以 `<Navigate to="/sync" replace />` 替换式重定向
- [x] `App.routes.test.tsx` 增加 `/swap → /sync` 映射断言
- **验证**：重定向用例通过，导航类型为 `REPLACE`

## T3 文案调整

- [x] 导航「分发与漂移」→「分发与同步」
- [x] 首页工具矩阵状态「有漂移」→「与资产库不一致」
- [x] 首页与同步页补说明：工具里的版本被手动改过或缺失，重新同步会用资产库版本覆盖
- [x] 后端字段名 `drift` 不变
- **验证**：`Sidebar.test.tsx` / `ToolSyncMatrix.test.tsx` / `Sync.test.tsx` 全绿

## T4 删除后端能力（暂缓，待维护者拍板）

- [ ] 删除 `src/core/swap-types.ts`、`swap.ts`、`swap-exec.ts`、`swap-plan.ts`、`swap-verify.ts`、`swap-fs.ts`
- [ ] 删除 `src/server/routes/swap.ts` 并从 `server/index.ts` 移除挂载
- [ ] 删除 `tests/unit/core/swap.test.ts`、`swap-single-asset.test.ts`、`tests/unit/adapters/swap-support-matrix.test.ts`、`tests/unit/server/swap-routes.test.ts`
- [ ] 处理真实依赖（二选一）：
  - [ ] 方案 A：引擎更名，仅删除用户入口；或
  - [ ] 方案 B：用 `SyncEngine` 重写单资产分发（备份 / 回读校验 / 回滚）后整体删除
- **阻塞原因**：`doctor-dispatch.ts`、`node-deps.ts`、`doctor-backup.ts`、`sync-backup.ts`、`hub-context.ts`、`doctor-fix.ts` 以及前端 `FixFlow` / `DistributionDialog` 均真实调用 swap 引擎或 `/api/swap`；
  硬删会破坏「治理 → 分发到各工具」主流程

## T5 验证

- [x] web 定向测试通过
- [x] web 全量测试 `node node_modules/vitest/vitest.mjs run`（71 文件 / 527 用例）
- [x] 后端全量测试（107 文件 / 1206 用例通过，1 跳过）
- [x] 双端 `node node_modules/typescript/bin/tsc -b` 0 错
- [x] 后端 `tsup` 构建、前端 `vite build` 成功
- [x] `node scripts/privacy-check.mjs` 退出码 0

## T6 提交

- [x] 代码变更独立提交
- [x] 变更文档独立提交
- [ ] 后端删除提交（被 T4 阻塞）
