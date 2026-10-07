# AssetPlex 前端与用户体验审计报告

> **文档性质**：UX/前端全面体检结论（战略级参考文档）
> **审计日期**：2026-10-07
> **审计方式**：设计令牌/组件源码走查 + 运行态实测（http://127.0.0.1:17521 真实数据）
> **实测环境**：视口 718×406 @ DPR 1.25；数据基线：技能全集 442（我的库 31）、工具连接 5、保险箱文件 186
> **后续文档**：改进路线图见 [assetplex-ui-ux-roadmap.md](./assetplex-ui-ux-roadmap.md)；P0 变更规格见 `changes/fix-ui-trust-gaps/`

---

## 0. 总评

**功能完成度 ≈ 75%，体验完成度 ≈ 45%。**

能力配得上"保险箱"，界面还像"调试台"。同步中心（选目标→预览变更→预警→执行→结果卡）证明团队具备做出优秀交互的能力，它应成为其他页面改版的基准模板，而不是例外。

按开源标准"陌生用户开箱即用"审视，当前 UI 会在用户信任建立之前漏光。

| 维度 | 评分 | 一句话结论 |
|---|---|---|
| 信息架构 | ★★☆☆☆ | 三级导航两级重复，术语 4 个词混用 |
| 视觉系统 | ★★☆☆☆ | 两套主色、无字体体系、10px 中文、阴影层级缺失 |
| 交互反馈 | ★★☆☆☆ | 19 处 alert、3 个死控件、无 toast |
| 用户旅程 | ★★☆☆☆ | 新客老客误判、死链回首页、建设中页暴露 |
| 可访问性 | ★★☆☆☆ | 焦点不可见、语义色对比度不达 AA |
| 响应式 | ★☆☆☆☆ | 基本只适配 1280+ 宽屏 |
| 底层功能 | ★★★★☆ | 同步/导入冲突/筛选模型设计扎实 |

---

## 1. P0 问题清单（止血：信任伤害与死路）

### P0-1 老用户每次打开都看到"欢迎使用"新客页 ⚠️ 最致命

- **现象**：API 返回 `hubInitialized=false`，但同一响应中 `assetStats={identity:1, skill:181, rule:3, mcp:1}`、connections=5。
- **前端**：`web/src/pages/Home.tsx:62` 用 `hubInitialized` gate 掉资产快照/连接/快捷动作/活动四个区块；`HomeHero.tsx:11` 未初始化态显示"欢迎使用/开始盘点"。
- **后端根因**：`src/core/overview.ts:77`
  `hubInitialized = health.hubExists && health.hubTomlExists && totalAssets > 0`
  实测环境保险箱目录与 186 个资产文件都在，但 `hub.toml` 缺失（`checkHubHealth` 只判存在性，见 `src/core/hub-files.ts:229-246`）→ 整个判定为 false。
- **矛盾放大**：未初始化态同时显示"健康度 100"（`healthScore` 由 totalAssets 独立算出，不受 toml 影响）。
- **用户影响**：资产越用越多，首页越用越空；用户无法理解"我的东西去哪了"。

### P0-2 连接页三个"死控件"（比没有更糟）

后端端点**早已存在**（`src/server/routes/tools.ts`：`POST /:name/toggle` 行 43、`POST /:name/detect` 行 63；前端 api 客户端 `toggleTool/detectTool` 也已写好，`web/src/lib/api.ts:73-80`），纯 UI 没接线：

| 控件 | 位置 | 现状 |
|---|---|---|
| 「启用同步」Switch | `Connections.tsx:91` | 无 `onCheckedChange`，拨动无反应 |
| 「重新检测」按钮 | `Connections.tsx:93` | 无 `onClick` |
| 「扫描新工具」按钮 | `Connections.tsx:244` | 无 `onClick`（无独立端点，语义=重新拉取 GET /tools 即可，该接口内部重新 detect） |

附带断裂：
- 「导入到 Hub」是 `<a href="/import">`（`Connections.tsx:173`），整页刷新绕过 SPA。
- 首页连接卡跳转带 `?tool=xxx`（`ConnectionCard.tsx:79`），连接页不读该参数，跨页定位失效。

### P0-3 死链 + "建设中"页面暴露在主导航

- 首页「最近活动 → 查看全部」指向 `/activity`（`RecentActivity.tsx:49`），真实路由是 `/activities`（`App.tsx:28`），通配符规则把死链重定向**回首页**，表现为"点一下应用闪退"。
- 侧栏「活动」（`Sidebar.tsx:32`）→ `Placeholder.tsx:16` 正文 `🚧 建设中 · Phase 1`，开发 sprint 黑话直接暴露；后端 `getRecentActivities()` 永久返回 `[]`（`overview.ts:168-170`），无活动数据源。

