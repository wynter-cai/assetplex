# spec: memory-visible（记忆成为可见、可管理的资产类别）

> capability：资产中心新增「记忆」类别的盘点、查看、新建、编辑、同步与体检
> 关联：proposal G1/G2/G3/G4/G5/G6、D1/D2/D3/D4/D6/D7/D8
> 消费者：侧栏、首页资产快照、资产库全部与类别页、资产编辑面板、同步目标选择、资产医生
> 变更沿革：原名 `memory-command-visible`，命令相关场景随 D3 整体移除。

## 为什么需要这份 spec

「记忆」这类资产在同步链路里已经能搬（WorkBuddy 记忆软链、切换包已含记忆），但资产中心的类别声明源里没有它，用户在界面上看不见、点不到、也管不了。本 spec 定义它成为**一等类别**之后，用户能看到的全部行为。

界面上必须与既有类别保持同一套交互：同一套卡片、同一套编辑面板、同一套同步对话框、同一套空态与失败态。**不新增专用视图**。

## 术语（沿用阶段 0 词表 + 本 spec 新增）

| 词 | 含义 |
|---|---|
| 记忆 `memory` | `memory/` 目录下的记忆文件；语义为「跨会话保留的事实与决定」 |
| 旧目录 `preferences/` | 历史兜底目录；内容在「记忆」类别下一并列出，不单独成为类别 |
| 命令 `command` | **不是资产**：Claude Code 专属的 slash command 模板，其他工具无等价机制（见 D3）。界面任何位置都不出现该类别 |

## 类别声明（新增一条）

| code | label | hubDir | 兼容目录 | external | syncable | doctorSupported | order |
|---|---|---|---|---|---|---|---|
| `memory` | 记忆 | `memory` | `preferences` | false | true | true | 55 |

既有六条（identity 10 / skill 20 / rule 30 / mcp 40 / agent 50 / criteria 60）的 label、description、order 一律不动。声明源合计 7 条。

## Scenario 1 — 侧栏与首页出现「记忆」

- **Given** 服务已启动，我的库中 `memory/` 下有 2 个文件、`preferences/` 下有 1 个历史文件
- **When** 打开任意页面
- **Then** 侧栏「资产库」子项依次为 身份、技能、规则、MCP、智能体、记忆、裁决准则
- **And** 首页资产快照出现「记忆 3」，数字带口径名「我的库」
- **And** 未修改任何前端类别清单文件即可生效

## Scenario 2 — 类别页可查看、可筛选、可搜索

- **Given** 我的库中记忆 3 项（含 1 项来自旧目录）
- **When** 点击侧栏「记忆」
- **Then** 页头 H1 为「记忆」，副标题取声明源 `description`，列表显示 3 张卡片
- **And** 在「全部资产」页用类别筛选选「记忆」，列表同样 3 项，且计数同步变化
- **And** 在搜索框输入某个记忆文件名的一部分，能筛出对应卡片

## Scenario 3 — 空态给唯一出口

- **Given** `memory/` 与 `preferences/` 都不存在或为空
- **When** 打开「记忆」类别页
- **Then** 空态文案说明「我的库里还没有记忆」
- **And** 提供唯一主动作「从已安装的工具收藏记忆」，点击进入收藏向导
- **And** 不显示「共 0 项」之类的假计数

## Scenario 4 — 新建与编辑

- **Given** 在「记忆」类别页
- **When** 点击「新建」，填写名称 `team-decisions` 与正文后保存
- **Then** 我的库中生成 `memory/team-decisions.md`，列表立即出现该项（不写 `preferences/`）
- **And** 打开该卡片可查看正文，切换到编辑后保存，磁盘文件内容同步更新
- **And** 名称与已有记忆重名（大小写不敏感）时拒绝保存并提示重名，磁盘不留半成品文件

## Scenario 5 — 旧目录内容仍可见

- **Given** 我的库中 `preferences/` 下存在历史文件 `session_memory.md`
- **When** 打开「记忆」类别页
- **Then** 该文件以卡片形式出现在列表中，并标注来源为旧目录
- **And** 该文件的 id 仍保留 `preferences/` 前缀（不做搬家）
- **And** 在侧栏、类别筛选、首页快照中都不存在「偏好」这一类别

## Scenario 6 — 同步能力如实呈现

- **Given** 我的库有 3 个记忆文件，WorkBuddy 已安装并启用，其记忆目录为空；TRAE 中国版已安装并启用
- **When** 在同步页选中 WorkBuddy 并执行同步
- **Then** WorkBuddy 记忆目录出现这 3 个文件的链接或副本
- **And** 该工具的记忆计数显示 3，且标注为「已同步」
- **And** 再次执行同步不产生重复文件
- **And** 若某个工具不支持记忆类别，其一行显示具体原因并禁用选择，不静默跳过

## Scenario 7 — 体检覆盖记忆

- **Given** 我的库中有 1 个超过 8000 字的记忆文件
- **When** 对该类别运行资产医生
- **Then** 记忆类别能出报告并指出体积过大
- **And** 报告只给建议，不在未确认时改写任何文件

## Scenario 8 — 命令在任何资产位置都不出现

- **Given** Claude Code 已安装，其 `commands/` 下有 `review-diff.md`；我的库 `commands/` 下也有历史文件
- **When** 打开侧栏、首页快照、资产库全部页、类别筛选、收藏向导、切换页
- **Then** 任何位置都不出现「命令」这一类别，也不出现 `commands/` 下的文件条目
- **And** `GET /api/asset-categories` 不返回 `command`
- **And** 切换页仍为六类，未因本变更扩张

## Scenario 9 — 不回归

- **Given** 阶段 0 已完成
- **When** 本变更上线后打开首页、资产库、连接、同步、切换、设置
- **Then** 既有六类的数字与文案口径不变（我的库 / 本机环境 / 可收藏 / 已同步）
- **And** 侧栏以外的导航层级、页头样式、卡片样式无变化

## 验收口径

- 声明源单测：新增一条的字段与前端 fallback 逐字段一致（含 `legacyHubDirs`）；总数为 7；
- `GET /api/assets?category=memory` 返回条目数与 `memory/` + `preferences/` 内可展示文件数一致；
- 前端测试覆盖 Scenario 1/3/8 的可见文案与负向断言；
- 浏览器回环：在维护者真实数据下逐条走查 Scenario 1–9，截图留档（不入库）。
