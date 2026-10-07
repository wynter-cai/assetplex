# Spec: overview 初始化状态与首页真实呈现

> Capability: home-overview-state
> Change: fix-ui-trust-gaps（P0-1 / P0-5）
> API 契约：见 `../api-contract.ts` 的 `[MODIFIED] GET /api/hub/overview`

## ADDED Requirements

### Requirement: 保险箱有资产即视为已初始化

系统不得因配置文件 `hub.toml` 缺失，而把已在保险箱目录中存有资产的用户判定为未初始化用户。

#### Scenario: 有资产但 hub.toml 缺失的老用户回到首页

- **Given** 保险箱根目录存在，目录内至少有 1 个资产文件，但 `hub.toml` 不存在
- **When** 前端请求 `GET /api/hub/overview`
- **Then** 响应 `hubInitialized` 为 `true`
- **And** 响应仍包含 assetStats、connections、healthScore 正常字段

#### Scenario: 全新用户（保险箱目录为空）

- **Given** 保险箱根目录不存在，或存在但 5 个类别目录均无资产文件
- **When** 请求 `GET /api/hub/overview`
- **Then** `hubInitialized` 为 `false`
- **And** `assetStats` 5 个键均为 0

#### Scenario: hub.toml 存在且有资产（常规已初始化用户）

- **Given** 保险箱根目录与 hub.toml 都存在且有资产
- **Then** `hubInitialized` 为 `true`（行为与旧逻辑一致，不回归）

### Requirement: 首页指挥中心按真实状态渲染

#### Scenario: 已初始化用户打开首页

- **Given** overview 返回 `hubInitialized=true`
- **When** 用户访问首页 `/`
- **Then** 页面展示欢迎回来区、资产快照、连接状态、快速动作与最近活动区
- **And** 不出现"开始盘点你的 AI 资产"按钮

#### Scenario: 未初始化用户打开首页

- **Given** overview 返回 `hubInitialized=false` 且五类计数全 0
- **Then** 页面展示欢迎卡片与唯一主动作"开始盘点你的 AI 资产"
- **And** 点击该动作进入导入向导 `/import`

### Requirement: 资产快照覆盖全部五个资产类别

#### Scenario: 资产快照展示与资产类别配置一致

- **Given** 前端资产类别配置包含身份、技能、规则、MCP、智能体共 5 类
- **When** 已初始化用户查看首页资产快照
- **Then** 快照区显示 5 个类别格，每格展示 overview.assetStats 中对应类别的数字
- **And** 在窄屏下各格自动换行（不允许第 5 格孤悬或溢出）
- **And** 加载骨架屏的格数与布局和真实内容一致

#### Scenario: 点击快照类别格跳转

- **Given** 首页已加载
- **When** 用户点击任一类别格
- **Then** 路由跳转到 `/vault/<category>`

#### Scenario: 智能体计数透传

- **Given** 保险箱 agents 目录下存在 N 个文件
- **When** 请求 overview
- **Then** `assetStats.agent === N`，快照"智能体"格显示 N（旧版本该字段缺失恒为 0）
