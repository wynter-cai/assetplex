# Change: add-activity-log

> Change ID: `add-activity-log`
> 类型: M 级（功能优化 + 新页面）
> 状态: 实施中（2026-11-11）
> 上游预研: [P2-C preflight](../add-activity-feed-data-semantics/preflight.md)（结论：活动流零数据源，必须新建 append-only 事件日志）

## Goal (目标)

让「最近活动」与活动页有真实数据：把同步、导入、写库、治理批次四类操作留痕到本机事件日志，首页摘要与活动页共用同一读取函数，不制造第二套口径。

用户可见价值：
- 首页「最近活动」不再是永久空态
- 新增活动页可回看最近 6 个月操作时间线，按类型筛选
- 出问题时能自证「谁在什么时候动过哪些资产」

## Scope (范围)

### 做什么
1. 新增 `<Hub>/governance/activity/YYYY-MM.jsonl` 事件日志（append-only、按月分片）
2. 四个写入点：同步完成、导入完成（正向 + 反向）、Hub 写库（新建/编辑/删除）、治理批次（整改 apply/undo、重复合并 apply/undo）
3. 新增 `GET /api/activity?limit=&type=&cursor=`
4. 首页 `recentActivities` 改读事件日志（最新 5 条）
5. 新增活动页 `/activities` + 导航入口（替换现有重定向）

### 不做什么（Non-Goals）
- ❌ 不记录资产正文、文件名以外的隐私内容；只记类别、路径、计数、工具名
- ❌ 不做活动搜索、导出、按资产钻取
- ❌ 不记录 MCP stdio 写库（第二入口独立进程，本期不接；留待有明确需求时补）
- ❌ 不做保留期配置 UI（固定 6 个月）
- ❌ 不改同步引擎/导入引擎的行为；日志失败绝不阻断主流程

## 关键决策

| # | 决策 | 理由 |
|---|------|------|
| D1 | 存储为 `<Hub>/governance/activity/YYYY-MM.jsonl` | 与治理数据同域；append-only 单行 JSON，坏行可跳过；按月分片便于保留期裁剪 |
| D2 | 类型沿用前端既有四值 `import / sync / edit / create` | 首页活动卡图标已按此建表，治理批次归入 `edit`，不新增第五种图标 |
| D3 | 保留 6 个月，写入时顺带清理超期分片 | 不做后台任务；读取时也忽略超期分片（双保险） |
| D4 | 首页摘要与活动页共用 `readActivity()` | 预研明确「避免再出两套口径」 |
| D5 | 游标为 `<at>|<id>`，按时间倒序分页 | 不引入 offset 漂移；日志只追加，游标稳定 |
| D6 | 写入点通过依赖注入暴露 `recordActivity` | 路由单测可断言留痕，且不污染真实 Hub |

## Risks (风险)

| 风险 | 影响 | 缓解 |
|------|------|------|
| 日志写失败阻断主流程 | 同步/导入成功但返回 500 | `appendActivity` 内部 try/catch，失败返回 null，调用方不检查返回值 |
| 日志泄漏隐私 | 开源仓库/分享截图 | 只记路径与计数，不记正文；隐私终检照常跑 |
| 分片无限增长 | 磁盘占用 | 6 个月保留 + 写入时清理；单条日志 &lt; 500 字节 |
| 时间线噪音过多 | 用户看不清重点 | 首页只取 5 条；活动页默认 20 条一页，支持类型筛选 |

## 关联文档

- [预研：真实活动流的数据来源与缺口](../add-activity-feed-data-semantics/preflight.md)
- [spec：活動流与时间线](specs/activity-feed.spec.md)
- [API 契约](api-contract.ts)
- [任务清单](tasks.md)
