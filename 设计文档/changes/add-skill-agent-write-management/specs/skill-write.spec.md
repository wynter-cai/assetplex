# Spec: 保险箱技能写管理

> Capability: skill-write
> 变更: add-skill-agent-write-management

## ADDED Requirements

### Requirement: 在保险箱中新建技能

用户可以在资产库技能页新建技能，保存为 Hub 中的 `skills/<name>/SKILL.md`。

#### Scenario: 正常创建
- **Given** 技能列表中不存在名为「周报助手」的技能
- **When** 用户填写名称「周报助手」、描述「生成中文周报」、正文，点击创建
- **Then** Hub 中出现 `skills/周报助手/SKILL.md`，frontmatter 含 name 与 description
- **And** 技能列表立即出现该技能，来源标记为「保险箱」

#### Scenario: 重名拒绝
- **Given** 技能列表中已存在名为「pdf」的技能（任意来源）
- **When** 用户尝试创建名称「PDF」（大小写不同）的技能
- **Then** 系统拒绝并提示「同名技能已存在」

#### Scenario: 非法名称拒绝
- **When** 用户提交名称含 `/ \ : * ? " < > |` 或为空或为 `..`
- **Then** 系统拒绝创建并提示名称不合法

### Requirement: 编辑保险箱技能

#### Scenario: 保存修改
- **Given** 用户在详情面板打开来源为「保险箱」的技能
- **When** 用户点击「编辑」修改 SKILL.md 全文并保存
- **Then** Hub 中该文件内容更新，列表中该技能的更新时间刷新

#### Scenario: 编辑不存在的技能
- **When** 对一个已不存在的技能 ID 发起保存
- **Then** 返回 404，前端提示技能已不存在并刷新列表

### Requirement: 删除保险箱技能

#### Scenario: 删除后列表消失
- **Given** Hub 中存在保险箱技能「周报助手」
- **When** 用户在详情面板点击「删除」并在确认对话框中确认
- **Then** `skills/周报助手/` 目录整体删除，技能列表不再显示（若同名工具副本存在则保留该副本条目）

#### Scenario: 删除确认文案警示影响范围
- **When** 用户点击「删除」
- **Then** 确认对话框明示「将从保险箱及所有已分发工具中删除」

### Requirement: 保险箱技能纳入盘点

#### Scenario: 新建后立即可见并自动分类
- **Given** Hub 为空技能库
- **When** 用户创建技能「代码审查」
- **Then** 技能列表出现该条目（来源=保险箱），职能分类按既有关键词规则自动归类

#### Scenario: 已符号链接时同一技能不重复计数
- **Given** `~/.trae-cn/skills` 已是 `hub/skills` 的符号链接（已同步）
- **When** 查看技能列表
- **Then** 同名技能只出现一条，副本计数不含符号链接产生的假副本

### Requirement: 保险箱技能支持手动分类

#### Scenario: 手动覆盖职能
- **Given** 保险箱技能「周报助手」被自动归为「其他」
- **When** 用户通过既有职能下拉将其调整为「文档写作」
- **Then** 调整持久化，刷新后仍为「文档写作」且显示「已手动分类」

## MODIFIED Requirements

### Requirement: 技能详情面板具备管理能力

#### Scenario: 保险箱技能详情显示管理操作
- **Given** 用户点击来源为「保险箱」的技能卡片打开详情
- **Then** 详情面板提供「编辑」「删除」「同步分发」操作
- **And** 非保险箱来源技能详情不提供「编辑」「删除」（仍只读），但提供「同步分发」

#### Scenario: 同步分发触发既有同步
- **Given** 用户已打开某技能详情
- **When** 用户点击「同步分发」并选择目标工具后确认
- **Then** 系统调用既有同步流程，并展示每个目标工具的成功/失败结果