### P0-4 全应用无操作反馈系统

- **19 处原生 `alert()`**（11 个文件，技能模块 14 处：SkillsView 4、use-ai-classify 3、AiConfigDialog 2、SkillDetail 2、SkillCard/SkillCreateDialog/SkillDialogs 各 1；agents 3；projects/settings 各 1）。阻塞页面、文案不可复制、样式与产品割裂、无法堆叠。
- 设置页保存成功/失败均无反馈（`Settings.tsx:28-34` 只有 invalidate）。
- 加载失败直接向用户甩原始异常：`加载失败: {error.message}`（SkillsView/Vault/Projects 同款）。
- 技能卡行内「职能分类」select 即时生效，无 loading/无成功反馈/无撤销（`SkillCard.tsx:30-42`）。
- **有利条件**：`@radix-ui/react-toast` 与 `zustand` 已在 web 依赖中，建 toast 系统零新依赖。

### P0-5 资产快照与类别扩展脱节

- 类别已扩到 5 个（`asset-categories.ts` 含 agent），首页快照仍写死 `grid-cols-4`（`AssetSnapshot.tsx:24`），骨架屏同样写死 4 格（`Home.tsx:103`）。
- 后端 `overview.ts` 的 `FrontendCategory` 只有 4 类（行 15），`CATEGORY_MAP`（行 18-23）丢弃了 `HUB_CATEGORIES` 中已有的 `'agents'`（`hub-files.ts:51`）→ 智能体计数永远缺失。
- 违反 AGENTS.md "导航/类型/扫描不能写死 4 个类别，必须动态扩展" 的明确约束。

### P0-6 品牌门面小破绽（X 级，顺手修）

- favicon 仍是 Vite 默认 `vite.svg`（`web/index.html:5`）。
- 页面标题是开发名 `AssetPlex Web UI`（`web/index.html:7`）。

---

## 2. P1 问题清单（体验骨架：设计系统与信息架构）

### P1-1 品牌色精神分裂：近黑 + 靛蓝两套主色

实测取色：

| 元素 | 实际颜色 | 来源 |
|---|---|---|
| 主按钮/选中导航/分段控件 | `#0F172A` slate-900 近黑 | `--primary: 222.2 47.4% 11.2%`（shadcn 默认未改，`index.css:13`） |
| 欢迎页 CTA、快速动作主按钮 | `#4F46E5` indigo-600 | `HomeHero.tsx:23`、`QuickActions.tsx:38` 硬编码 |
| 健康度数字/图标 | indigo-500/600 | 硬编码 |
| Logo 图标 | 近黑 | `text-primary` |

语义色（green/amber/red/blue/purple）以 Tailwind 原色散落 8+ 组件，未进令牌；badge 扩展变体 `success: green-500 / warning: yellow-500`（`badge.tsx:16-17`）为饱和原色。

### P1-2 没有字体系统

- 无 font-family 定义、无中文栈、无数字等宽设定；实测回退 Segoe UI/雅黑。
- 实测 9 档字号无 type scale：10/11/12/13/14/16/18/24/30px。
- 徽章实测 **10px 中文**（SkillCard 三枚 badge，16px 高）；中文正文可读性下限建议 12px。
- 页面标题不统一：同步中心/项目 24px，设置/占位页 30px；资产库各页**无 H1**（实测 `main h1 = NONE`），只能靠侧栏高亮判断位置。
- 技能描述 12px/16px 行高（1.33），中文偏挤。

### P1-3 Markdown 排版层级坍塌

`Markdown.tsx:26-30`：h1 与 h2 同为 14px semibold，h3/h4 13px，正文 13px。实测真实技能文档 H2 标题与文档标题视觉同权。技能详情是高频阅读场景，等于没有排版。

### P1-4 三级导航两级重复，内容区被挤到 95px

全局侧栏 240px 内含"资产库 → 5 类别"子菜单（`Sidebar.tsx:90-114`）；资产库内部又一道 192px 左栏（`Vault.tsx:156`），内容完全相同。实测 718px 视口：点开技能详情后主从两栏硬挤，卡片被压到 **95px**（无抽屉/overlay 兜底）；1366 宽屏留给资产的空间也不到 62%。

### P1-5 响应式骨架缺失

侧栏固定 `w-60 shrink-0`（无折叠/汉堡菜单）、Vault 内栏固定 192、连接页固定 224 且用 `-mx-4 -mt-4` 负 margin 出血（`Connections.tsx:198`）。<1024px 无布局降级。

