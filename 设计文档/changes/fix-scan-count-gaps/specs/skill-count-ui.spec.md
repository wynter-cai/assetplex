# Spec: 技能计数与来源徽章

## ADDED Requirements

### Requirement: 卡片统计行随筛选联动

#### Scenario: 无筛选显示全集
- **Given** 未选任何 tab/出处/职能/搜索
- **When** 查看技能列表
- **Then** 统计行显示「去重后共 {total} 个技能（同名副本已合并）」

#### Scenario: 有筛选显示当前视图数量
- **Given** 已选「我的库」（或任一出处/职能/搜索词）
- **When** 查看技能列表
- **Then** 统计行显示「当前视图 {卡片数} 个技能」，与实际渲染卡片数一致

#### Scenario: 切换筛选不闪 0
- **Given** 当前视图已有数据
- **When** 切换「我的库 / 未入库」tab
- **Then** 沿用上一份数据渲染直至新数据到达，tab 数字不出现 0

### Requirement: 官方内置徽章标注来源工具

#### Scenario: TRAE 官方内置
- **Given** 一个 tool=trae 且 provenance=builtin 的技能
- **When** 查看卡片与详情徽章
- **Then** 显示「官方内置 · TRAE」

#### Scenario: WorkBuddy 官方内置
- **Given** 一个 tool=workbuddy 且 provenance=builtin 的技能
- **When** 查看徽章
- **Then** 显示「官方内置 · WorkBuddy」

#### Scenario: 其他出处不受影响
- **Given** provenance 为 self/marketplace/plugin 的技能
- **When** 查看徽章
- **Then** 维持原标签，不追加工具后缀
