# Spec: Connections Page (连接页)

> Capability: connections-page
> 对应页面: `/connections` (连接)

## ADDED Requirements

### R1: 工具列表展示

左侧显示所有支持的 AI 工具，按安装状态排序。

#### Scenario: 标准工具列表
**Given** 系统检测到 5 个工具：TRAE（已安装）、WorkBuddy（已安装）、Claude Code（已安装）、Codex（未安装）、Qoder（未安装）
**When** 用户进入连接页
**Then** 左侧显示工具列表，已安装的排在前面：
  - ✅ TRAE 中国版
  - ✅ WorkBuddy
  - ✅ Claude Code
  - ⬜ Codex
  - ⬜ Qoder
**And** 每个工具显示名称和状态图标

#### Scenario: 点击工具切换详情
**Given** 用户在连接页，当前选中 TRAE
**When** 用户点击 WorkBuddy
**Then** 左侧 WorkBuddy 项高亮
**And** 右侧切换为 WorkBuddy 的详情面板

### R2: 工具详情面板

右侧显示选中工具的详细信息。

#### Scenario: 已安装工具详情
**Given** 用户选中已安装的 TRAE
**When** 详情面板加载完成
**Then** 显示：
  - 工具名称: "TRAE 中国版"
  - 安装路径: "C:\Users\caiwe\.trae-cn"
  - 版本号: "1.0.31"（如可检测）
  - 同步策略: "符号链接" 或 "文件复制"
  - 最后同步时间: "今天 14:30" 或 "从未"
  - 右上角"🔄 同步"按钮

#### Scenario: 未安装工具详情
**Given** 用户选中未安装的 Codex
**When** 详情面板加载完成
**Then** 显示：
  - 工具名称: "Codex"
  - 状态: "未安装"
  - 说明: "Codex 是 OpenAI 的 AI 编码工具"
  - 安装指引链接
  - 不显示同步按钮

### R3: 资产分发状态

展示该工具当前已有的 Hub 资产及同步状态。

#### Scenario: 多种同步状态
**Given** TRAE 已同步 4 项资产，其中 1 项有更新、1 项冲突
**When** 查看资产分发状态区域
**Then** 显示列表：
  - 👤 identity/profile.md    ✅ 已同步
  - ✨ skills/react-expert.md  ⚠️ 待更新
  - 📖 rules/typescript.md    ✅ 已同步
  - 🖥 mcp.json               ❌ 冲突
**And** 每行显示资产图标、路径、状态、最后同步时间

#### Scenario: 点击"待更新"项
**Given** skills/react-expert.md 状态为"待更新"
**When** 用户点击该行
**Then** 展开 Diff 预览，显示 Hub 版本和工具版本的差异
**And** 提供"推送更新"按钮

#### Scenario: 点击"冲突"项
**Given** mcp.json 状态为"冲突"
**When** 用户点击该行
**Then** 展开 Diff 预览
**And** 提供冲突处理选项（智能合并/覆盖/跳过）

### R4: 工具自有资产（未入库）

扫描发现工具中有但 Hub 中没有的资产文件。

#### Scenario: 发现未入库文件
**Given** 扫描 TRAE 发现 `memory/extra-rules.md` 不在 Hub 中
**When** 查看"工具自有资产"区域
**Then** 显示：
  - 标题: "工具自有资产（未入库）"
  - 文件列表:
    - memory/extra-rules.md (2.3 KB, Markdown)
  - "一键导入到 Hub" 按钮

#### Scenario: 无未入库文件
**Given** TRAE 中所有资产文件都已在 Hub 中
**When** 查看"工具自有资产"区域
**Then** 显示空状态："该工具的所有资产已导入到 Hub"

### R5: 同步操作

#### Scenario: 启动同步
**Given** 用户在 TRAE 详情面板，有 1 项待更新
**When** 用户点击"🔄 同步"按钮
**Then** 弹出同步确认对话框，显示：
  - "即将同步以下资产到 TRAE 中国版:"
  - ✨ skills/react-expert.md (推送更新)
  - "其他 3 项已同步，无需更新"
  - "确认同步" / "取消" 按钮

#### Scenario: 同步完成
**Given** 用户点击"确认同步"
**When** 同步完成
**Then** 显示成功提示"已同步 1 项资产到 TRAE"
**And** 资产分发状态列表更新为全部"已同步"

#### Scenario: 同步失败
**Given** 用户点击"确认同步"
**When** 同步过程中发生错误（如文件被占用）
**Then** 显示错误提示"同步失败: [错误原因]"
**And** 提供"重试"按钮
**And** 不修改任何文件

### R6: 从工具发起导入

#### Scenario: 一键导入未入库文件
**Given** 工具自有资产区域有 2 个未入库文件
**When** 用户点击"一键导入到 Hub"
**Then** 启动入库向导，且 Step 2 已预选这 2 个文件
**And** 用户可以在向导中调整选择

### R7: 空状态

#### Scenario: 工具未连接任何资产
**Given** 用户选中已安装的 WorkBuddy，但从未同步过任何资产
**When** 详情面板加载完成
**Then** 资产分发状态区域显示空状态：
  - "还没有从 Hub 分发资产到 WorkBuddy"
  - "选择要同步的资产"按钮（跳转到资产库）