### P1-6 术语词汇表缺失

| 概念 | 界面实际叫法 |
|---|---|
| 自建资产 | 分组「自建」、徽章「项目 · Super Powers」（同一 provenance 轴两个名字） |
| 库内资产 | 我的库 / 保险箱 / Hub / AssetPlex |
| 入库动作 | 收藏 / 沉淀到保险箱 / 导入 |
| 分发 | 同步 / 分发同步 / 已同步 |
| 设置标题 | 「Hub 设置」+ 副标题「编辑 hub.toml 配置」（实现文件甩给用户） |

### P1-7 卡片信息过载，徽章全灰无色彩编码

技能卡最多 5 枚 10px 徽章（版本/副本/职能/出处/分类来源），全灰 outline/secondary；卡片整体可点开，右下角还有同功能「查看详情」按钮（`SkillCard.tsx:112-123`）。三个正交分类轴全压进卡片，无视觉重点。

---

## 3. P2 问题清单（打磨、可访问性、语义正确性）

- **P2-1 可访问性**：技能卡 `div role=button tabIndex=0` 无 `:focus-visible`（实测 outline none，键盘焦点不可见）；无 skip-link；`<nav>` 无 aria-label；语义色对比度不达 WCAG AA（白字 4.5:1）：green-500≈2.3:1、yellow-500≈2.2:1、red-500≈3.4:1，且多用于 10px 小字。
- **P2-2 暗色模式半成品**：`.dark` 令牌与大量 `dark:` 类存在，但全仓 0 处主题切换入口。
- **P2-3 导入向导噪声**：228 个发现文件含 `.arkcli-managed-skills.json` 等隐藏配置均列为"技能"，无状态折叠/筛选；二进制图片冲突（`_icon.png`）也显示"智能合并：追加新内容"——图片无追加语义（文案照搬，`Import.tsx` 冲突页）。
- **P2-4 连接页数据语义不实**：「已同步资产」实际统计 Hub 内类别总数（代码注释自承"分发状态待实现"，`Connections.tsx:111`），非该工具真实分发状态。
- **P2-5 视觉层级缺失**：全站 1px 边框、零 elevation，卡片/面板/对话框同平面。
- **P2-6 健康度黑盒**：0-100 分无构成解释、无 tooltip、无下钻，且与未初始化态矛盾（P0-1）。
- **P2-7 快照数字口径不一致**：首页 assetStats 用保险箱目录**文件递归计数**（技能 181，含 references 附件），技能页口径是去重后技能数（我的库 31/全集 442），两处数字用户对不上。
- **P2-8 原生控件混搭**：原生 checkbox/select 与 shadcn 控件并存；错误态红字直接用 `text-red-500/text-red-400` 非令牌色。
- **P2-9 职能九分类非 MECE**：browser（渠道）、workflow（模式）、ai-integration（技术）与领域轴混杂（维护者已定方向，单独议题，不在本路线图内实施）。

---

## 4. 用户旅程体检

| 旅程 | 现状 | 主要卡点 |
|---|---|---|
| ① 首次使用 | 欢迎页→导入向导 4 步 | 文件噪声、二进制合并文案错误；走完首页依旧"欢迎"（P0-1） |
| ② 日常回来 | 期望指挥中心 | 186 资产仍被 gate 成空首页；健康度看不懂 |
| ③ 盘点整理 | 双维度+正交筛选+AI 分类 | 概念轴多、徽章 5 连发、行内修改无反馈、术语对不上 |
| ④ 沉淀收藏 | 详情/批量可收藏 | 收藏/沉淀/我的库/保险箱四个词；批量结果 alert 长文 |
| ⑤ 分发同步 | **全应用最佳页面** | 仅文案密度偏高——作为改版基准 |
| ⑥ 连接管理 | 想看/想控工具 | 开关/检测/扫描全死（P0-2）；同步信息假（P2-4） |
| ⑦ 追溯历史 | 导航有入口 | 建设中占位 + 死链（P0-3） |

---

## 5. 边界与不做事项

- 本审计只产出问题与改进方向，不含视觉稿；具体 token 取值在 P1 变更 spec 中评审确定。
- 不同时做暗色模式翻新；P1 只决定"保留并补切换入口"或"暂时摘除"，不重设计暗色。
- 职能九分类 MECE 重构（P2-9）是独立产品议题，不搭车。
- P0 不改 assetStats 计数口径（P2-7），只补 agent 缺类，避免范围蔓延。
