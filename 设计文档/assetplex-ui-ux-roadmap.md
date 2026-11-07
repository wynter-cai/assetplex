# AssetPlex UI/UX 改进路线图（P0 → P1 → P2）

> **文档性质**：分阶段推进总纲（每个阶段对应一个独立 change，按 AGENTS.md 的 SDD 流程走）
> **制定日期**：2026-10-07
> **依据**：[assetplex-ui-ux-audit-2026-10-07.md](./assetplex-ui-ux-audit-2026-10-07.md)（问题编号与本文件一一对应）
> **节奏假设**：每周约 1 个工作日（8h）投入；估算单位为"周末天"
> **门禁铁律**：每个 change 必须 spec+tasks 经维护者审核后才写代码；后端/核心前端 TDD；每阶段结束跑验证块（vitest + tsc + vite build + 浏览器回环）

---

## 阶段总览

| 阶段 | change-id | 级别 | 目标 | 粗估 | 前置依赖 |
|---|---|---|---|---|---|
| **P0 止血** | `fix-ui-trust-gaps` | M | 消灭死路、假态、无反馈；让现有功能"看起来能用、点了真有用" | 1.5~2 天 | 无，立即开工（规格已就绪，待审） |
| **P1 立骨** | `refactor-design-system` | M | 品牌色/字体/页头/导航四统一；详情面板不再挤压 | 2~3 天 | P0 完成（toast/错误态是 P1 页面翻新的底座） |
| **P2 打磨** | 3 个独立 S/M change | S/M | a11y+响应式、技能卡减负、向导降噪与数据语义 | 各 1~2 天 | P1 的 token 体系；可按需调换顺序 |

**排序原则**：先修"说谎的界面"（P0），再建"设计的地基"（P1），最后做"精修与扩展"（P2）。P0 不依赖任何视觉决策，可以立刻动工；P1 需要维护者拍板品牌色方向，故排在规格评审之后。

---

## P0：止血波 —— `fix-ui-trust-gaps`（M 级，规格已写，待审即开工）

**目标**：用户打开应用看到真实的自己；每个可点控件都有真实结果；每个操作都有反馈。

| 任务 | 对应问题 | 层 | 验收要点 |
|---|---|---|---|
| T1 overview 初始化判定修复 | P0-1 | 后端 TDD | 目录存在且有资产、仅缺 hub.toml → `hubInitialized=true`；红测先行 |
| T2 overview 补 agent 计数 | P0-5 | 后端 TDD | assetStats 含 agent；类别映射不再丢弃 agents |
| T3 首页真实态 + 快照自适应 | P0-1/P0-5 | 前端 | 有资产即指挥中心；快照 5 类响应式栅格（auto-fit）；骨架屏对齐 |
| T4 连接页死控件接线 | P0-2 | 前端 | Switch→toggle、重新检测→detect、扫描→refetch；SPA 跳转；?tool= 定位 |
| T5 Toast 基础设施 | P0-4 | 前端 | Toaster + useToast（radix-toast+zustand，零新依赖）；组件测试 |
| T6 19 处 alert 替换 + 设置页反馈 | P0-4 | 前端 | 全仓 alert 清零；成功/失败 toast；批量结果结构化展示 |
| T7 导航清理与品牌门面 | P0-3/P0-6 | 前端 | 撤「活动」入口（无数据源）；修 /activity 死链；favicon/title |
| T8 错误态友好化 | P0-4 | 前端 | ErrorState 组件替换裸 error.message（3+ 页面） |
| T9 阶段验收 | — | — | 后端/前端 vitest 全绿、双侧 tsc、tsup/vite build、浏览器 6 场景回环 |

**明确不做**（防止范围蔓延）：新颜色/新字体、导航结构重设计、活动页实现、计数口径变更。

规格目录：`设计文档/changes/fix-ui-trust-gaps/`

---

## P1：立骨波 —— `refactor-design-system`（M 级，启动时补完整 SDD）

**目标**：建立可演进的设计令牌与排版体系；信息架构不再重复；界面在笔记本屏幕上可用。

**需要维护者拍板的决策点（评审会上一次决完）**：
1. **品牌主色**：沿用靛蓝（indigo-600 已有使用惯性，推荐）还是另选；近黑 primary 退役。
2. **暗色模式去留**：补切换入口（成本中）或暂时摘除 dark 代码（成本低，推荐先摘除、开源后按反馈加回）。
3. **导航形态**：Vault 内 192px 类别栏撤销（类别只留侧栏树，推荐）还是侧栏树撤销。

