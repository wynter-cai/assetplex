# Spec: 设计令牌与字体体系

> Capability: design-tokens
> Change: refactor-design-system（P1-1 / P1-2 部分）
> 背景实测：主按钮/选中导航是近黑 slate-900（shadcn 默认未改），欢迎页 CTA/快速动作/
> 健康度是硬编码靛蓝 indigo-600，两套主色并存；语义色以 Tailwind 原色散落 8+ 组件，
> badge success/warning 为饱和原色白字（对比度 2.2~2.3:1）；无 font-family 定义、
> 无中文栈、无数字等宽；实测 9 档字号无 scale，徽章 10px 中文。
> 已拍板：主色靛蓝 indigo-600；暗色模式暂时摘除。

## MODIFIED Requirements

### Requirement: 品牌主色全站唯一

#### Scenario: 用户查看任意主操作控件

- **Given** 应用在亮色模式下运行
- **When** 用户浏览主按钮、选中导航项、分段控件选中态、欢迎页 CTA、快速动作主按钮、健康度强调数字/图标、侧栏 Logo
- **Then** 上述元素呈现同一品牌靛蓝（indigo-600 基调，含配套 hover/active 深浅档）
- **And** 界面中不再出现"近黑主色 + 靛蓝硬编码"两套主色并存

#### Scenario: 源码硬编码清零

- **Given** 前端源码（web/src）
- **When** 全仓检索 `indigo-` 字面类名
- **Then** 零命中（品牌色一律通过 `--primary` 等设计令牌引用）

### Requirement: 语义色入令牌且达 AA

#### Scenario: 成功/警告/危险状态徽章

- **Given** 技能列表、连接页、导入向导中出现成功/警告/危险语义的徽章或提示
- **When** 用户查看这些元素
- **Then** 语义色来自统一令牌（success / warning / danger / info），采用"浅底深字"样式
- **And** 徽章文字与底色对比度 ≥ 4.5:1（WCAG AA），不再出现 green-500 / yellow-500 纯原色白字
- **And** 语义色的使用不再散落硬编码 Tailwind 原色类（grep `green-500|yellow-500|red-500|blue-500|purple-500` 仅剩令牌定义处或零命中）

## ADDED Requirements

### Requirement: 字体栈与字号体系

#### Scenario: 中文界面文字渲染

- **Given** Windows/macOS/Linux 任一环境打开应用
- **When** 查看任意中文文字
- **Then** 使用统一中文字体栈渲染（系统 UI 字体优先，含 PingFang SC / Microsoft YaHei 等中文回退），不再依赖偶然回退
- **And** 全站中文最小字号为 12px，10px 中文清零（含技能卡徽章）

#### Scenario: 字号档位收敛

- **Given** 任意页面
- **When** 检查文字字号
- **Then** 仅使用既定 type scale（12 / 13 / 14 / 16 / 20 / 24 六档）及其语义映射
- **And** 不再出现 10 / 11 / 18 / 30 等游离字号（Markdown 阅读排版另见 markdown-typography.spec.md）

#### Scenario: 统计数字展示

- **Given** 首页资产快照、统计行、列表计数等数字
- **When** 数字变化或多列对齐
- **Then** 数字使用等宽数字（tabular-nums），多行数字纵向对齐不跳动

### Requirement: 暗色模式代码摘除

#### Scenario: 系统暗色主题下使用应用

- **Given** 操作系统处于深色显示模式
- **When** 用户打开应用任意页面
- **Then** 应用仍以亮色主题完整呈现，无样式破碎、无对比度异常区域

#### Scenario: 源码层面无暗色残留

- **Given** 前端源码
- **When** 全仓检索 `dark:` 工具类与 `.dark` 令牌块
- **Then** 零命中（主题切换能力按拍板结论开源后按用户反馈再正式设计加回）
