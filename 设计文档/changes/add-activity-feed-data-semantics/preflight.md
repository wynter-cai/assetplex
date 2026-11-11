# 预研：真实活动流的数据来源与缺口

> 日期：2026-11-11 | 性质：只读技术预研，不含实现，不作为 spec
> 触发：roadmap P2-C `add-activity-feed-data-semantics` 要求「启动前先做一份小型技术预研」

## 一、结论

1. **活动流目前没有任何可用数据源**：首页「最近活动」由函数硬编码返回空数组，不是「数据少」而是「没接」。
2. 唯一现成的操作记录是**同步历史**，但它只存在内存、上限 20 条、进程重启即丢，且没有逐资产明细，不能直接当活动流底座。
3. 因此真实活动流**必须新建一份 append-only 事件日志**，写入点分散在同步 / 导入 / 写库 / 批次执行四处。
4. P2-C 的四项里，实际只剩一项是真缺口：
   - ✅ 连接页真实分发状态：已实现（走 `/api/tools` + 分发索引）
   - ✅ 健康度可解释下钻：已由 `add-asset-governance` 交付
   - ✅ 计数口径不统一：确认存在，已在本轮先行修复（见 2.5 状态说明）
   - ❌ 真实活动流：零数据源
5. 建议**拆成三个独立变更**，不要一次性铺开（见第四节）。

## 二、证据

### 2.1 活动流零数据源

| 事实 | 位置 |
|---|---|
| `getRecentActivities()` 直接 `return []`，注释自述「Phase 3 活动页实现时接入 sync history」 | `src/core/overview.ts:188-195` |
| 首页把它当真实数据消费（空数组时显示占位文案） | `web/src/components/home/RecentActivity.tsx:38-70`、`web/src/pages/Home.tsx:131` |
| 活动页不存在，`/activities` 直接重定向回首页 | `web/src/App.tsx:33` |
| 导航已无「活动」入口 | `web/src/components/layout/nav-items.ts:23-33` |

### 2.2 同步历史不足以支撑活动流

| 事实 | 位置 |
|---|---|
| `syncHistory` 是模块级内存数组，注释写明「首版不持久化」 | `src/server/routes/sync.ts:12-18` |
| 只保留最近 20 条 | `src/server/routes/sync.ts:52-60` |
| 记录字段仅 `timestamp / tool / dryRun / results`，无「哪个资产去了哪个工具」的稳定结构 | `src/server/routes/sync.ts:53-58` |
| 反向导入完全不记录 | `src/server/routes/sync.ts:65-72` |

### 2.3 其余操作均无留痕

- 收藏/入库（导入技能、规则等）与资产编辑（写文件）**没有任何历史写入点**：全仓 `history|audit|activity` 检索只命中下面两处，均与资产操作无关。
- 工具热切换历史：`src/core/swap-fs.ts:151-173`（`backupRoot/history.json`，持久化但与资产活动无关）。
- CodeBuddy 外部会话历史：`src/core/agent-inventory.ts:272-298`（读取他人文件，非本产品行为记录）。

### 2.4 连接页：页面真实，首页摘要仍是假的

- 连接页走真实数据：`web/src/pages/Connections.tsx:16` → `api.getTools` → `src/server/routes/tools.ts:79` → `buildToolAssetCounts`
  - 已同步只认分发索引 `status === 'synced'`（`src/server/lib/tool-asset-counts.ts:65-79`）
  - 可收藏按 `conflict === 'none'` 且同路径去重（`src/server/lib/tool-asset-counts.ts:81-99`）
- 但首页连接摘要仍是旧逻辑：只要「已安装 + 已启用」就标 `synced`，`assetCount` 与 `pendingCount` **恒为 0**（`src/core/overview.ts:162-169`）。
- 同一「某工具同步了几个资产」的概念，系统里存在两套口径。
- **状态（2026-11-11）**：首页连接卡的 `assetCount` 已改用分发索引（`/api/hub/overview` 依据 `summary.toolSynced` 回填，项目级工具跳过），不再恒 0。

