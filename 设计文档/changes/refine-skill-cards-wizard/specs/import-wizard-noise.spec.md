# spec: import-wizard-noise（收藏向导降噪）

> Capability：收藏向导只呈现「可收藏的内容」，二进制文件不参与文本合并，确认屏按状态分组折叠
> 关联：proposal 方案 C、拍板点 D
> 消费者：`AdapterBase.scanDirectory`、`SyncEngine.executeImport`、`Import.tsx`、`FileItem`、`ConflictDialog`

## 为什么需要

审计实测（P2-3）：某台机器扫描出 228 个条目，其中包含 `.arkcli-managed-skills.json` 这类工具自管的隐藏配置；技能目录里的 `_icon.png` 被判为 `differs` 冲突后，界面仍提示「智能合并：保留库内内容，将工具中新增/不同的部分合并进来」——图片没有「追加」语义；后端 `executeImport` 一律 `readFileSync(path, 'utf-8')`，若用户真的选了合并，会把乱码写进库。

## 实现口径（相对 proposal 的一处收口）

proposal 方案 C 写「导入期遇到二进制改为 skipped」；实现改为**原始字节复制**：

- 二进制条目在 Step 2 **可勾选**（默认不勾选），落盘走 `writeHubFileBytes` 原样复制，状态记 `created` / `overwritten`；
- 只有「策略为 merge」的二进制条目才 `skipped`（旧前端或 API 直调才会出现）。

理由：技能目录里的图标必须跟技能一起进库，一律跳过等于让用户永远收不全一个带图标的技能；而按字节复制既解决乱码，也不引入合并语义。

## Requirement: 隐藏条目不出现在盘点里

#### Scenario: 点文件与点目录被跳过

- **Given** 某工具配置目录下存在 `.arkcli-managed-skills.json`、`.DS_Store`、`.git/` 与正常文件 `rules.md`
- **When** 执行扫描
- **Then** 盘点结果只含 `rules.md`，隐藏条目一条都不出现
- **And** 递归进入任何目录时同样跳过以 `.` 开头的子项

#### Scenario: 适配器显式映射的点文件不受影响

- **Given** WorkBuddy / Claude Code 适配器用显式路径映射 `.mcp.json`
- **When** 执行扫描
- **Then** `.mcp.json` 仍出现在盘点结果中（`category=mcp`）
- **And** 该行为不依赖 `scanDirectory` 的目录递归

#### Scenario: 起点本身是点目录

- **Given** Qoder 的扫描起点是 `base/.qoder/skills`
- **When** 执行扫描
- **Then** 起点内的正常文件照常被发现（点号在前缀、不在条目名，不被过滤）

## Requirement: 二进制条目标注清楚、默认不勾选

#### Scenario: 扩展名判定

- **Given** 技能目录下有 `_icon.png`、`logo.svg`、`SKILL.md`、`notes.md`
- **When** 执行扫描
- **Then** 前两个 `binary === true`，后两个 `binary === false`
- **And** 结果是 `DiscoveredItem` 上的静态字段，不依赖 UI 猜测

#### Scenario: 内容嗅探兜底

- **Given** 某文件扩展名未知（如 `asset.bin` 或没有扩展名）且前 8KB 含 `0x00` 字节
- **When** 执行扫描
- **Then** 该条目仍被标记为二进制（不因白名单漏判而当文本处理）

#### Scenario: Step 2 显示与默认选择

- **Given** 扫描结果里既有文本也有二进制条目
- **When** 用户进入 Step 2
- **Then** 二进制条目显示「二进制」徽章与说明「收藏时按原样复制」
- **And** 二进制条目默认不被勾选，「全选」也不勾选二进制条目
- **And** 文本条目仍照旧默认全选

## Requirement: 二进制冲突不提供合并

#### Scenario: 冲突项只给两种策略

- **Given** Step 3 中某个冲突条目的 `binary === true`
- **When** 查看该条策略选项
- **Then** 只有「覆盖」与「跳过」两项，没有「智能合并」
- **And** 不显示「查看差异」，不显示 AI 仲裁入口
- **And** 文案说明「二进制文件无法逐行合并」

#### Scenario: 二进制冲突默认跳过

- **Given** 二进制冲突项尚未选择策略
- **When** 进入 Step 3
- **Then** 其默认策略是「跳过」（不默认覆盖库内已有的图标）

#### Scenario: 文本冲突默认策略不变

- **Given** 文本类冲突项
- **When** 进入 Step 3
- **Then** 默认策略仍是「智能合并」，与变更前一致

## Requirement: 导入执行不写乱码

#### Scenario: 二进制按原样复制

- **Given** 勾选了二进制条目且库内不存在同名文件
- **When** 执行导入
- **Then** 落盘内容与源文件逐字节相同，状态为 `created`
- **And** 库内已有同名文件且策略为覆盖时状态为 `overwritten`

#### Scenario: 二进制请求合并时跳过

- **Given** 二进制条目携带 `strategy='merge'`（旧客户端或 API 直调）
- **When** 执行导入
- **Then** 该条目状态为 `skipped`，`message` 说明「二进制文件无法合并」
- **And** 库内文件保持不变

#### Scenario: 结果页如实汇报

- **Given** 本次导入既有 `created` 也有 `skipped`
- **When** 查看 Step 4 结果
- **Then** 跳过项列出文件名与原因，不与错误混在一起

## Requirement: 确认屏按状态分组折叠

#### Scenario: 三组标题与计数

- **Given** 选中条目里同时有 `differs`、`exists`、`none` 三种状态
- **When** 进入 Step 3
- **Then** 出现三组：「内容冲突（N）」「库内已存在（N）」「新增文件（N）」
- **And** 计数与选中条目数一致，三组之和等于选中总数

#### Scenario: 默认展开与折叠

- **Given** 刚进入 Step 3
- **When** 观察三组
- **Then** 「内容冲突」组默认展开
- **And** 另两组默认折叠，只显示组名、计数与一句摘要

#### Scenario: 展开预览

- **Given** 「库内已存在」组处于折叠态
- **When** 点击该组标题
- **Then** 组内条目列表展开
- **And** 该组条目只有「已存在，跳过不覆盖」这一种语义，不出现策略选择

#### Scenario: 某种状态为空

- **Given** 选中条目里没有 `none`
- **When** 进入 Step 3
- **Then** 「新增文件」组不渲染（不显示 0 计数的空组）

## 非目标

- 不改冲突判定语义（`none` / `exists` / `differs` 定义不动）。
- 不做「技能目录整体收藏」（把一个 skill 目录打成一条资产），仍是逐文件。
- 不改导入结果的 `created/merged/overwritten/skipped/errors` 五态闭集。
