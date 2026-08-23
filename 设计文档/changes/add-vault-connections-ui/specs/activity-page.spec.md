# Spec: Activity Page (活动页)

> Capability: activity-page
> 对应页面: `/activity` (活动)

## ADDED Requirements

### R1: 时间线展示

#### Scenario: 标准时间线
**Given** 用户有过多次操作
**When** 用户进入活动页
**Then** 显示时间线，按时间倒序排列：
  - 今天 14:30 ⬇ 入库 从 TRAE 导入 identity/profile.md（合并）
  - 今天 14:28 ⬆ 分发 同步 3 项资产到 WorkBuddy
  - 今天 10:12 ✏ 编辑 修改 skills/react-expert.md
  - 昨天 21:00 ➕ 新建 创建 rules/typescript.md
  - 昨天 18:45 ⬇ 入库 从 WorkBuddy 导入 .mcp.json（覆盖）
**And** 每条记录显示：时间、操作类型图标、操作描述、结果

#### Scenario: 无活动记录
**Given** 用户从未做过任何操作
**When** 进入活动页
**Then** 显示空状态："还没有活动记录"
**And** 提供"开始导入资产"按钮

### R2: 筛选

#### Scenario: 按操作类型筛选
**Given** 活动页有 20 条记录
**When** 用户点击"入库"筛选标签
**Then** 只显示入库类型的记录
**And** 其他类型记录被隐藏

#### Scenario: 按时间筛选
**Given** 活动页有跨多天的记录
**When** 用户选择"今天"
**Then** 只显示今天的记录

### R3: 活动详情

#### Scenario: 查看入库详情
**Given** 时间线有一条入库记录"从 TRAE 导入 3 项资产"
**When** 用户点击该记录
**Then** 展开详情，显示：
  - 导入的文件列表
  - 每个文件的处理策略（合并/覆盖/跳过）
  - 导入时间
  - 来源工具

#### Scenario: 查看分发详情
**Given** 时间线有一条分发记录"同步 3 项资产到 WorkBuddy"
**When** 用户点击该记录
**Then** 展开详情，显示：
  - 同步的文件列表
  - 每个文件的同步结果（成功/失败/跳过）
  - 同步时间
  - 目标工具
