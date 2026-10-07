# Spec: 扫描源补全（Qoder / WorkBuddy / TRAE 约定 agents 目录）

## ADDED Requirements

### Requirement: Qoder 安装检测

系统按候选目录顺序检测 Qoder 安装状态。

#### Scenario: Qoder CN 已安装
- **Given** `~/.qoder-cn` 目录存在且含 argv.json
- **When** 执行 Qoder detect
- **Then** installed=true，configDir 为 `~/.qoder-cn` 绝对路径

#### Scenario: 回退国际版目录
- **Given** `~/.qoder-cn` 不存在、`~/.qoder` 存在且含 mcp.json
- **When** 执行 Qoder detect
- **Then** installed=true，configDir 指向 `~/.qoder`

#### Scenario: 目录存在但无标志文件
- **Given** 候选目录存在但缺 argv.json / mcp.json / settings.json
- **When** 执行 Qoder detect
- **Then** installed=false，configDirExists=true，error 说明缺标志性文件

#### Scenario: 两者均未安装
- **Given** 候选目录都不存在
- **When** 执行 Qoder detect
- **Then** installed=false，configDirExists=false，configDir 为空串

#### Scenario: 同步模块工具状态
- **Given** 本机已装 Qoder CN
- **When** 打开同步模块工具列表
- **Then** Qoder 显示为已安装，不再依赖硬编码特例

### Requirement: WorkBuddy 个人技能扫描

#### Scenario: WorkBuddy 技能进入盘点
- **Given** `~/.workbuddy/skills/<name>/SKILL.md` 存在
- **When** 执行技能盘点
- **Then** 该技能出现，origin=personal（出处投影「自建」）、tool=workbuddy

#### Scenario: 目录缺失不报错
- **Given** `~/.workbuddy/skills` 不存在
- **When** 执行技能盘点
- **Then** 正常返回，贡献零条目

### Requirement: TRAE 约定目录自定义智能体

#### Scenario: 约定目录智能体进入盘点
- **Given** `~/.trae-cn/agents/<name>.md`（frontmatter name/description）存在
- **When** 执行智能体盘点
- **Then** 该智能体出现，tool=trae、kind=custom-subagent、userCreated=true

#### Scenario: 目录缺失不报错
- **Given** `~/.trae-cn/agents` 不存在
- **When** 执行智能体盘点
- **Then** 正常返回，贡献零条目
