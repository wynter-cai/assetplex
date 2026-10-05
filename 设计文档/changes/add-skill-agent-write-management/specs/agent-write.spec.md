# Spec: 保险箱智能体写管理

> Capability: agent-write
> 变更: add-skill-agent-write-management

## ADDED Requirements

### Requirement: 在保险箱中新建智能体

用户可以在资产库智能体页新建智能体，保存为 Hub 中的 `agents/<name>.md`（Claude Code 子代理格式：frontmatter 含 name/description，正文为 system prompt）。

#### Scenario: 正常创建
- **Given** 智能体列表中不存在名为「测试专家」的智能体
- **When** 用户填写名称「测试专家」、描述「负责生成测试用例」、正文提示词，点击创建
- **Then** Hub 中出现 `agents/测试专家.md`，frontmatter 含 name 与 description
- **And** 智能体列表立即出现该条目，来源工具标记为「保险箱」，且带「自建」徽章

#### Scenario: 重名拒绝
- **Given** Hub 中已存在 `agents/测试专家.md`
- **When** 用户尝试创建同名（或仅大小写不同）的智能体
- **Then** 系统拒绝并提示同名已存在

#### Scenario: 非法名称拒绝
- **When** 用户提交名称含文件名非法字符（`/ \ : * ? " < > |`）、为空、为 `.` 或 `..`
- **Then** 系统拒绝创建并提示名称不合法

### Requirement: 编辑保险箱智能体

#### Scenario: 保存修改
- **Given** 用户在详情面板打开来源为「保险箱」的智能体
- **When** 用户点击「编辑」修改整文件内容并保存
- **Then** Hub 中该文件更新，详情与列表随之刷新

#### Scenario: 编辑不存在的智能体
- **When** 对已不存在的智能体 ID 发起保存
- **Then** 返回 404，前端提示并刷新列表

### Requirement: 删除保险箱智能体

#### Scenario: 删除后列表消失
- **Given** Hub 中存在保险箱智能体「测试专家」
- **When** 用户点击「删除」并在确认对话框确认
- **Then** `agents/测试专家.md` 删除，列表不再显示该条目

#### Scenario: 删除确认文案警示影响范围
- **When** 用户点击「删除」
- **Then** 确认对话框明示「将从保险箱及所有已分发工具中删除」

### Requirement: 保险箱智能体纳入盘点

#### Scenario: 新建后立即可见
- **Given** Hub 中 agents 目录为空
- **When** 用户创建智能体「测试专家」
- **Then** 智能体列表立即出现该条目（工具=保险箱、类型=自建子代理、userCreated=true）

#### Scenario: 已符号链接时同一智能体不重复计数
- **Given** `~/.claude/agents` 已是 `hub/agents` 的符号链接
- **When** 查看智能体列表
- **Then** 同名智能体只出现一条（按既有去重规则合并）

#### Scenario: 内置与插件智能体保持只读
- **Given** 列表中存在 TRAE 内置 persona、插件智能体、CodeBuddy 专家
- **When** 打开其详情
- **Then** 不提供「编辑」「删除」，只提供查看（内置 persona 同时不提供分发）

### Requirement: 保险箱智能体支持分发

#### Scenario: 触发分发
- **Given** 用户已打开某保险箱智能体详情
- **When** 用户点击「同步分发」选择目标工具并确认
- **Then** 系统调用既有同步流程（claude-code 适配器已映射 `hub/agents` → `~/.claude/agents`），并展示各工具成功/失败结果
