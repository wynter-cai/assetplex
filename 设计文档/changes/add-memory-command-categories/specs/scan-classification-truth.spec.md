# spec: scan-classification-truth（扫描归类不再把记忆与命令伪装成偏好）

> capability：各工具目录扫描结果按真实语义归类，收藏落点可预期
> 关联：proposal G3/G4、D2/D5
> 消费者：收藏向导（发现列表）、发现页、按类别收藏入口

## 为什么需要这份 spec

现在同一条命令存在两种归类：同步时叫 `command`（Claude Code 适配器 `resolveHubItems` 用的是 command），被发现时叫 `preference`（`scanDirectory(..., 'preference')`）。TRAE 的 `memory/*.md` 也是如此——同步语义是记忆，发现语义是偏好。

结果是：用户在收藏向导里看到一堆「偏好」，收藏后文件落进 `preferences/`，而同步链路却按 `commands/`、`memory/` 找文件。**同一个东西两个名字、两个落点**，正是阶段 0 清理掉的「类别漂移」在扫描层的残留。

本 spec 只定义行为，不定义实现。

## 归类规则（用户可见语义）

| 来源目录 | 现有归类 | 目标归类 | 收藏落点 |
|---|---|---|---|
| Claude Code `commands/` | preference | **command** | `commands/<name>.md` |
| TRAE 中国版 `memory/user_profile.md` | identity | identity（不变） | `identity/profile.md` |
| TRAE 中国版 `memory/` 其他 `.md` | preference | **memory** | `memory/<name>.md` |
| Claude Code / WorkBuddy `agents/` | preference | **agent**（既有能力，随本变更校正） | `agents/<name>.md` |
| 其他适配器的兜底项 | preference | preference（仅内部兜底，不进发现列表） | 不进向导 |

## Scenario 1 — Claude Code 命令被发现为「命令」

- **Given** Claude Code 已安装，其 `commands/` 下有 `review-diff.md`、`commit.md`
- **When** 打开收藏向导并选中 Claude Code
- **Then** 这两项归入「命令」分组，不出现「偏好」分组
- **And** 选中收藏后，我的库出现 `commands/review-diff.md`、`commands/commit.md`
- **And** 收藏完成后侧栏「命令」计数 +2

## Scenario 2 — TRAE 会话记忆被发现为「记忆」

- **Given** TRAE 中国版已安装，`memory/` 下有 `user_profile.md`、`session_memory.md`、`topics.md`
- **When** 打开收藏向导并选中 TRAE 中国版
- **Then** `user_profile.md` 仍归「身份」（它同时是同步链路的身份入口）
- **And** `session_memory.md`、`topics.md` 归「记忆」
- **And** 收藏后分别落 `identity/profile.md`、`memory/session_memory.md`、`memory/topics.md`

## Scenario 3 — 智能体不再伪装成偏好

- **Given** Claude Code `agents/` 下有 `code-reviewer.md`
- **When** 打开收藏向导
- **Then** 该项归「智能体」
- **And** 收藏后落 `agents/code-reviewer.md`，且智能体页能看到

## Scenario 4 — 同一文件不重复出现

- **Given** 某个工具目录同时被「命令」与「偏好」两条扫描规则覆盖（历史配置）
- **When** 打开收藏向导
- **Then** 同一路径只出现一次，且归类以本 spec 的规则表为准
- **And** 收藏时不会写两份文件

## Scenario 5 — 历史 `preferences/` 不被二次搬运

- **Given** 我的库 `preferences/` 下已有 `old-note.md`（阶段 0 之前收藏的历史文件）
- **When** 再次运行收藏向导
- **Then** 该文件不被重新发现为可收藏项（它已在库里）
- **And** 它继续在「记忆」类别下可见（见 memory-command-visible Scenario 5）
- **And** 系统不自动把它搬到 `memory/`

## Scenario 6 — 兜底类别不外泄

- **Given** 某适配器的导入入口遇到无法判断类型的文件
- **When** 该文件被扫描到
- **Then** 它仍可被内部标记为 `preference` 用于适配器 import 兜底
- **And** 它不出现在收藏向导的任何分组里
- **And** `GET /api/asset-categories` 不返回 `preference`

## 验收口径

- 适配器单测：Claude commands / TRAE memory 的发现项 `category` 断言为 `command` / `memory`（TDD 先红后绿）；
- 收藏落点断言：写入路径前缀分别为 `commands/`、`memory/`；
- 归一去重：同一相对路径在一次扫描结果中最多出现一次；
- 回环：维护者真实目录下跑一次收藏向导，`preferences/` 目录条目数不增加。
