# Spec: Import Wizard Integration (入库向导整合)

> Capability: import-wizard
> 对应流程: 入库向导（从工具扫描资产到 Hub）

## ADDED Requirements

### R1: 入口整合

入库向导不再作为独立导航 tab，而是从多个位置触发。

#### Scenario: 从首页发起
**Given** 用户在首页
**When** 用户点击"快速动作"区域的"导入资产"按钮
**Then** 启动入库向导 Step 1
**And** 默认扫描所有已安装工具

#### Scenario: 从资产库发起
**Given** 用户在资产库
**When** 用户点击顶部"⬇ 导入"按钮
**Then** 启动入库向导 Step 1
**And** 完成后自动刷新资产列表

#### Scenario: 从连接页发起（指定工具）
**Given** 用户在连接页选中 TRAE，查看"工具自有资产"区域
**When** 用户点击"一键导入到 Hub"
**Then** 启动入库向导，且 Step 1 已锁定 TRAE（不扫描其他工具）
**And** Step 2 预选发现的未入库文件

### R2: Step 1 扫描工具优化

#### Scenario: 扫描进度展示
**Given** 用户启动入库向导
**When** 进入 Step 1
**Then** 显示扫描进度动画：
  - "正在扫描 TRAE 中国版... 发现 3 个文件"
  - "正在扫描 WorkBuddy... 发现 5 个文件"
  - "正在扫描 Claude Code... 发现 8 个文件"
**And** 扫描完成后显示工具列表，每个工具显示发现的文件数
**And** 默认勾选所有已安装且发现文件的工具

#### Scenario: 无工具可扫描
**Given** 系统未检测到任何已安装的 AI 工具
**When** 进入 Step 1
**Then** 显示空状态：
  - "未检测到已安装的 AI 工具"
  - 支持的工具列表（含安装指引链接）

### R3: Step 2 选择资产优化

#### Scenario: 资产卡片化展示
**Given** Step 1 扫描完成
**When** 进入 Step 2
**Then** 发现的资产以卡片形式展示，按类别分组：
  - 👤 身份 (1)
    - profile.md - 来源: TRAE - 2.3 KB
  - ✨ 技能 (3)
    - react-expert.md - 来源: Claude Code - 1.8 KB
    - ...
**And** 每个卡片有勾选框，默认全选
**And** 顶部显示"已选 X / 共 Y 项"

#### Scenario: 预览资产内容
**Given** 用户在 Step 2 查看资产列表
**When** 用户点击某个资产卡片
**Then** 展开资产内容预览（前 10 行）
**And** 提供"查看完整内容"链接

### R4: Step 3 冲突处理优化

复用现有 ConflictDialog 和 DiffView 组件，但改进默认展示。

#### Scenario: 冲突项默认展开 diff
**Given** Step 2 选中的资产中有 2 个文件和 Hub 现有文件冲突
**When** 进入 Step 3
**Then** 冲突文件列表展示，每个冲突项**默认展开** Diff 预览
**And** 不需要用户点击"查看差异"才展开
**And** 每个冲突项显示策略选择按钮（智能合并/覆盖/跳过）
**And** 策略按钮下方显示策略说明文本（动态根据选择的策略）

#### Scenario: 无冲突
**Given** Step 2 选中的资产都不和 Hub 现有文件冲突
**When** 进入 Step 3
**Then** 显示"无冲突，可以直接导入"
**And** 提供"下一步"按钮

### R5: Step 4 完成和后续动作

#### Scenario: 完成入库
**Given** Step 3 处理完所有冲突
**When** 用户点击"完成入库"
**Then** 执行导入操作
**And** 完成后显示成功页：
  - "已导入 N 项资产到 Hub"
  - 资产列表（含每个资产的导入结果：新增/合并/跳过）
  - "去资产库查看" 按钮
  - "去分发到其他工具" 按钮

#### Scenario: 跳转到分发
**Given** 入库完成
**When** 用户点击"去分发到其他工具"
**Then** 跳转到连接页
**And** 弹出提示"新导入的 N 项资产还未分发，选择要同步到的工具"

### R6: 入库向导弹窗化

#### Scenario: 弹窗形式
**Given** 用户从任意入口启动入库向导
**When** 向导启动
**Then** 以全屏弹窗（Modal）形式展示
**And** 弹窗有顶部步骤指示器（1→2→3→4）
**And** 弹窗有"取消"按钮，点击后提示"确定要放弃本次导入吗？"
