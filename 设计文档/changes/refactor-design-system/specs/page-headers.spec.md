# Spec: 页面页头统一

> Capability: page-headers
> Change: refactor-design-system（P1-2 部分）
> 背景实测：页面标题不统一（同步中心/项目 24px，设置/占位 30px）；
> 资产库各页无 H1（实测 main h1 = NONE），只能靠侧栏高亮判断位置。

## ADDED Requirements

### Requirement: 标准页头结构

#### Scenario: 打开任一主要页面

- **Given** 用户打开首页以外的任一主要页面（资产库各类别页、项目、连接、同步中心、导入、设置）
- **When** 页面渲染完成
- **Then** 页面顶部呈现标准页头：H1 标题 + 一句话副标题 + 右侧操作区（该页主操作，如新建/导入/同步）
- **And** 各页 H1 字号统一为同一档（type scale 中 20px 档），不再出现 24px/30px 混杂

#### Scenario: 打开资产库任一类别页

- **Given** 用户从侧栏进入资产库的技能/规则/身份/MCP/智能体任一类别页
- **When** 页面渲染完成
- **Then** 出现以类别名命名的 H1（如「技能」）与一句类别描述副标题
- **And** 新建/导入等该类别的主操作位于页头操作区
- **And** 用户不依赖侧栏高亮也能知道当前所处类别（兜底撤类别栏后的上下文线索）

#### Scenario: 设置页门面

- **Given** 用户打开设置页
- **When** 查看页头
- **Then** 标题与副标题符合术语规范（见 terminology.spec.md：不再出现「Hub 设置」与 hub.toml 实现措辞）
- **And** 字号与其他页页头一致
