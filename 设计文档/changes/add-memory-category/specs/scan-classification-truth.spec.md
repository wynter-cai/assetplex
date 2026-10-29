# spec: scan-classification-truth（扫描归类不再把记忆与智能体伪装成偏好）

> capability：各工具目录扫描结果按真实语义归类，收藏落点可预期
> 关联：proposal G2/G3、D2/D3/D5
> 消费者：收藏向导（发现列表）、发现页、按类别收藏入口
> 变更沿革：原名包含「Claude commands → command」规则，随 D3（命令不做资产）改为「commands 不扫描」。

## 为什么需要这份 spec

现在同一类内容存在两种归类：同步时叫 `memory` / `agent`，被发现时叫 `preference`（`scanDirectory(..., 'preference')`）。TRAE 的 `memory/*.md`、Claude 的 `agents/*.md` 都是如此。

结果是：用户在收藏向导里看到一堆「偏好」，收藏后文件落进 `preferences/`，而同步链路却按 `memory/`、`agents/` 找文件。**同一个东西两个名字、两个落点**，正是阶段 0 清理掉的「类别漂移」在扫描层的残留。

另有一类残留是反方向的：Claude 的 `commands/` 本不属于任何跨工具资产，却被扫成 `preference`，于是「命令」以「偏好」名义溜进收藏向导。本变更直接把这条扫描规则删掉。

本 spec 只定义行为，不定义实现。

## 归类规则（用户可见语义）

| 来源目录 | 现有归类 | 目标归类 | 收藏落点 |
|---|---|---|---|
| Claude Code `commands/` | preference | **不扫描**（命令不是资产，D3） | 不进向导 |
| Claude Code `agents/` | preference | **agent** | `agents/<name>.md` |
| TRAE 中国版 `memory/user_profile.md` | identity | identity（不变） | `identity/profile.md` |
| TRAE 中国版 `memory/` 其他 `.md` | preference | **memory** | `memory/<name>.md` |
| 其他适配器的兜底项 | preference | preference（仅内部兜底，不进发现列表） | 不进向导 |

## Scenario 1 — TRAE 会话记忆被发现为「记忆」

- **Given** TRAE 中国版已安装，`memory/` 下有 `user_profile.md`、`session_memory.md`、`topics.md`
- **When** 打开收藏向导并选中 TRAE 中国版
- **Then** `user_profile.md` 仍归「身份」（它同时是同步链路的身份入口）
- **And** `session_memory.md`、`topics.md` 归「记忆」
- **And** 收藏后分别落 `identity/profile.md`、`memory/session_memory.md`、`memory/topics.md`

## Scenario 2 — 智能体不再伪装成偏好

- **Given** Claude Code `agents/` 下有 `code-reviewer.md`
- **When** 打开收藏向导
- **Then** 该项归「智能体」，不出现「偏好」分组
- **And** 收藏后落 `agents/code-reviewer.md`，且智能体页能看到

## Scenario 3 — 命令目录不再出现在向导里

- **Given** Claude Code 已安装，其 `commands/` 下有 `review-diff.md`、`commit.md`
- **When** 打开收藏向导并选中 Claude Code
- **Then** 这两项不出现在任何分组里，也没有「命令」分组
- **And** 收藏向导的可见项数与「记忆 + 智能体 + 身份 + 技能 + 规则 + MCP」的实际文件数一致

## Scenario 4 — 同一文件不重复出现

- **Given** 某个工具目录同时被两条扫描规则覆盖（历史配置或兼容目录）
- **When** 打开收藏向导
- **Then** 同一绝对路径只出现一次，且归类以本 spec 的规则表为准（先命中者优先）
- **And** 收藏时不会写两份文件

## Scenario 5 — 历史 `preferences/` 不被二次搬运

- **Given** 我的库 `preferences/` 下已有 `old-note.md`（阶段 0 之前收藏的历史文件）
- **When** 再次运行收藏向导
- **Then** 该文件不被重新发现为可收藏项（它已在库里）
- **And** 它继续在「记忆」类别下可见（见 memory-visible Scenario 5）
- **And** 系统不自动把它搬到 `memory/`

## Scenario 6 — 兜底类别不外泄

- **Given** 某适配器的导入入口遇到无法判断类型的文件
- **When** 该文件被扫描到
- **Then** 它仍可被内部标记为 `preference` 用于适配器 import 兜底
- **And** 它不出现在收藏向导的任何分组里
- **And** `GET /api/asset-categories` 不返回 `preference`，也不返回 `command`

## 验收口径

- 适配器单测：TRAE memory 的发现项 `category` 断言为 `memory`、Claude agents 断言为 `agent`（TDD 先红后绿）；
- 负向单测：Claude `commands/` 下的文件不出现在扫描结果里；
- 收藏落点断言：写入路径前缀为 `memory/`、`agents/`；
- 归一去重：同一绝对路径在一次扫描结果中最多出现一次；
- 回环：维护者真实目录下跑一次收藏向导，`preferences/` 目录条目数不增加。
