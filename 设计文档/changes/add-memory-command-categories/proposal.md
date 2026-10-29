# proposal: add-memory-command-categories（阶段 1：记忆与命令进资产中心）

> 级别：S（新增两个资产类别，牵动声明源 / 扫描归类 / 资产接口 / 前端导航与类别页）
> 输入依据：`设计文档/assetplex-asset-taxonomy.md` §三（第二梯队 command、第三梯队 memory）、`设计文档/assetplex-project-diagnosis.md` §九 阶段 1
> 状态：待维护者审核
> 前置：`fix-trust-and-consistency`（阶段 0）已完成——类别声明源、四口径、词表均已落地

## 为什么做（背景）

阶段 0 把「资产类别单一真相」做成了：后端一份声明源（`src/core/asset-categories.ts`），前端从 `GET /api/asset-categories` 派生导航与类别页。现在新增类别是「加一条配置」。

但**记忆与命令这两类资产其实早就在系统里跑，只是看不见**：

| 已有能力 | 现状证据 |
|---|---|
| WorkBuddy 记忆同步 | `src/core/adapters/workbuddy.ts` 已把 Hub `memory/` 软链到 `~/.workbuddy/memory` |
| 切换包含记忆 | `src/core/swap-types.ts` 的 `SwapCategory` 已含 `memory`，切换预览会带走它 |
| 资产医生认命令 | `src/core/types.ts` 的 `DOCTOR_ASSET_KINDS` 已含 `command` |
| Claude Code 命令同步 | `src/core/adapters/claude-code.ts` 已把 Hub `commands/` 软链到 `~/.claude/commands` |
| Hub 目录就绪 | `src/core/hub-files.ts` 的 `HUB_CATEGORIES` 已含 `memory`、`commands`、`preferences` |

问题出在**入口与归类**：声明源没有这两条 → 侧栏、类别页、筛选、首页快照全都看不到；扫描器又把它们塞进 `preference`（Claude 的 `commands/` 被发现成 preference，TRAE 的 `memory/*.md` 也被发现成 preference），于是「记忆和命令」在界面上**不存在**，只在 `preferences/` 这个语义模糊的旧目录里以「偏好」名义偷偷活着。

净效果：用户换工具时最痛的两类资产（记忆、命令）不会丢——因为同步链接在，但用户**不知道自己有**，也无法在资产中心查看、编辑、体检。本变更是把「已能搬」的东西**变成「看得见、管得住」**。

## 目标

| # | 目标 | 用户可见结果 |
|---|---|---|
| G1 | 记忆可管理 | 侧栏与首页出现「记忆」，能看、能新建、能编辑、能同步到支持的工具 |
| G2 | 命令可管理 | 侧栏与首页出现「命令」，同上（支持工具仅 Claude Code，其余工具显式说明） |
| G3 | 归类不说假话 | Claude 的命令不再被发现成「偏好」；TRAE 的会话记忆不再落进 `preferences/` |
| G4 | 旧数据不丢 | 历史 `preferences/` 内容仍可见（并入「记忆」统一呈现），不做破坏性迁移 |
| G5 | 体检覆盖 | 资产医生可对记忆、命令资产出结论 |
| G6 | 扩展不停机 | 新增类别仍然只改声明源一处，前端清单不改（沿用阶段 0 的 Scenario 1） |

## 非目标

- ❌ 不新增 `preference` 类别（旧目录名不是用户概念，见 D2）
- ❌ 不改切换包六类构成（`command` 不进切换包，见 D3）
- ❌ 不做 legacy 路由下线（`/tools`、`/identity`、`/skills`、`/rules`、`/mcp`、`/legacy/dashboard`）——独立变更，见拍板点 C
- ❌ 不做类别模板、保存时校验、健康报告（阶段 2）
- ❌ 不改适配器接口签名、不改同步执行链路
- ❌ 智能体可写不在此变更内：`add-skill-agent-write-management` 已落地（`src/core/agent-write.ts` + `/api/agents` 增删改 + 前端新建/编辑对话框），本变更只在验收清单里复核一次

## 关键决策

