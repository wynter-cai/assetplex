# Tasks：老用户日常首页重设计（refactor-home-action-panel）

> 范围严格限定 Phase 0：首页只读展示 + 导航五组。治理中心（B12）不在本清单。
> 每个任务独立可提交；后端遵循 TDD（先红后绿），前端核心组件同步补测试。
> 命令在 PowerShell 5.1 下用 node 直调（见 `HANDOFF.md` §7），提交前跑 `node scripts/privacy-check.mjs`。

## 前置说明（必读）

1. **「治理」入口一期落地形态**：侧栏「治理」指向新增的 `/governance` 临时容器页。该页**只复用**现有体检能力（`GET /api/governance/health` + `GET /api/governance/issues` + 现有 `DiagnosisPanel`），不新增任何诊断、筛选、批量、应用修复逻辑。治理中心（B12）落地时**替换该页内容、不改 URL、不加第二套入口**。
2. **接口边界**：一期只新增 `GET /api/home/dashboard` 一个只读接口。不要顺手拆 `/api/home/status`、`/api/governance/queue` 等（理由见 `api-contract.ts` 末尾）。
3. **不改动**：`/vault/*`、`/connections`、`/sync`、`/swap`、`/projects`、`/duplicates`、`/activities`、`/discover`、`/import`、`/settings`、`/onboarding` 的页面内部实现一律不动。
4. **不写假数据**：任何拿不到的数据一律 null → 界面「暂不可用」，禁止填 0、禁止填示例待办。

---

## T1【P0】备份时间探测（后端 core）

- [x] 新增 `src/core/backup-status.ts`：只读扫描三个 Hub 内备份根目录（`.doctor-backup/`、`.swap-backup/`、`.backups/onboarding/`），取最新一次备份时间
- [x] 只读目录名（时间戳编码）与单个元数据文件（`meta.json` / `manifest.json`），不递归、不读正文
- [x] 三处都不存在 → `state: 'none'`；目录存在但读取异常 → `state: 'unavailable'`
- [x] 纯逻辑与 fs 端口分离，便于注入测试依赖
- **测试**：`tests/unit/core/backup-status.test.ts`（空目录 / 单目录 / 多目录取最新 / 读取异常）
- **验证**：`npx vitest run tests/unit/core/backup-status.test.ts` 全绿；`npm run typecheck` 0 错

## T2【P0】待办队列跨维度去重收集（后端 core）

- [x] 在 `src/core/governance-health.ts` 新增「跨四个维度收集 + 去重 + 严重度降序」纯函数，复用 `collectDimensionIssues` / `sortHealthIssues`
- [x] 去重键为「Hub 相对路径 + 检查项 + 发现内容」：规范性维度包含全部机械项，与完整性维度不得重复计数
- [x] 返回 `total`、`bySeverity`、`items`（可截断前 N 条，但 total 为全量）
- **测试**：`tests/unit/core/governance-queue.test.ts`（同项重复只计一次 / 排序顺序 / 空集 / 截断不改变 total）
- **验证**：`npx vitest run tests/unit/core/governance-queue.test.ts` 全绿；既有治理测试不回归

## T3【P0】抽取治理快照共享装配（后端重构，行为不变）

- [x] 新增 `src/server/lib/governance-snapshot.ts`：把 `routes/governance.ts` 中「资产枚举 + 语义缓存只读 + 分发索引 + 30s 缓存」的装配抽成可复用函数（含 `refresh` 语义与失效回调）
- [x] `routes/governance.ts` 改为调用该函数，删除重复实现；**外部行为、响应结构、缓存时长完全不变**
- **验证**：`npm test`（治理、整改、重复治理全部用例）全绿；`npm run typecheck` 0 错

## T4【P0】`GET /api/home/dashboard` 路由

- [x] 新增 `src/server/routes/home.ts`：装配 `HomeDashboardResponse`（见 `api-contract.ts`）
- [x] 数据来源：治理快照（健康分 / 体检时间 / 待办）、分发索引（未同步数、各工具漂移数）、适配器 detect + `hub.toml` 启用状态（工具状态）、活动日志（最近 5 条 + 各工具最近同步时间）、T1 备份探测
- [x] `issuesLimit` 校验 1-20（缺省 5），`refresh` 只允许 0/1，非法入参返回 400（与既有路由风格一致）
- [x] 单块失败只让该块为 null / `available:false`，不让整个响应 500
- [x] `src/server/index.ts` 挂载 `/api/home`
- **测试**：`tests/server/home-dashboard.test.ts`（正常装配 / 库为空 / 待办不可用 / 分发部分失败 / 从未同步的工具 / 从未备份 / 非法参数 / 打开首页不触发模型调用）
- **验证**：`npx vitest run tests/server/home-dashboard.test.ts` 全绿；`npm run build` 成功

