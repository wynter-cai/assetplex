# proposal: add-memory-category（阶段 1：记忆进资产中心）

> 级别：S（新增一个资产类别，牵动声明源 / 扫描归类 / 资产接口 / 前端导航与类别页）
> 输入依据：`设计文档/assetplex-asset-taxonomy.md` §三（第三梯队 memory）、`设计文档/assetplex-project-diagnosis.md` §九 阶段 1
> 状态：维护者已审核通过（2026-10-29），实施中
> 前置：`fix-trust-and-consistency`（阶段 0）已完成——类别声明源、四口径、词表均已落地
> 变更沿革：本变更原名 `add-memory-command-categories`（记忆 + 命令两类）。维护者复核后判定「命令作为资产意义不大」——Claude Code 的 slash command 在其他工具里没有等价机制，单工具专属目录不构成「换工具能带走」的资产，故本变更收缩为**只做记忆**，命令整项退出（见 D3）。

## 为什么做（背景）

阶段 0 把「资产类别单一真相」做成了：后端一份声明源（`src/core/asset-categories.ts`），前端从 `GET /api/asset-categories` 派生导航与类别页。现在新增类别是「加一条配置」。

但**记忆这类资产其实早就在系统里跑，只是看不见**：

| 已有能力 | 现状证据 |
|---|---|
| WorkBuddy 记忆同步 | `src/core/adapters/workbuddy.ts` 已把 Hub `memory/` 软链到 `~/.workbuddy/memory` |
| 切换包含记忆 | `src/core/swap-types.ts` 的 `SwapCategory` 已含 `memory`，切换预览会带走它 |
| Hub 目录就绪 | `src/core/hub-files.ts` 的 `HUB_CATEGORIES` 已含 `memory`、`preferences` |
| TRAE 记忆文件 | `src/core/adapters/trae-cn.ts` 能扫 `memory/*.md`，但归类落进了 `preference` |

问题出在**入口与归类**：声明源没有 `memory` → 侧栏、类别页、筛选、首页快照全都看不到；扫描器又把 TRAE 的 `memory/*.md` 塞进 `preference`，于是「记忆」在界面上**不存在**，只在 `preferences/` 这个语义模糊的旧目录里以「偏好」名义偷偷活着。

净效果：用户换工具时最痛的一类资产（记忆）不会丢——因为同步链接在，但用户**不知道自己有**，也无法在资产中心查看、编辑、体检。本变更是把「已能搬」的东西**变成「看得见、管得住」**。

## 目标

| # | 目标 | 用户可见结果 |
|---|---|---|
| G1 | 记忆可管理 | 侧栏与首页出现「记忆」，能看、能新建、能编辑、能同步到支持的工具 |
| G2 | 归类不说假话 | TRAE 的会话记忆不再落进 `preferences/`；Claude 的 `commands/` 不再被扫成「偏好」 |
| G3 | 旧数据不丢 | 历史 `preferences/` 内容仍可见（并入「记忆」统一呈现），不做破坏性迁移 |
| G4 | 体检覆盖 | 资产医生可对记忆资产出结论 |
| G5 | 扩展不停机 | 新增类别仍然只改声明源一处，前端清单不改（沿用阶段 0 的 Scenario 1） |
| G6 | 不造假的类别 | 只有真正「换工具能带走」的类别才进资产中心；命令不进（见 D3） |

## 非目标

- ❌ 不做 `command`（命令）类别——不声明、不展示、不进切换包、不扫描（见 D3）
- ❌ 不新增 `preference` 类别（旧目录名不是用户概念，见 D2）
- ❌ 不改切换包六类构成（`SwapCategory` 维持不变）
- ❌ 不做 legacy 路由下线（`/tools`、`/identity`、`/skills`、`/rules`、`/mcp`、`/legacy/dashboard`）——独立变更，见拍板点 C
- ❌ 不做类别模板、保存时校验、健康报告（阶段 2）
- ❌ 不改适配器接口签名、不改同步执行链路
- ❌ 不做 `preferences/` → `memory/` 的目录迁移（见拍板点 B）

## 关键决策

