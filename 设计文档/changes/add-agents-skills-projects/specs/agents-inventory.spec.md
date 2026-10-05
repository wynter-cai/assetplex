# Capability: 智能体只读盘点（Agents Inventory）

> 能力代码: agents-inventory
> 对应 API: [../api-contract.ts](../api-contract.ts)（A 部分）
> 状态: 待审核

## 目的

把散落在 TRAE、CodeBuddy、Claude Code、Codex 中的子智能体在资产库中统一可见。第一版**只读盘点**，不做导入、分发、编辑。

## 统一模型

每个智能体抽象为最小公共字段：名称、描述、来源工具（tool）、类型（kind）、定义路径、修改时间、是否用户自建。工具专属字段放入 `extra`，不强制对齐。

类型（kind）四类：
- `custom-sub-agent`：用户自建子代理（Claude `agents/*.md`、Codex `config.toml` 内嵌）
- `expert`：CodeBuddy Expert
- `builtin-persona`：TRAE 内置 persona（hebe、iris、thetis、deidamia、iphigenia 等）
- `plugin-agent`：插件包内智能体

---

## Scenario: 在资产库看到「智能体」类别入口

- **Given** 用户已打开 AssetPlex
- **When** 用户展开侧边栏「资产库」
- **Then** 类别列表中出现「智能体」，位置排在 MCP 之后
- **And** 该类别旁显示当前盘点到的智能体总数

## Scenario: 查看全部智能体列表

- **Given** 机器上存在 TRAE 内置 persona、插件以及 CodeBuddy 配置
- **When** 用户点击「智能体」类别
- **Then** 列表展示所有已发现智能体，每张卡片显示名称、描述、来源工具图标、类型标签、是否自建
- **And** 列表顶部显示按类型和按工具的计数摘要
- **And** 列表按"用户自建优先、其次按名称"排序

## Scenario: 盘点 TRAE 内置 persona

- **Given** `~/.trae-cn/builtin/` 存在且 `manifests/solo.json` 描述了 code/work/design 各 agent_type 下的模型 persona
- **When** 系统扫描智能体
- **Then** 每个被引用的 persona（如 hebe、iris、thetis）产生一个 `builtin-persona` 条目
- **And** 条目的 `userCreated` 为 false
- **And** `sourcePath` 指向对应 persona 的技能目录（如 `builtin/work/hebe`）

## Scenario: 盘点用户自建子代理

- **Given** Claude Code 配置目录存在 `agents/*.md`（含 name/description frontmatter）
- **When** 系统扫描智能体
- **Then** 每个 `.md` 产生一个 `custom-sub-agent` 条目，名称与描述取自 frontmatter
- **And** 条目的 `userCreated` 为 true
- **And** Codex `config.toml` 中内嵌的 agents 同样被解析为 `custom-sub-agent`

## Scenario: 盘点 CodeBuddy Expert

- **Given** `~/.codebuddy/expert-history.json` 存在且含 sessions 数据
- **When** 系统扫描智能体
- **Then** 每个有名称的 expert session 产生一个 `expert` 条目
- **And** 当 sessions 为空对象时，不产生条目，也不报错

## Scenario: 盘点插件包内智能体

- **Given** `~/.trae-cn/plugins/<plugin>/<version>/` 含插件描述与技能/agent
- **When** 系统扫描智能体
- **Then** 携带独立 agent 定义的插件产生 `plugin-agent` 条目
- **And** `sourcePath` 指向插件版本目录，`extra` 中记录插件名与版本

## Scenario: 按类型或来源筛选

- **Given** 智能体列表已加载
- **When** 用户选择类型筛选「内置 persona」或工具筛选「TRAE」
- **Then** 列表仅显示匹配条目
- **And** 计数摘要与筛选条件同步

## Scenario: 查看单个智能体详情

- **Given** 用户在列表中选中某个智能体
- **When** 详情面板打开
- **Then** 展示名称、描述、类型、来源工具、定义文件绝对路径、修改时间、是否自建及 extra 字段
- **And** 展示该智能体的原始定义内容（Markdown/TOML/JSON 文本）
- **And** 不出现编辑、保存、分发等写操作入口

## Scenario: 来源目录缺失时优雅降级

- **Given** 某工具配置目录或 builtin/manifests 不存在
- **When** 系统扫描智能体
- **Then** 该来源返回零条目，不抛出错误，其余来源正常展示
- **And** API 仍返回 200 与完整聚合结构

## Scenario: 只读约束

- **Given** 智能体能力已上线
- **When** 客户端尝试对智能体调用创建、更新或删除接口
- **Then** 服务端不提供这些路由（404），且扫描过程不修改任何源文件
