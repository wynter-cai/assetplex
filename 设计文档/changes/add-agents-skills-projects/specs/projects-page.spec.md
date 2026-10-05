# Capability: AI-Coding 项目可视化（Projects）

> 能力代码: projects-page
> 对应 API: [../api-contract.ts](../api-contract.ts)（C 部分）
> 状态: 待审核

## 目的

新增顶级模块「项目」，集中可视化用户用 AI 跑过哪些项目，并提供每个项目的 AI 工具标记、资产统计与快捷打开操作。第一版数据源为 TRAE。

## 数据来源

- **主数据源**：`%APPDATA%/Trae CN/User/workspaceStorage/*/workspace.json`，其中 `folder` 字段是项目真实路径（file URI），workspaceStorage 条目目录的 mtime 即最近访问时间。
- **历史补充**：`~/.trae-cn/worktrees/` 的目录名（仅项目名，可能无真实路径）。
- 去重：以解析后的真实路径去重；worktrees 中无法对应真实路径的名称作为"历史项目"补充条目（exists=false）。

---

## Scenario: 侧边栏出现「项目」顶级菜单

- **Given** 用户已打开 AssetPlex
- **When** 用户查看侧边栏主导航
- **Then** 在「资产库」与「连接」之间出现「项目」菜单项
- **And** 点击后进入项目页，URL 为 `/projects`

## Scenario: 项目列表按最近访问排序

- **Given** workspaceStorage 存在多个含 folder 的条目
- **When** 用户进入项目页
- **Then** 每个解析出的项目显示为一张卡片
- **And** 卡片按最近访问时间倒序排列
- **And** 页头显示项目总数与"目录仍存在"的项目数

## Scenario: 项目卡展示基础信息

- **Given** 项目列表已加载
- **When** 用户查看某张项目卡
- **Then** 卡片显示项目名（目录名）、完整路径、最近访问时间、目录是否仍存在
- **And** 目录已不存在的项目以弱化样式并标记"已不在原位置"

## Scenario: 识别项目使用的 AI 工具

- **Given** 某项目目录仍存在且含 AI 工具标记
- **When** 系统分析该项目
- **Then** 卡片标记检测到的工具，依据包括 `.trae/` 目录、`.claude/` 目录、`AGENTS.md` 文件等
- **And** 每个标记显示其工具名与相对路径
- **And** 未检测到任何标记时显示"无明显 AI 标记"

## Scenario: 统计项目内资产

- **Given** 项目目录存在
- **When** 系统统计项目资产
- **Then** 卡片显示规则文件数、技能数、文档数（.md）
- **And** 统计不递归进入 node_modules 等依赖目录

## Scenario: 读取 Git 分支与状态

- **Given** 某项目是 Git 仓库
- **When** 系统读取 git 信息
- **Then** 卡片显示当前分支名与是否有未提交变更
- **And** 非 Git 项目显示"非 Git 仓库"，分支为空

## Scenario: 快捷打开项目

- **Given** 某项目目录仍存在
- **When** 用户点击「在文件管理器打开」「在终端打开」或「在 IDE 打开」
- **Then** 系统以对应方式在本机打开该项目
- **And** 目录不存在的项目，打开按钮禁用

## Scenario: 仅看存在的项目与搜索

- **Given** 项目列表包含已删除路径的项目
- **When** 用户开启"仅看存在的项目"开关或输入名称关键字
- **Then** 列表只显示目录仍存在且/或匹配关键字的项目
- **And** 可清除条件恢复完整列表

## Scenario: 打开操作的安全约束

- **Given** 服务端收到打开项目的请求
- **When** 请求中的路径不在本次扫描出的项目清单内
- **Then** 服务端拒绝执行并返回错误，不打开任何位置
- **And** target 仅接受 explorer / terminal / ide 三种取值

## Scenario: TRAE 数据缺失时降级

- **Given** workspaceStorage 目录不存在或无 workspace.json
- **When** 用户进入项目页
- **Then** 页面显示空状态，提示暂无 TRAE 项目记录，不报错
- **And** 若 worktrees 有名称，仍以历史项目形式列出