### 2.5 计数口径不统一（确定性 bug）

| 口径 | 实现 | 差异点 |
|---|---|---|
| 首页资产快照 | `checkHubHealth()` 的 `fileCountByCategory`（`src/core/hub-files.ts:280-284`） | 按**文件**计数，但技能包内附带文件（README、脚本、参考文档等）会被逐个计入 |
| 治理 / 重复扫描 | `defaultListAssets()`（`src/server/routes/duplicates.ts:425-430`） | 总有数按 `listAssets()`（技能只认 `SKILL.md`）；参与评分的资产另行过滤 |
| 工具三口径 | `buildToolAssetCounts()` | 以分发索引 + 发现结果为准 |

推论：一个带 2 个附带文件的技能，在首页快照计 3，在治理页只计 1。任何「首页 N 项 vs 治理页 M 项」的数字对不上，都源于此（`collectFiles` 只收文件、不收目录，所以差异不是目录条目，而是技能包附带文件）。

另：`overview.healthScore` 曾是旧公式 `60 + 资产数 × 4`（`src/core/overview.ts:118-121`），属于随时可能被误用的假数据。

**状态（2026-11-11）**：以上两项已在本轮修复——
- 治理页 `totalAssets` 收敛到「我的库」口径（`listAssets().total` + agent 数），评分范围与总数口径分离；
- 首页 `overview.healthScore` 字段已从接口与前端类型中删除，健康卡只读 `/api/governance/health`；重复的 `web/src/lib/mock-data.ts` 一并删除。

## 三、建议的最小实现方案

### 3.1 事件日志（新增唯一持久面）

- 位置：`<Hub>/governance/activity/YYYY-MM.jsonl`
- 写入点（四处，均为写操作成功之后、best-effort，失败不阻断主流程）：
  1. 同步完成（含 dryRun、目标工具、成功/失败计数摘要）
  2. 反向导入完成
  3. 资产写库（`/api/files` 写/删）
  4. 批次类操作完成（整改 apply/undo、重复合并 apply/undo、MCP commit）
- 单条字段建议：`id / at / type / actor(web|mcp|cli) / summary / targets? / counts? / paths?`
- **隐私边界**：只记路径、类别、计数、工具名，不记资产正文；沿用现有隐私终检口径。
- 读取：`GET /api/activity?limit=&type=&cursor=`，新→旧；首页 `recentActivities` 与活动页共用同一读取函数，避免再出两套。

### 3.2 活动页

- 恢复 `/activities` 路由与导航入口（当前重定向到首页）
- 时间线 + 类型筛选（同步 / 导入 / 写库 / 治理）
- 空态沿用现有文案，不造假数据

### 3.3 保留策略

- 按月分片，默认保留 6 个月，读取时忽略超期分片；清理只在写入时顺带做，不做后台任务。

## 四、建议的拆分（待拍板）

| 变更 | 级别 | 内容 | 为什么单独做 |
|---|---|---|---|
| `fix-asset-count-consistency` | C | 快照与治理统一为「我的库」口径；处理 `overview.healthScore` 假字段 | 是确定性 bug，可先修，风险低、见效快（**已完成**） |
| `fix-connection-summary` | C | 首页连接摘要复用分发索引，不再恒 0 | 小改动，能立刻消除「两套口径」（**已完成**） |
| `add-activity-log` + 活动页 | M | 事件日志 + 读取接口 + 活动页 + 首页接入 | 唯一需要新 spec 的部分，体量最大 |

## 五、待拍板

1. 是否按上表只启动 `add-activity-log` + 活动页（两个 C 级修复已完成）
2. 活动日志保留期（建议：6 个月按月分片）
3. MCP 写入是否记入活动流（建议：记，仅路径级）
4. 活动流首页摘要是否与活动页共用同一读取接口（建议：共用，避免第三套口径）