| 任务 | 对应问题 | 验收要点 |
|---|---|---|
| 品牌色令牌收编 | P1-1 | 一套 primary 全站贯通；语义色入令牌并达 AA；硬编码 indigo-* 清零 |
| 字体与字号体系 | P1-2 | 中文栈落定；5 档 type scale（12/13/14/16/20/24）；消灭 10px 中文 |
| 页头统一 | P1-2 | 所有页 H1+副标题+操作区标准结构；资产库页补页头 |
| Markdown 层级恢复 | P1-3 | H1 18/H2 16/H3 14/正文 14；详情阅读测试 |
| 导航去重 + 详情抽屉化 | P1-4/P1-5 | 单一类别导航；<1024px 详情改全屏/抽屉，卡片不再 <200px |
| 术语统一 | P1-6 | 词汇表入 taxonomy 文档；全站文案替换（我的库/收藏/同步 三个词定终身） |
| 技能卡徽章减负（基础版） | P1-7 | 卡面常驻徽章 ≤2 枚，其余进详情；彻底减负（色彩编码）留 P2 |

**预估**：2~3 个周末天。产出 change 目录：`changes/refactor-design-system/`（proposal/api-contract/specs/tasks）。

---

## P2：打磨波（三个独立 change，各自立项，可按反馈插队）

### P2-A `enhance-a11y-responsive`（M）✅ 已完成（2026-11-07）

焦点可见（focus-visible 环）、skip-link、nav aria-label、对比度扫尾、侧栏折叠/汉堡菜单、断点体系（sm/md/lg 抽测）。对应 P2-1、P1-5 残余。

**验收结论**：17 个任务全部勾选（`changes/enhance-a11y-responsive/tasks.md`）。前端 49 文件 376 用例、后端 73 文件 899 用例全绿；`tsc -b` / `tsc --noEmit` 0 错；`vite build` / `tsup` 成功；e2e `a11y-keyboard` 4/4；四档 × 八页走查 216 项全 PASS；1440 对比布局指纹 0 挪位（像素差异仅来自已批准的令牌加深与 reduced-motion 冻结骨架屏）。

**拍板结果**：A 窄屏取抽屉（汉堡 + 遮罩 + 焦点陷阱，零新依赖）；B 对比度只微调 `--muted-foreground` 令牌（L 46.9%→43.5%，组件零覆写）；C 结果数用 `role="status"` 播报。

**遗留提醒**：全局 `:focus-visible` 依赖组件不自带 `focus-visible:outline-none`；新增组件时照 `assetplex-ui-redesign-v2.md` 第十一节写。

### P2-B `refine-skill-cards-wizard`（M）
技能卡完整减负 + 九职能色彩编码（含图例）、行内 select 改确认式操作+撤销 toast；导入向导过滤隐藏文件（`.` 开头）、按冲突/已存在折叠、二进制冲突文案特化。对应 P1-7 残余、P2-3。

### P2-C `add-activity-feed-data-semantics`（S）
真实活动流（接 sync/import/edit 历史存储，占位页转正，主导航恢复入口）；连接页真实分发状态（替换 Hub 总数假数据）；健康度可解释下钻；快照计数口径与盘点统一（P2-4/P2-6/P2-7）。体量大，启动前先做一份小型技术预研。

**暂不排期**：职能九分类 MECE 重构（P2-9，独立产品议题）；视觉 elevation 体系、原生控件统一（P2-5/P2-8）随 P1/P2-A 顺手消化，不单列。

---

## 每阶段统一验收闸（Definition of Done 增补）

1. `node node_modules/vitest/vitest.mjs run`（后端）与 web 下同款命令（前端）全绿；
2. 双侧 `tsc -b` 0 错；`tsup build` + `vite build` 通过；
3. 浏览器对照 spec Scenario 逐条回环（API 用 Invoke-WebRequest 二次核实，浏览器用完即关）；
4. 测试数据清回基线（当前：保险箱文件基线、技能 442/我的库 31）；
5. 每阶段独立提交（docs → spec → backend → frontend 分离），不混 commit；push 决策另行确认。