- **D1 两条新类别，order 插空不重排**：`memory`（记忆，55）、`command`（命令，58），`criteria` 保持 60。理由：阶段 0 的单测逐个比对 label/description/order，改动既有值会连带改测试与前端 fallback；插空可让「裁决准则」继续排在末位（元资产语义），新增两类紧随智能体之后。
- **D2 `preference` 不作为类别暴露，并入「记忆」**：`hubDir` 定为 `memory`，并声明兼容目录 `preferences`（该目录内容在「记忆」页一并列出，卡片上标注「旧目录」）。理由：`preference` 是历史兜底类型，不是用户能理解的概念；把它做成第三类会让「记忆 / 偏好」边界说不清。禁止做破坏性目录迁移（可能已被工具软链占用）。
- **D3 命令不进切换包**：`SwapCategory` 维持六类。理由：命令只有 Claude Code 支持，切换包是「换工具一次性带走」的强承诺，把单工具类别塞进去会产生大量「不支持」噪声。记忆已在六类内，不受影响。
- **D4 两类都走 `/api/assets` 通道**（`external: false`）：无专用接口，直接复用既有列表 / 详情 / 新建 / 编辑 / 同步对话框。理由：两类的结构就是「一个目录 + Markdown 文件」，与规则同类，不需要专用视图。
- **D5 扫描归类纠正，`preference` 降为适配器内部兜底**：`DiscoveredCategory` 联合类型增加 `command`；Claude 的 `commands/` 发现项归 `command`；TRAE 的 `memory/*.md`（非 `user_profile.md`）归 `memory`；`preference` 仍存在于 `HubItemType`（适配器内部 import 兜底），但不再出现在发现列表与资产中心。
- **D6 同步能力和工具差异如实呈现**：`memory` 支持 WorkBuddy（软链目录）与 TRAE（`memory/user_profile.md` 是身份，其余记忆文件走身份反向导入，不在本变更扩张）；`command` 仅 Claude Code 支持。不支持的工具在资产详情与同步/切换处显示「该工具不支持命令」这类原因，不静默跳过。
- **D7 体检覆盖补齐**：`DOCTOR_ASSET_KINDS` 增加 `memory`（`command` 已有）。
- **D8 术语沿用阶段 0 词表**：中文名固定「记忆」「命令」；用户可见文案不出现「偏好」「偏好文件」。

## 影响面

- `src/core/`：`asset-categories.ts`（+2 条声明、兼容目录字段）、`types.ts`（`DiscoveredCategory` +`command`、`DOCTOR_ASSET_KINDS` +`memory`）、`assets.ts`（`AssetCategory` 与目录映射 +2）、`overview.ts`（`FrontendCategory` +`command`）、`adapters/claude-code.ts` 与 `trae-cn.ts`（发现归类）
- `src/server/`：`GET /api/assets?category=` 的合法集来自 `ASSET_CATEGORIES`，自动跟随；无需新增路由
- `web/`：`config/asset-categories.ts`（fallback +2 + 图标）、`AssetEditor` 新建时的类别选项、资产医生入口
- 文档：taxonomy 第二/第三梯队状态列更新
- 不动：同步引擎执行路径、切换执行链路、导入向导流程、适配器接口

## 回滚

- revert 前端 commit：侧栏少两项，接口仍返回两类（无害）
- revert 声明源 commit：两类从界面消失，`preferences/` 旧文件回到不可见状态；已收藏进 `memory/`、`commands/` 的文件仍在磁盘上，不丢
- 唯一不可自动回滚的是**扫描归类纠正后新收藏的文件落在 `memory/`、`commands/`**（旧行为落 `preferences/`）：两个目录都是 Hub 里的普通目录，手工移动即可，不影响同步

## 待维护者拍板

- **A 命令是否进切换包**：建议不进（D3）。若希望「换工具时连命令一起带走」，需同时给非 Claude 工具补命令适配（工作量大，建议单独立项）。
- **B `preferences/` 的最终归宿**：本变更只做「一并展示」，不做迁移。是否要在阶段 2 做一次显式迁移（把内容搬到 `memory/` 并保留软链）？
- **C legacy 路由下线时机**：诊断文档里阶段 1 与阶段 4 都提过。建议本变更不解，作为独立小变更 `retire-legacy-routes` 排在 P2-C 之后，避免与类别导航改动互相干扰。
