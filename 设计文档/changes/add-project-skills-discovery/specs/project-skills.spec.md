# Spec: project-skills（项目级技能发现与盘点）

> 变更：add-project-skills-discovery
> 日期：2026-10-06 | 状态：待审核

---

## ADDED Requirement: 从 TRAE 记录自动发现工作区

AssetPlex 从 TRAE CN 自身的窗口状态文件（`storage.json` 的 `backupWorkspaces.folders`、`windowsState`、`profileAssociations.workspaces` 三个区段）中解析用户打开过的工作区绝对路径，作为项目技能扫描候选。解析是纯本地、best-effort 的。

### Scenario: 三个区段的路径全部解析并去重

- **Given** TRAE `storage.json` 中 `backupWorkspaces.folders`、`windowsState.openedWindows[].folder`、`windowsState.lastActiveWindow.folder`、`profileAssociations.workspaces` 的键里共出现多个 `folderUri`（含重复项）
- **When** AssetPlex 解析工作区列表
- **Then** 所有 `file:///` 开头的文件夹 URI 被解码为本机绝对路径（如 `file:///d%3A/demo/Demo%20App` → `~\projects\Demo App`，中文与 `%20` 等编码正确还原），按规范化路径去重后输出

### Scenario: storage.json 缺失或损坏时安全降级

- **Given** TRAE 未安装、`storage.json` 不存在，或文件内容不是合法 JSON / 缺少上述任何区段
- **When** AssetPlex 解析工作区列表
- **Then** 返回空列表，不抛错、不阻断技能盘点；响应的 `errors` 中给出一条可读提示（如「无法读取 TRAE 工作区记录，可手动添加工作区根目录」）

### Scenario: 忽略无效 URI 与不可访问路径

- **Given** 解析结果中混有非 `file:///` URI、相对路径、已不存在的目录、文件（非目录）路径
- **When** AssetPlex 组装有效工作区列表
- **Then** 以上候选全部被忽略，只保留本机存在且可访问的目录；手动配置中不存在的根路径在 `errors` 中提示但不影响其余工作区

### Scenario: 用户禁用的自动发现项不参与扫描

- **Given** 用户曾把某自动发现的工作区加入禁用列表（`disabledWorkspaces`）
- **When** 组装工作区列表
- **Then** 该工作区不参与项目技能扫描；但在工作区设置接口中仍以 `disabled: true` 返回，用户可以重新启用

---

## ADDED Requirement: 手动工作区根

除自动发现外，用户可在设置中配置工作区根目录。一个根既可以本身就是工作区，也可以是多个工作区的父目录。

### Scenario: 根目录本身是工作区

- **Given** 用户配置根 `~\projects\Zhihu`，该目录下存在 `.trae\skills`
- **When** 展开工作区列表
- **Then** `~\projects\Zhihu` 作为一个工作区参与扫描

### Scenario: 根目录是多个工作区的父目录

- **Given** 用户配置根 `~\projects`，其下有多个一级子目录含 `.trae\skills`（如 Zhihu、Demo App、Super Powers），也有不含的（如 node_modules 同级普通目录）
- **When** 展开工作区列表
- **Then** 仅展开一级：根自身与每个直接子目录被检查一次，只有存在 `.trae\skills` 目录的条目成为工作区；不做更深层级递归

### Scenario: 手动根与自动发现合并去重

- **Given** 自动发现与手动配置指向同一工作区（尾部分隔符、大小写、符号链接等写法不同）
- **When** 组装最终工作区列表
- **Then** 同一物理目录只出现一次，来源标记为 `manual`（手动配置优先于自动标记）

### Scenario: 工作区数量上限保护

- **Given** 合并后的候选工作区数量超过上限（默认 100）
- **When** 组装工作区列表
- **Then** 只取前 100 个（手动配置优先保留，其余按路径排序），响应标记 `truncated: true`，扫描与服务启动不因此失败

### Scenario: 保存配置时校验

- **Given** 用户通过接口保存工作区配置
- **When** 请求中的根路径不是绝对路径、或 `autoDiscover` 不是布尔值、或根数量超过上限
- **Then** 返回 400 与 `{ error }`，原配置不被修改；合法路径保存时做去重与规范化

---

## ADDED Requirement: 项目级技能盘点

技能盘点对每个工作区扫描 `.trae/skills/<技能名>/SKILL.md`，这些技能以新来源 `project`（展示名「项目技能」）纳入全貌。

### Scenario: 项目技能被发现并携带所属项目信息

- **Given** 工作区 `~\projects\Zhihu` 的 `.trae\skills\zhihu\SKILL.md` 存在且 frontmatter 含 name/description
- **When** 执行技能盘点
- **Then** 该技能出现在列表中：`origin = 'project'`、`tool = 'trae'`、`workspaceName = 'Zhihu'`、`workspacePath = '~\projects\Zhihu'`；`countByOrigin.project` 包含它，`origin=project` 筛选可过滤出它

