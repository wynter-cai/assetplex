# mcp-entry.spec.md：MCP 第二入口（只读取用 + 两段式写入）

> capability: `assetplex mcp` 本地 stdio 服务、只读工具、两段式写入、引导语分发、隐私与失败边界
> 变更: add-asset-governance | 决策依据: proposal.md D5/D6/D10
> 旅程: B 顺手维护 / C 自动取用

## 定义

- **MCP 服务**：`assetplex mcp` 启动的 stdio 服务，进程内直接使用 core 能力读取/写入同一个 `~/.assetplex` Hub。
- **只读工具**：不修改任何文件，可随时调用。
- **两段式写入**：`propose` 产出草案与预览（零写库）并返回 `pendingChangeId`；`commit` 凭 id 落盘。
- **引导语**：由 sync 注入宿主配置（AGENTS.md / CLAUDE.md 等）的一段文字，指示 Agent 开工前先取身份与规则。

## 工具清单（一期）

| 工具 | 类型 | 用途 |
|------|------|------|
| `assetplex_identity_get` | 只读 | 取当前身份正文 + 来源路径 + 版本哈希（旅程 C 的入口） |
| `assetplex_assets_list` | 只读 | 按类别列出库内资产（名称、路径、健康状态、分发状态） |
| `assetplex_asset_get` | 只读 | 读取单个资产正文（超出上限时标注截断） |
| `assetplex_health_get` | 只读 | 取健康分摘要（总分 + 四维 + 前三条问题），不触发模型 |
| `assetplex_asset_diagnose` | 只读 | 对单个资产跑医生诊断（机械项恒跑；语义项仅显式传 `useAi=true` 时才调用模型） |
| `assetplex_asset_propose` | 写入-草案 | 产出新增/修改草案与 diff 预览，零写库，返回 `pendingChangeId`（TTL 10 分钟） |
| `assetplex_asset_commit` | 写入-落盘 | 凭 `pendingChangeId` 写库（写前备份），可选分发到指定工具 |

## Scenario 1：新会话自动取用（旅程 C）

- **Given** 用户在 TRAE/Claude Code 中已配置 `assetplex mcp`
- **When** 新会话开始，用户提出一个普通编码任务
- **Then** Agent 可调用 `assetplex_identity_get` 拿到当前身份与硬约束，并在回答中体现这些约束
- **And** 调用失败时不阻断任务，工具返回结构化错误（`{ error, hint }`），Agent 可继续

## Scenario 2：一行配置接入

- **Given** 用户已安装 AssetPlex CLI
- **When** 用户按文档在宿主配置中加一行（`command: assetplex`, `args: ["mcp"]`）
- **Then** 服务启动成功，宿主列出上述 7 个工具
- **And** `assetplex mcp` 启动不要求 HUB Web 正在运行，不打开浏览器，不占用端口

## Scenario 3：顺手维护（旅程 B）

- **Given** 用户在 TRAE 里说"把我这条偏好记下来：写文档先给结论"
- **When** Agent 调用 `assetplex_asset_propose`
- **Then** 返回草案：将写入 `rules/<slug>.md` 的完整内容、与现有文件的 diff（新增时说明"新建"）、以及 `pendingChangeId`
- **And** 此时库内文件零变化；用户在宿主对话中确认后，Agent 调用 `commit`
- **And** `commit` 成功后返回 `backupRef`，HUB 刷新即可看到该资产

## Scenario 4：写入的四道闸

- **Given** 任一次 `commit` 调用
- **When** 校验
- **Then** ①无 `pendingChangeId` 或 id 不存在 → 拒绝；②超过 10 分钟 → 拒绝并提示重新 propose；③目标路径在 Hub 之外或属于环境条目 → 拒绝；④每次落盘前自动备份，返回 `backupRef`
- **And** 拒绝时返回结构化原因，不产生任何文件变化

## Scenario 5：写入默认不分发

- **Given** 用户只在 TRAE 中要求记下偏好
- **When** `commit` 未传 `distribute`
- **Then** 只写 Hub，不触碰任何工具目录；需要分发时必须在 `commit` 中显式列出目标工具
- **And** 分发结果逐工具回报（written / skipped / failed + 原因）

## Scenario 6：引导语分发

- **Given** 用户执行 `assetplex sync`，且未关闭引导
- **When** 同步写 AGENTS.md / CLAUDE.md
- **Then** 文件中出现一段带固定起止标记的 AssetPlex 引导块，内容为"开工前先调用 assetplex_identity_get 获取当前身份与规则"
- **And** 重复同步只原地更新该块，不重复追加；用户关闭引导后，同步移除该块，不改动文件其他内容

## Scenario 7：只读工具不烧 token

- **Given** AI 端点未配置
- **When** Agent 调用 `assetplex_assets_list` / `assetplex_identity_get` / `assetplex_health_get`
- **Then** 全部正常返回（本地计算），零模型调用
- **And** `assetplex_asset_diagnose` 未传 `useAi=true` 时只返回机械项并标注 `mechanicalOnly`

## Scenario 8：隐私边界

- **Given** Agent 调用任意工具
- **When** 执行
- **Then** 所有读写均在本机 Hub 内完成，工具不发起任何网络请求
- **And** 唯一例外是 `assetplex_asset_diagnose` 且显式传 `useAi=true`：内容发往**用户自配** OpenAI 兼容端点（与 HUB 医生同一配置与缓存），结果回传时标注 `aiUsed=true`

## Scenario 9：与 HUB 强一致

- **Given** MCP 通过 `commit` 写入一个规则
- **When** 用户在 HUB 中刷新
- **Then** 新资产立刻可见、健康分与分发状态按新数据重算，不出现"两个数据源不一致"
- **And** 反向亦然：HUB 中修改资产后，MCP 下一次读取即拿到新内容

## Scenario 10：宿主异常不崩

- **Given** Hub 目录缺失、某资产文件被外部删除、或草稿缓存损坏
- **When** 调用工具
- **Then** 返回结构化错误（错误码 + 人话提示 + 建议动作），MCP 进程保持存活，不影响宿主其他工具
