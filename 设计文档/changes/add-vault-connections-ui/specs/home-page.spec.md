# Spec: Home Page (首页)

> Capability: home-page
> 对应页面: `/` (首页)

## ADDED Requirements

### R1: 资产快照展示

用户进入首页时，应看到按类别统计的资产数量。

#### Scenario: 用户已有多种资产
**Given** Hub 中存在 1 个身份、3 个技能、5 条规则、2 个 MCP
**When** 用户进入首页
**Then** 页面显示资产快照区域，包含 4 个类别卡片：
  - 👤 身份: 1 个
  - ✨ 技能: 3 个
  - 📖 规则: 5 个
  - 🖥 MCP: 2 个
**And** 每个卡片下方有"查看全部"链接

#### Scenario: Hub 为空（首次使用）
**Given** Hub 中没有任何资产
**When** 用户进入首页
**Then** 不显示资产快照区域
**And** 显示欢迎卡片，包含主按钮"开始盘点你的 AI 资产"

#### Scenario: 点击资产类别跳转
**Given** 用户在首页，且 Hub 中有资产
**When** 用户点击"身份"卡片的数字"1"
**Then** 跳转到资产库页面，且选中"身份"类别

### R2: 连接状态展示

用户进入首页时，应看到所有已安装 AI 工具的连接和同步状态。

#### Scenario: 多个工具不同状态
**Given** 系统已检测到 4 个 AI 工具：TRAE（已同步）、WorkBuddy（待同步）、Claude Code（未连接）、Codex（未安装）
**When** 用户进入首页
**Then** 连接状态区域显示 4 个工具卡片：
  - ✅ TRAE 中国版 - 已同步 · 4 项资产
  - ⚠️ WorkBuddy - 待同步 · 2 项更新
  - ⬜ Claude Code - 未连接
  - ⬜ Codex - 未安装

#### Scenario: 工具待同步时点击进入分发
**Given** WorkBuddy 状态为"待同步"
**When** 用户点击 WorkBuddy 卡片
**Then** 跳转到连接页，自动选中 WorkBuddy 工具
**And** 右侧详情面板滚动到待同步资产列表

### R3: 快速动作

首页应提供 2-3 个最常用操作的快捷入口。

#### Scenario: 标准快速动作
**Given** 用户进入首页
**When** 查看快速动作区域
**Then** 显示 3 个按钮：
  - "导入资产" — 启动入库向导
  - "分发同步" — 跳转到连接页
  - "新建技能" — 跳转到资产库技能类别，打开编辑器

#### Scenario: Hub 为空时快速动作
**Given** Hub 为空（首次使用）
**When** 查看快速动作区域
**Then** 不显示"分发同步"和"新建技能"按钮
**And** 只显示主按钮"开始盘点你的 AI 资产"（启动入库向导）

### R4: 最近活动展示

首页应展示最近 5 条操作记录。

#### Scenario: 有操作历史
**Given** 用户今天做过：导入身份、同步到 WorkBuddy、创建规则
**When** 用户进入首页
**Then** 最近活动区域显示时间线：
  - 今天 14:30 ⬇ 入库 从 TRAE 导入 identity/profile.md（合并）
  - 今天 14:28 ⬆ 分发 同步 3 项资产到 WorkBuddy
  - 今天 10:12 ✏ 编辑 修改 skills/react-expert.md
**And** 底部有"查看全部"链接，点击跳转到活动页

#### Scenario: 无操作历史
**Given** 用户从未做过任何操作
**When** 用户进入首页
**Then** 最近活动区域显示空状态："还没有活动记录，开始导入资产后会显示在这里"

### R5: 数据加载状态

#### Scenario: 页面初次加载
**Given** 用户刚打开应用
**When** 首页正在加载聚合数据
**Then** 各区域显示骨架屏（Skeleton）占位
**And** 不显示加载失败的错误提示（除非真的失败）

#### Scenario: 数据加载失败
**Given** 后端服务不可用
**When** 首页加载失败
**Then** 显示错误提示"无法连接到 AgentHub 服务"
**And** 提供"重试"按钮
