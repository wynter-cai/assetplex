# tasks.md：add-activity-log

> 类型 M（specs + tasks + TDD）。完成一项勾一项，勿批量预勾。

## 第一阶段：事件日志内核（core）

- [x] T1 新建 `src/core/activity-log.ts`：条目类型、`appendActivity`（best-effort）、`readActivity`（倒序/类型过滤/游标/保留期）
- [x] T2 单元测试 `tests/unit/core/activity-log.test.ts`：追加落盘、倒序读取、limit/游标、类型过滤、超期分片忽略与清理、坏行跳过、写失败不抛

## 第二阶段：接口与写入点（server）

- [x] T3 新建 `src/server/routes/activity.ts`：`GET /api/activity`（limit/type/cursor 校验，非法 400）
- [x] T4 `src/server/index.ts` 注册 `/api/activity`
- [x] T5 路由测试 `tests/unit/server/activity-route.test.ts`：正常分页、类型过滤、参数非法 400
- [x] T6 写入点：`/api/sync/run`（非 dryRun）、`/api/sync/reverse-import`、`/api/sync/execute-import`
- [x] T7 写入点：`/api/files` POST/PUT/DELETE
- [x] T8 写入点：治理整改 apply/undo、重复合并 apply/undo（通过 `recordActivity` 依赖注入）

## 第三阶段：首页与前端

- [x] T9 `getOverview().recentActivities` 改读事件日志（最多 5 条），保留空态；补单测
- [x] T10 前端：`web/src/pages/Activities.tsx`（时间线 + 类型筛选 + 加载更多）、`/activities` 路由、侧栏「活动」入口、`api.getActivity`、页面测试
- [ ] T11 文档：HANDOFF 进度、本变更勾选；隐私终检 0 命中后分层提交

## 已知取舍

- MCP stdio 写库（第二入口）本期不记入活动流：它是独立进程，且预研中列为待拍板项；后续有需求时在 `mcp-tools` 的 commit 成功回调里补一条路径级记录即可。