- **D1 `memory` 为新类别，order 插空不重排**：`memory`（记忆，55），`criteria` 保持 60。理由：阶段 0 的单测逐个比对 label/description/order，改动既有值会连带改测试与前端 fallback；插空让「裁决准则」继续排在末位（元资产语义），记忆紧随智能体之后。
- **D2 `preference` 不作为类别暴露，并入「记忆」**：`hubDir` 定为 `memory`，并声明兼容目录 `legacyHubDirs: ['preferences']`（该目录内容在「记忆」页一并列出，卡片标注「旧目录」）。理由：`preference` 是历史兜底类型，不是用户能理解的概念；把它做成第二类会让「记忆 / 偏好」边界说不清。禁止做破坏性目录迁移（可能已被工具软链占用）。
- **D3 `command` 整项不做**（2026-10-29 维护者拍板，推翻原方案）：原方案要把命令做成第八类并扩切换包到七类，复核后判定不值。理由三条：① 命令是 Claude Code 的 slash command 模板，TRAE / WorkBuddy / Qoder / Codex 均无等价机制，做进资产中心只能服务一个工具；② 本机实测 10 个候选命令目录（`.claude/commands`、`.codex/prompts`、`.qoder-cn/commands`、`.trae-cn/commands`、`.workbuddy/commands` 等）**全部不存在**，写「支持」就是撒谎；③ 资产中心的核心承诺是「换工具不丢东西」，单工具专属内容违反该承诺。配套动作：`commands/` 目录不再被扫描（原来被误扫成 `preference`），既有 `DOCTOR_ASSET_KINDS` 里的 `command` 保持原样（体检历史能力，不动）。
- **D4 记忆走 `/api/assets` 通道**（`external: false`）：无专用接口，直接复用既有列表 / 详情 / 新建 / 编辑 / 同步对话框。理由：记忆的结构就是「一个目录 + Markdown 文件」，与规则同类，不需要专用视图。
- **D5 扫描归类纠正，`preference` 降为适配器内部兜底**：`DiscoveredCategory` 增加 `agent`、`memory`（并显式保留 `preference` 作内部兜底）；Claude 的 `agents/` 发现项归 `agent`（原被误标 `preference`）；TRAE 的 `memory/*.md`（非 `user_profile.md`）归 `memory` 并落 `memory/`；`preference` 仍存在于 `HubItemType`（适配器 import 兜底），但不再出现在发现列表与资产中心。
- **D6 同步能力如实呈现**：`memory` 支持 WorkBuddy（软链目录）；TRAE 的 `memory/user_profile.md` 是身份，其余记忆文件走身份反向导入，不在本变更扩张。不支持的工具在资产详情与同步处显示原因，不静默跳过。
- **D7 体检覆盖补齐**：`DOCTOR_ASSET_KINDS` 增加 `memory`。
- **D8 术语沿用阶段 0 词表**：中文名固定「记忆」；用户可见文案不出现「偏好」「偏好文件」「命令」类别项。

## 影响面

- `src/core/`：`asset-categories.ts`（+1 条声明、`legacyHubDirs` 字段）、`types.ts`（`DiscoveredCategory` 加 `agent`/`memory`、`DOCTOR_ASSET_KINDS` +`memory`）、`assets.ts`（`AssetCategory` 与目录映射 +`memory`）、`overview.ts`（`FrontendCategory` +`memory`、多目录并入同类别时累加）、`scanner.ts`（按绝对路径去重）、`adapters/claude-code.ts`（`agents/` 归 agent、`commands/` 不扫）与 `trae-cn.ts`（`memory/*.md` 归 memory）
- `src/server/`：`GET /api/assets?category=` 的合法集来自 `ASSET_CATEGORIES`，自动跟随；`POST /api/assets` 的新建落点 `memory/`；无需新增路由
- `web/`：`config/asset-categories.ts`（fallback +1 + 图标 Brain）、资产编辑面板的新建类别选项、资产医生入口
- 文档：taxonomy 第三梯队 memory 状态列更新
- 不动：`SwapCategory` 与切换链路、同步引擎执行路径、导入向导流程、适配器接口

## 回滚

- revert 前端 commit：侧栏少一项，接口仍返回记忆（无害）
- revert 声明源 commit：记忆从界面消失，`preferences/` 旧文件回到不可见状态；已收藏进 `memory/` 的文件仍在磁盘上，不丢
- 唯一不可自动回滚的是**扫描归类纠正后新收藏的文件落在 `memory/`**（旧行为落 `preferences/`）：两个目录都是 Hub 里的普通目录，手工移动即可，不影响同步

## 拍板记录（2026-10-29）

- **A 命令是否进资产中心**：~~进，扩到七类~~ → **改为：不做**。维护者复核后判定「Claude 的 command 当成资产意义不大，其他 agent 工具里也用不了」，本变更收缩为只做记忆。
- **B `preferences/` 的最终归宿**：本变更只做「一并展示」，不做迁移。是否在阶段 2 做一次显式迁移（把内容搬到 `memory/` 并保留软链）留待阶段 2 决定。
- **C legacy 路由下线时机**：本变更不解，作为独立小变更 `retire-legacy-routes` 排在 P2-C 之后，避免与类别导航改动互相干扰。
- **D 记忆与命令的取舍原则**：只有「多工具都有等价机制、换工具能带走」的内容才算资产。该原则写入 taxonomy，后续新类别一律先过这道门槛。

## 实施状态（截至 2026-10-29）

已完成并通过测试（memory 相关，72 文件 / 898 用例中相关 48 条全绿）：

- T1 声明源 + 前端 fallback + 图标（`tests/unit/core/asset-categories.test.ts` 8 条）
- T2 类型扩展（`DiscoveredCategory`、`DOCTOR_ASSET_KINDS`）
- T3 资产接口与目录映射（`tests/unit/core/assets.test.ts` 10 条）
- T4 首页计数（`tests/unit/core/overview.test.ts` 12 条）
- T5/T6 扫描归类（`tests/unit/adapters/claude-code.test.ts` 4 条、`trae-cn.test.ts` 11 条）
- T7 扫描去重（`tests/unit/core/scanner-dedupe.test.ts` 3 条）

待做：前端展示层（文件项类别名去硬编码、记忆空态、同步对话框不支持态）与浏览器回环验收，见 `tasks.md` 组 3/组 4。