### Scenario: 工作区没有 .trae/skills 时零贡献

- **Given** 某工作区（无论自动或手动）不含 `.trae\skills` 目录，或该目录下没有含 SKILL.md 的技能子目录
- **When** 执行技能盘点
- **Then** 该工作区贡献零条技能，不报错

### Scenario: 同一技能在多个项目存在副本

- **Given** 同名技能（frontmatter name 小写比较相同）同时存在于两个工作区的 `.trae\skills` 下
- **When** 执行技能盘点
- **Then** 合并为一个主条目，`variants` 记录其余副本的 SKILL.md 绝对路径与（若展示）所属项目；主条目按「路径字典序靠前」稳定选取，重扫结果稳定

### Scenario: 项目内改编版与市场/内置技能同名时项目版优先

- **Given** 某技能名在工作区 `.trae\skills` 与市场目录（或内置/插件目录）下各有一个副本
- **When** 执行技能盘点
- **Then** 主条目来源为 `project`（优先级 vault > personal > project > plugin > marketplace > builtin），市场副本计入 variants；因此 `countByOrigin` 中该技能计入 project 而非 marketplace

### Scenario: 项目技能被链接进保险箱或 TRAE 全局目录时按物理路径去重

- **Given** 某项目技能通过目录联接/符号链接也出现在保险箱 skills 目录（或 `~/.trae-cn/skills`）
- **When** 执行技能盘点
- **Then** 同一物理文件只保留一条，按真实路径归为更高优先级来源（vault/personal），不会出现重复卡片

### Scenario: 手动职能覆盖与 AI 分类对项目技能生效

- **Given** 用户对一个 project 技能手动调整过职能分类，或其 SKILL.md 内容哈希命中 AI 分类缓存
- **When** 执行技能盘点
- **Then** 分类来源优先级（manual > ai > keyword）与现有规则一致，项目技能不被特殊对待

---

## MODIFIED Requirement: 项目技能沉淀到保险箱

### Scenario: 项目技能可以一键沉淀且记录溯源

- **Given** 一个 origin=`project` 的技能
- **When** 用户对其执行「沉淀到保险箱」（单条或批量）
- **Then** SKILL.md 被复制进保险箱技能目录（项目内原文件不动），保险箱副本 frontmatter 的 `source` 为 `project:<原 SKILL.md 绝对路径>`；沉淀后同名合并按现有规则（保险箱优先），再次沉淀同名返回 400

### Scenario: 项目技能在详情中可见沉淀入口

- **Given** 用户打开一个 project 技能详情
- **When** 查看操作区
- **Then** 可见「沉淀到保险箱」按钮与所属项目信息（项目名 + 工作区路径）；保险箱（vault）技能不显示该按钮（现有行为不变）

---

## ADDED Requirement: 前端展示项目技能

### Scenario: 来源筛选与计数包含项目技能

- **Given** 盘点结果中存在 project 技能
- **When** 用户打开资产库-技能页
- **Then** 来源筛选区出现「项目技能」及其数量（顺序：保险箱 / 个人自建 / 项目技能 / 插件 / 市场安装 / 官方内置）；职能分类计数与现有筛选联动行为不变

### Scenario: 卡片与详情标识所属项目

- **Given** 列表中一张 project 技能卡片
- **When** 查看卡片与打开详情
- **Then** 卡片显示项目名徽章（如「项目 · Zhihu」），详情额外显示完整工作区路径，帮助用户判断技能归属与同名技能的区别

### Scenario: 设置页管理工作区

- **Given** 用户进入设置页的工作区区域
- **When** 页面加载完成
- **Then** 可见：自动发现开关（默认开启）、当前生效工作区列表（名称/路径/来源 自动·手动/技能数/禁用状态）、手动根目录的添加与移除入口、自动发现项的禁用/启用操作；保存后立即生效并触发重新盘点

---

## ADDED Requirement: 工作区查询与配置接口

### Scenario: 查询工作区全貌

- **Given** 用户已打开技能页或设置页
- **When** 前端调用 `GET /api/workspaces`
- **Then** 返回当前配置（autoDiscover / roots / disabledWorkspaces）、有效工作区列表（含每工作区技能数、来源、禁用状态）、`truncated`、`maxWorkspaces` 与 best-effort 的 `errors`

### Scenario: 更新工作区配置

- **Given** 合法的配置更新请求
- **When** 前端调用 `PUT /api/workspaces`
- **Then** 配置持久化到本机 `~/.assetplex/workspaces.json`，返回更新后的完整工作区全貌；后续技能盘点立即使用新配置。任何技能内容与工作区信息不上传远端
