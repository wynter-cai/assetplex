# Proposal：删除「切换工具」（remove-tool-swap）

> 级别：S · 日期：2026-11-15 · 状态：前端入口已删除；后端能力因真实依赖暂缓

## Goal

产品流程统一为「收纳到资产库 → 治理 → 分发到各工具」。「切换工具」与「同步中心」做的是同一件事
（把库内资产写进工具目录），两个入口并存只会让用户分不清哪个才是正式通道，因此删除 `/swap` 整个用户功能。
导航「分发与漂移」同步改名为「分发与同步」，状态文案「漂移」统一改为「与资产库不一致」。

## Scope

**做**

- 删除 `/swap` 页面、导航项「切换工具」、页面专属组件（`web/src/components/swap/*`）
- 删除页面专属 API 方法与类型（预览 / 执行 / 历史）
- `/swap` 替换式重定向到 `/sync`，书签不失效、不新增历史记录
- 导航与状态文案调整：漂移 → 与资产库不一致，并补一句成因说明

**不做（本次）**

- ❌ 不删除后端 swap 引擎与 `/api/swap` 路由 —— 存在真实依赖，见下节；硬删会破坏「治理 → 分发」主流程
- ❌ 不动用户本地 `~/.assetplex/`（含历史 `.swap-backup/` 目录）
- ❌ 不改 `backup-status.ts` 扫描 `.swap-backup/` 的语义（历史备份仍可能存在）
- ❌ 不改后端字段名 `drift`

## 后端真实依赖（删除阻塞项）

| 依赖方 | 依赖内容 |
|---|---|
| `src/server/lib/doctor-dispatch.ts` | 资产医生修复后的逐工具分发直接调用 `SwapEngine.preview/execute`（单资产范围写入） |
| `src/mcp/node-deps.ts` | MCP 资产提交后的分发复用同一条通道 |
| `src/core/doctor-backup.ts`、`src/core/sync-backup.ts` | 复用 `swap-fs` 的 `backupTarget` / `makeSwapId` / `pruneSwapBackups` |
| `src/server/lib/hub-context.ts`、`src/server/routes/doctor-fix.ts` | 注入 `SwapEngine` 单例 |
| `web/src/components/doctor/FixFlow.tsx` | `GET /api/swap/tools`（类别支持矩阵）+ `POST /api/swap/rollback`（回滚本次分发） |
| `web/src/components/vault/DistributionDialog.tsx` | `GET /api/swap/tools`（类别支持矩阵） |
| `src/core/backup-status.ts` | 读 `.swap-backup/` 计算「上次备份」（按硬约束保留） |

结论：swap 引擎同时承担「用户可见的切换功能」与「医生/MCP 的内部分发写入通道」两种角色。
后续二选一（需维护者拍板）：

- **方案 A**：把引擎按内部能力重新命名（如「分发写入引擎」），只删 `/swap` 页面与 `preview/execute/history` 的 HTTP 入口
- **方案 B**：用 `SyncEngine` 重写单资产分发（重建备份、回读校验、回滚），再整体删除 swap 模块

## Risks

| 风险 | 对策 |
|---|---|
| 用户收藏了 `/swap` 书签 | 替换式重定向到 `/sync`，不 404、不新增历史 |
| 后端能力删除后医生分发不可用 | 本次不删后端，先保留内部通道，另立变更处理命名或重写 |
| 文案改动与 spec 旧断言冲突 | 先改测试断言再改实现，跑定向测试 |
| 误删历史备份数据 | 只删代码，不碰 `~/.assetplex/` 与 `.swap-backup/` |

## 影响文件

- `web/src/App.tsx`、`web/src/components/layout/nav-items.ts`、`web/src/lib/api.ts`、`web/src/types/api.ts`
- 删除：`web/src/pages/Swap.tsx`、`Swap.test.tsx`、`web/src/components/swap/*`
- 文案：`web/src/components/home/ToolSyncMatrix.tsx`、`web/src/pages/Sync.tsx`
- 测试：`web/src/App.routes.test.tsx`、`web/src/components/layout/Sidebar.test.tsx`、`web/src/components/home/ToolSyncMatrix.test.tsx`、`web/src/pages/Sync.test.tsx`
- 后端（本次未删，保留为内部通道）：`src/core/swap*.ts`、`src/server/routes/swap.ts`、`src/server/lib/doctor-dispatch.ts`