## T5【P0】前端类型与请求方法

- [x] `web/src/types/api.ts` 增加 `HomeDashboardResponse` 等（与 `api-contract.ts` 逐字段一致）
- [x] `web/src/lib/api.ts` 增加 `getHomeDashboard(params?)`
- **验证**：`node node_modules/typescript/bin/tsc -b` 0 错

## T6【P0】状态条组件

- [x] 新增 `web/src/components/home/StatusBar.tsx`：一行四个数字，规格见 home-dashboard Requirement 1
- [x] 健康分/待治理 → `/governance`（链接语义），未同步 → `/sync`，上次备份为不可点文本
- [x] `null` 一律渲染「暂不可用」；`healthGrade === 'empty'` 渲染「待盘点」
- **测试**：`StatusBar.test.tsx`（四数字渲染 / 下钻 href / 单块不可用 / 库为空不显示 0 / 上次备份不可点）
- **验证**：`npx vitest run src/components/home/StatusBar.test.tsx` 全绿

## T7【P0】今日待办队列组件

- [x] 新增 `web/src/components/home/TodayQueue.tsx`：严重度排序、前 5 条、行内「查看」+ 可修复项「去资产库修改」、底部「查看全部 N 项」
- [x] 「查看」就地展开体检报告（复用现有 `DiagnosisPanel`），不跳页、不写库
- [x] 键盘：↑/↓ 或 J/K 移动、Enter 打开、Esc 关闭并归还焦点
- **测试**：`TodayQueue.test.tsx`（排序 / 数量与 total 一致 / 查看展开 / Esc 归还焦点 / 0 条时交给空态 / 无「忽略/稍后/一键修复」）
- **验证**：`npx vitest run src/components/home/TodayQueue.test.tsx` 全绿

## T8【P0】工具与同步矩阵组件

- [x] 新增 `web/src/components/home/ToolSyncMatrix.tsx`：工具名 + 状态 + 最近同步；漂移行显示「N 处」
- [x] 未安装置灰不可点；已安装行点进 `/connections?tool=<toolId>`；底部「添加工具」→ `/connections`
- [x] `unknown` → 「状态暂不可用」；无记录 → 「尚无同步记录」
- **测试**：`ToolSyncMatrix.test.tsx`（五种状态 / 未安装不可点 / 下钻 href / 无同步记录文案 / 一工具都没有的空态）
- **验证**：`npx vitest run src/components/home/ToolSyncMatrix.test.tsx` 全绿

## T9【P0】最近变化组件

- [x] 新增 `web/src/components/home/RecentChanges.tsx`：固定最多 5 条 + 「查看全部」→ `/activities`；0 条时保留「查看全部」
- **测试**：`RecentChanges.test.tsx`（5 条上限 / 排序 / 空态 / 链接存在）
- **验证**：`npx vitest run src/components/home/RecentChanges.test.tsx` 全绿

## T10【P0】首页重组装与空态

- [x] `web/src/pages/Home.tsx` 改为：状态条 → 待办 →（宽屏两栏）矩阵 → 最近变化
- [x] 三种空态：库为空（两个出口）、全部健康（最近体检时间 + 重新体检）、待办不可用（暂不可用 + 重试）
- [x] 「重新体检」调用 `refresh=1` 后，健康分/待办/未同步一起更新；失败保留旧值
- [x] 移除资产快照、快捷动作、建议条、旧连接卡在首页的挂载（组件文件保留，其他页面若引用不受影响）
- [x] 保留「新手引导续跑」卡片行为不变
- **测试**：重写 `web/src/pages/Home.test.tsx`（四区块渲染 / 空态三分支 / 局部失败不整页崩 / 重新体检调用 refresh=1 / 不出现资产快照与快速动作）
- **验证**：`npx vitest run src/pages/Home.test.tsx` 全绿；`node node_modules/vite/bin/vite.js build` 成功

## T11【P0】`/governance` 临时容器页

- [x] 新增 `web/src/pages/Governance.tsx`：健康分卡（复用 `HomeHero` 或等价展示）+ 四维问题清单（复用 `HealthIssuesPanel` 的查询与展开，展开在页内进行）
- [x] 页头标注「治理中心建设中」，说明当前为体检与待办视图；不做筛选/批量/忽略/应用修复
- [x] `web/src/App.tsx` 增加路由
- **测试**：`Governance.test.tsx`（渲染健康分与四维 / 点条目展开报告 / 无「一键修复」类按钮）
- **验证**：`npx vitest run src/pages/Governance.test.tsx` 全绿

## T12【P0】导航五组改造

- [x] `web/src/components/layout/nav-items.ts` 改为分组数据结构（五个组 + 设置独立底部），类型保留可扩展
- [x] `Sidebar.tsx`：单链接组渲染为链接、多链接组渲染为「组按钮 + 子项」；命中自动展开；手动折叠不丢位置；组按钮徽标读首页查询缓存，未加载不显示
- [x] `MobileTopBar.tsx`：当前页摘要按组映射（`/sync` → 「连接与同步」，`/` → 「总览」）
- [x] 保持既有无障碍约束：组按钮与链接并列、`aria-expanded` + `aria-controls`、地标名称不变
- **测试**：重写 `Sidebar.test.tsx`（五组结构 / 深链自动展开 / 嵌套类别高亮 / 手动折叠后组按钮保留命中态 / 徽标 0 与不可用不显示 / 无 `<a><button>` 嵌套）；更新 `AppLayout.test.tsx`
- **验证**：`npx vitest run src/components/layout` 全绿

## T13【P0】旧 URL 重定向

- [x] `web/src/App.tsx`：`/identity`、`/rules`、`/skills`、`/mcp` → `/vault/<category>`；`/tools` → `/connections`；`/legacy/dashboard` → `/`
- [x] 使用替换式跳转（不新增历史记录）；其余路径与未知路径行为不变
- **测试**：`App.routes.test.tsx`（逐条映射 + 替换式跳转 + 未知路径落 `/`）
- **验证**：`npx vitest run src/App.routes.test.tsx` 全绿

## T14【P1】全量回归与走查

- [ ] 检索所有断言导航项数量/顺序、首页区块文案、`/api/hub/overview` 在首页使用的用例，按新结构更新（**只改结构假设，不改测试意图**）
- [ ] 后端：`npm test`、`npm run typecheck`、`npm run build` 全绿
- [ ] 前端：`npx vitest run`、`tsc -b`、`vite build` 全绿
- [ ] 手工走查 1440 / 800 两档：四区块布局、三种空态、五组展开与徽标、六条旧 URL 重定向、抽屉选择后关闭并归还焦点
- **验证**：命令退出码 0；走查记录写入本目录 `ACCEPTANCE.md`

## T15【P2】文档回写与提交

- [ ] `设计文档/assetplex-product-backlog.md`：P2-3 标记为进行中/已完成（按实际）
- [ ] `设计文档/changes/simplify-navigation-ia/`：proposal 顶部标注「导航方案被 refactor-home-action-panel 取代」
- [ ] `HANDOFF.md` 进度表补一行（本机私有，不入库）
- [ ] 每个任务单独提交；提交前 `node scripts/privacy-check.mjs` 退出码 0
- **验证**：`git log --oneline -5` 与 `git status` 自证；隐私终检 0 命中

---

## 依赖与顺序

```
T1 ┐
T2 ┼→ T4 → T5 →（T6 ∥ T7 ∥ T8 ∥ T9）→ T10 → T14 → T15
T3 ┘                    T11 ─┘
                        T12 → T13 ─┘
```

- T3 必须先于 T4（共享快照），否则首页会复制一份治理装配，口径迟早分叉。
- T11/T12/T13 只依赖前端路由与导航，可与 T5–T10 并行。
- T14 必须最后统一跑，避免逐任务跑过但组合回归失败。

## 明确不做（防止范围蔓延）

- 不做治理中心任何视图（筛选、按类型 tab、证据 diff、应用/撤销/忽略/稍后）
- 不做命令面板、全局新建按钮、首页个性化、移动端三件事精简形态
- 不改 Sync / Connections / Swap / Vault 页面内部布局与文案
- 不新增任何写接口、不改任何既有接口的响应结构
- 不删除任何路由
