# AI-native SDLC 与 MCP / Commands / Agents / Memory 资产编写最佳实践

> 调研范围：为 AssetPlex「资产编写质量诊断」功能提供可转成检查规则的依据。
> 检索日期：**2026-11-14**（全部链接均为当日实际访问/检索所得）
> 证据分级：`[F]` = 官方文档或可验证一手材料；`[S]` = 二手文章、社区经验、观点。
> 约定：每条关键结论尽量给 ≥2 个独立来源；只有一个来源的，正文标注「单源」。

---

## 0 核心结论

1. **AI-native SDLC 的本质不是"让 AI 写代码"，而是"每个阶段都产出一份可提交的工件，下一阶段读它"**。工件链 `intent.md → spec.md → plan.md → diff+tests → PR+review findings → incident record` 本身就是审计轨迹，git 提交历史即"谁要求了什么、agent 产出了什么、谁批准了"。印证：S1（playbook 六阶段表 + "committed artifact" 段落）、S2（安全团队按同一套阶段设闸门）。`[F]`

2. **瓶颈已从"写代码"移到"计划/评审/部署"三处人类速度环节**，所以"把 AI 用对了"的判据是：人只在**闸门**（gate）上投入注意力，而不是逐行读 diff。Anthropic 自述 AI 已产出 80% 合并代码、人均季度产出为 2021–2025 年的 8 倍；PR 获得实质评审意见的比例从 16% 升到 54%。印证：S1（"About the playbook"/bottleneck 段）、S2（开篇数据）。`[F]`

3. **"同一类指令该放哪"是资产质量的第一性问题**。Claude Code 明确把指令分成 7 种载体（CLAUDE.md / rules / skills / subagents / hooks / output styles / system prompt 追加），差别在**加载时机、压缩后是否存活、上下文成本、权威度**；CLAUDE.md 是"永远加载、成本最高"，skills 是"按需加载、成本低"，hooks 是"确定性执行、绕过压缩"。把流程写进 CLAUDE.md 是典型的错误放置。印证：S4（七方法对比表）、S5（"multi-step procedure → skill or path-scoped rule"）、S30（progressive disclosure）。`[F]`

4. **MCP 的安全基线已被 spec 写成硬约束**：服务端 **MUST** 校验全部工具输入、实施访问控制、限流、清洗输出；客户端 **SHOULD** 对敏感操作要求用户确认、调用前展示参数、校验结果、设超时、留审计日志；**MUST NOT** 做 token passthrough。印证：S12（Tools · Security Considerations）、S13（Security Best Practices）。`[F]`

5. **工具描述（tool description）是新的攻击面，也是新的"文档质量"指标**。Invariant Labs 的 tool poisoning / tool shadowing / rug pull 三类攻击均通过工具描述与跨 server 引用实现；mcp-scan 用 E001–E006 + W001–W013 + TF001/TF002 把它变成可扫描的规则集，并用工具哈希做 tool pinning 防 rug pull。印证：S14、S15、S16。`[F]`

6. **组合风险 > 单点风险**：单个工具都良性，但"私有数据 + 不可信内容 + 对外发送"三者同处一个上下文即构成泄露闭环（Simon Willison 的 lethal trifecta），mcp-scan 把它工程化为 TF001 Data Leak Toxic Flow / TF002 Destructive Toxic Flow。印证：S17（`[S]` 原始提出）、S16（`[F]` 工程化编码）。**推断**：诊断应把"同一会话可同时触达三类能力"作为独立规则，而非逐 server 打分。

7. **命令/技能/子代理的编写规范已高度收敛到同一套"面向模型写作"的原则**：描述写"何时触发"而不是"我是什么"、用第三人称、正文短、细节拆文件、有明确输入契约和验收。印证：S9（description 规则、SKILL.md <500 行、禁止 time-sensitive）、S6（subagent description 写委派时机、总量超 15k token 告警）、S7（命令=技能，`description` 决定自动加载）。`[F]`

8. **记忆文件的核心矛盾是"永远加载"与"必然腐化"**：官方给的边界是根 CLAUDE.md <200 行、auto memory 只注入前 200 行或 25KB；社区独立观测到约 150–200 行后遵循率明显下降。且记忆被官方明确定性为**上下文而非强制配置**，要"硬门禁"必须用 hook。印证：S5、S4（"give it an owner, review changes like code"）、S3（CLAUDE.md 定位）。`[F]` + `[S]`（社区阈值，单源）

9. **跨工具格式正在收敛到三条事实标准**：`AGENTS.md`（60k+ 开源项目使用，Codex/Cursor/TRAE/Claude Code 均读）、`SKILL.md`（Agent Skills，Claude Code / TRAE / Cursor 均支持，Claude Code 与 Cursor 都把"自定义命令"合并进 skills）、`.mcp.json` / `mcp.json` 风格配置（各工具文件名与位置不同）。这直接决定 AssetPlex 归一化诊断的难度：**命令/技能/规则可高置信归一，MCP 与子代理需按工具适配**。印证：S27（AGENTS.md）、S7（commands 并入 skills）、S23（Cursor 迁移命令到 skills）、S19（TRAE `.trae/skills`）。`[F]`

---

## 1 来源盘点表

| # | 来源 | 类型 | 证据级 | 用于支撑 |
|---|---|---|---|---|
| S1 | The AI-native SDLC playbook（Claude Blog，2026-08-21） | 官方方法论 | F | SDLC 六阶段、工件链、hooks 作闸门、连续 eval |
| S2 | How Anthropic secures its AI-native SDLC（2026-07-21） | 官方实践 | F | 安全左移、最小权限/爆炸半径、多窄职责评审 agent、人工问责 |
| S3 | Claude Code Best Practices（Anthropic Engineering） | 官方指南 | F | CLAUDE.md 该写什么、工作流原则 |
| S4 | Steering Claude Code: CLAUDE.md / skills / hooks / subagents（2026-06-18） | 官方指南 | F | 七种指令载体对比、CLAUDE.md <200 行 + owner、growth 问题 |
| S5 | Claude Code Docs · How Claude remembers your project | 官方文档 | F | CLAUDE.md 何时加/写什么、200 行、冲突、prompt-audit、auto memory 200 行/25KB |
| S6 | Claude Code Docs · Create custom subagents | 官方文档 | F | frontmatter、工具白名单、description 预算 15k、作用域优先级 |
| S7 | Claude Code Docs · Skills（含 custom commands） | 官方文档 | F | 命令并入 skill、SKILL.md 结构、`disable-model-invocation` |
| S8 | Claude Code Docs · Security | 官方文档 | F | 不审计第三方 MCP、不可信内容处理、项目级 MCP 审批 |
| S9 | Skill authoring best practices（platform.claude.com） | 官方文档 | F | 描述第三人称、<500 行、禁 time-sensitive、渐进披露、引用不嵌套 |
| S10 | Writing effective tools for agents（Anthropic Engineering，2025-09-11） | 官方方法论 | F | 工具选择/合并、命名空间、返回高信号、评测驱动 |
| S11 | Define tools（platform.claude.com） | 官方文档 | F | 描述 3–4 句、参数含义、`input_examples`、响应精简 |
| S12 | MCP Spec · Tools（2025-06-18） | 规范 | F | 输入校验/访问控制/限流/输出清洗、客户端确认 |
| S13 | MCP Spec · Security Best Practices | 规范 | F | confused deputy、token passthrough、SSRF、会话劫持、scope 最小化 |
| S14 | MCP-Scan Overview（Invariant Labs） | 官方工具文档 | F | 扫描能力清单、tool pinning、proxy 运行时监控 |
| S15 | MCP Security Notification: Tool Poisoning Attacks | 官方安全通报 | F | 攻击面与缓解（pin、跨 server 边界） |
| S16 | MCP-Scan · Issue Code Reference | 官方规则集 | F | E001–E006 / W001–W013 / TF001–TF002 逐条定义 |
| S17 | The lethal trifecta for AI agents（Simon Willison） | 安全观点 | S | 三类能力组合即泄露闭环（后被 S16 工程化） |
| S18 | TRAE Docs · Rules | 官方文档 | F | 全局/项目规则路径、AGENTS.md 兼容 |
| S19 | TRAE Docs · Skills | 官方文档 | F | `.trae/skills`、`~/.trae/skills`、`.agents/skills` 优先级 |
| S20 | TRAE Docs · Create and manage custom agents | 官方文档 | F | 自定义智能体含提示词 + 工具/MCP 选择 |
| S21 | TRAE Docs · Add MCP servers | 官方文档 | F | 项目级 `.trae/mcp.json` |
| S22 | Cursor Docs · Rules | 官方文档 | F | `.cursor/rules/*.mdc`、`description/globs/alwaysApply`、<500 行、AGENTS.md 嵌套 |
| S23 | Cursor Docs · Agent Skills | 官方文档 | F | 支持 Agent Skills；命令/规则可迁移为 skill |
| S24 | Cursor Blog · Best practices for coding with agents | 官方实践 | F | `.cursor/commands/` 单职责命令示例 |
| S25 | Codex Docs · Custom instructions with AGENTS.md | 官方文档 | F | 发现顺序、override 文件、32KiB 上限 |
| S26 | Codex Docs · MCP | 官方文档 | F | `config.toml` `[mcp_servers.*]`、工具白/黑名单、审批模式、`instructions` 字段 |
| S27 | agents.md | 开放格式主页 | F | "README for agents"、跨工具兼容、60k+ 项目 |
| S28 | GitHub Spec Kit 文档 | 官方工具 | F | `/speckit.*` 命令与 spec/plan/tasks 工件 |
| S29 | Microsoft Learn · Spec-Driven Development with Spec Kit | 教学材料 | F | SDD 阶段 ↔ 命令 ↔ 产物的一一映射 |
| S30 | The new rules of context engineering（Claude Blog） | 官方观点 | F | CLAUDE.md 轻量、多写 gotchas、渐进披露 |
| S31 | Lessons from building Claude Code: How we use skills（Claude Blog） | 官方观点 | F（摘要级） | description 是"触发条件"而非摘要；文件系统即渐进披露 |
| S32 | MCP & Agentic Skill Supply Chain Security（PABCD 社区） | 社区清单 | S | 版本 pin、lockfile、更新当依赖 PR 审 |
| S33 | Equipping agents for the real world with Agent Skills（Anthropic Engineering） | 官方方法论 | F | SKILL.md 过大要拆、代码兼作工具与文档 |
| S34 | Writing CLAUDE.md（NisAI 社区指南） | 社区经验 | S | 约 150–200 行后遵循率下降的独立观测 |

> 说明：S34 与 S5 的 200 行建议方向一致但来源独立，因此「200 行」结论可视为双源；S32 与 S15 分别从"检查清单"和"攻击通报"角度支持"版本固定"，也构成双源（`[F]`+`[S]`）。

---

## 2 最佳实践

### 2.1 AI-native SDLC：什么算"把 AI 用对了"

**六阶段与工件（S1、S2、S28、S29）**

| 阶段 | 传统 | AI-native 做法 | 阶段产物（提交入库） |
|---|---|---|---|
| Plan | 需求由委员会/研讨会收敛 | 提出者与 AI 头脑风暴 → `intent.md`（问题/结果/影响面/约束/开放问题） | `intent.md` |
| Design | 分析师写 spec，设计师再解析 | 一次会话内完成需求+设计，受 skills（品牌/安全/合规/UX）约束，标注风险点 | `spec.md` |
| Build | 手写测试与代码，文档事后补 | AI 生成测试与代码；制度知识沉淀为版本化 `CLAUDE.md` + skills；plan mode 先出计划再动手 | `plan.md` + diff + tests |
| Test | 阶段边界上的 QA 闸门 | 连续 eval 织入实现；多窄职责 agent 并行评审 + 确定性工具（SAST/lint/type） | PR + review findings |
| Deploy | 人逐行审 + 周期性治理 | 分层 agentic review，人工只保留给受监管/关键代码；hooks 作审批闸门 | 合并记录 + 审批日志 |
| Maintain | 人盯生产 | agent 监控；越界即诊断并回写成新的 `intent.md` | incident record → 下一个 intent |

**原则（每条都给双源）**

1. **规格先行、计划先行**：先在只读的 plan 模式产出计划，人修正后才允许改代码；计划文件提交入库供后续阶段对照。`[S1][S28][S29]` `[F]`
2. **每阶段一个可读工件，工件即闸门**：上一阶段被接受的工件触发下一阶段（accepted `intent.md` → spec；merged PR → pipeline）。`[S1][S2]` `[F]`
3. **人负责判断，不负责转录**：人的注意力集中在"agent 标记出来的东西"，而不是从零读起；审批须留可审计的理由与信号。`[S1][S2]` `[F]`
4. **评审要"分而治之"而不是"一个大而全的超级评审 agent"**：Anthropic 用多个各自窄焦点、各自上下文窗口的评审 agent，理由是偏见不共享、互相兜底、精力不摊薄。`[S2][S10]` `[F]`（S10 的"工具应服务特定高价值工作流、避免薄封装 API"是同一思路）
5. **发现即回写（closed loop）**：某类 bug 一旦被识别，就更新对应的指令文件（CLAUDE.md / skill / rule），让下一批代码不再犯。`[S2][S5]` `[F]`
6. **最小权限与爆炸半径**：身份边界、远程 VM、egress allowlist；面向不可信输入的 agent 尤其需要。`[S2][S13]` `[F]`
7. **Done 必须可机械验证**：测试通过 + 类型检查 + 构建 + 对照 spec 场景逐条验证；"验证"要真跑应用而不是只跑单测（Claude Code 的 `/run`、`/verify` 就是把这条产品化）。`[S6][S1]` `[F]`（S6 的 `/verify` 说明见 S7 摘要段）

> 判定"用对了"的一句话版：**能不能在没有原作者口头解释的情况下，从 git 历史重建"为什么做、做成什么样、谁批的"。** 能 → 工件链完整；不能 → 只是把 IDE 换成了聊天框。`[S1]` + 推断

---

### 2.2 MCP：配置与服务编写

**(a) 服务端（写 MCP server 的人）**

- **工具集要"少而复合"，不是 API 的薄封装**：不要 `list_users`+`list_events`+`create_event`，要 `schedule_event`；不要 `read_logs`，要 `search_logs`（只返回相关行+上下文）。太多/重叠工具会分散 agent 注意力。`[S10][S11]` `[F]`
- **命名空间**：跨服务时加前缀（`github_list_prs`、`slack_send_message`），避免选择歧义。`[S10][S11]` `[F]`
- **描述是主要杠杆**：至少 3–4 句，写清"做什么 / 何时该用与不该用 / 每个参数含义与影响 / caveats"；复杂入参配 `input_examples`。`[S11]` + `[S10]`（"prompt-engineer your tool descriptions"、参数名要无歧义如 `user_id` 而非 `user`）`[F]`
- **返回高信号**：只回语义化、稳定的标识与下一步推理必需字段；臃肿响应浪费上下文。`[S10][S11]` `[F]`
- **硬性安全**：校验所有输入、访问控制、限流、清洗输出（spec 用 MUST）；错误分协议错误与 `isError: true` 两类。`[S12]` `[F]`
- **不自引用别的 server**：跨 server 引用会带来劫持风险（mcp-scan E002）。`[S16][S15]` `[F]`
- **认证**：不做 token passthrough（spec 明确 MUST NOT）；注意 confused deputy / SSRF / 会话劫持 / scope 最小化四类攻击的缓解要求。`[S13]` `[F]`
- **`instructions` 字段要自包含**：Codex 会读取 server 初始化返回的 `instructions` 作全 server 级指导，建议前 512 字符即把最关键的约束说清。`[S26]`（单源，`[F]` 但仅 Codex 视角）

**(b) 客户端（用 MCP 的人 / AssetPlex 诊断对象）**

- **只装你审过的 server**：Anthropic 明说"我们不做 MCP server 的安全审计与管理"，推荐自建或选可信供应商。`[S8]` + `[S15]`（第三方 server 是投毒主要载体）`[F]`
- **做工具指纹基线**：首次扫描记录工具描述哈希，之后任何字符变化即告警（防 rug pull，mcp-scan W003）。`[S14][S16]` `[F]`
- **静态扫描 + 运行时监控双管**：`mcp-scan scan`（静态）+ `mcp-scan proxy`（运行时代理，含 PII/密钥检测、工具限制）。`[S14]` `[F]`
- **避开 lethal trifecta**：不要在同一个"能力池"里同时具备 私有数据读取 + 不可信内容摄入 + 对外发送。`[S17]` `[S16]`（TF001/TF002 是它的工程化）`[S]→[F]`
- **凭证不入库**：密钥走环境变量/密钥管理器，配置里只放引用；mcp-scan 对"把凭证直接塞进模型上下文"（W007）和"硬编码密钥"（W008）都会告警。`[S16]` + `[S32]`（"no latest/no auto-install"、更新按依赖 PR 审）`[F]`+`[S]`
- **版本固定**：pin 精确版本，禁止 `@latest`；server 升级当依赖变更审。`[S15][S32]` `[F]`+`[S]`
- **工具级白/黑名单与审批模式**：Codex 提供 `enabled_tools` / `disabled_tools` / `default_tools_approval_mode`（auto/prompt/approve）；TRAE 自定义智能体可勾选允许调用的 MCP Server 与工具。`[S26][S20]` `[F]` —— 说明"最小代理权限"已是主流客户端的一等配置项。

---

### 2.3 Commands（斜杠命令 / 自定义命令）

**格式现状（重要，影响归一化）**

- Claude Code：**自定义命令已并入 skills**。`.claude/commands/deploy.md` 与 `.claude/skills/deploy/SKILL.md` 都产生 `/deploy`，行为一致；老文件继续可用，但新工作推荐 skill（因为能带支持文件、能控制"谁可调用"）。`[S7]` `[F]`
- Cursor：`@cursor/commands` 已被当作可迁移资产，官方提供 `/migrate-to-skills` 把 user/workspace 命令转成带 `disable-model-invocation: true` 的 skill。`[S23]` `[F]`
- Codex：自定义 prompt 向 skills 迁移，调用形式 `/prompts:name`；内置斜杠命令仍在。`[S 由 clients.dev 汇总]` —— **单源，`[S]`，需后续核验**
- TRAE：命令能力由 skill 承担（`.trae/skills/<name>/SKILL.md`，兼容 `.agents/skills/`）。`[S19]` `[F]`

**编写规范**

1. **单职责**：一个命令只做一件事，名字即动作（Cursor 官方示例：`/fix-issue [number]`、`/review`、`/update-docs`）。`[S24]` `[F]`
2. **`description` 写"触发条件"而不是"内容摘要"**：它在会话开始时进入系统提示，是模型判断"要不要自动调用"的唯一依据；写"Summarizes uncommitted changes… Use when the user asks what changed, wants a commit message, or asks to review their diff."。`[S7][S9][S31]` `[F]`
3. **第三人称、避免"我可以帮你…"**：描述被注入系统提示，视角不一致会造成发现失败。`[S9]`（+ S7 的 description 语义）`[F]`（S9 为硬要求，双源程度中等）
4. **有输入契约**：显式声明参数（`$ARGUMENTS`、`[number]`、必填/可选），并定义"缺参时怎么办"。`[S7][S24]` `[F]`
5. **有验收**：命令末尾写清成功判据（跑哪些测试/检查、退出条件、输出形态）。`[S9]`（"concrete, not abstract"、示例优于抽象）+ S1（测试即证据）`[F]`
6. **正文短、细节外置**：`SKILL.md` 正文 <500 行，重内容拆到支持文件，引用只深一层。`[S9][S33]` `[F]`
7. **能注入动态上下文就用**：Claude Code 的 `` !`git diff HEAD` `` 会在模型读到前把命令输出内联，减少"猜"。`[S7]`（单源，`[F]`）
8. **不写 time-sensitive 信息**：不要"截至 2026-10 使用 X 版本"，过期即误导；把历史写法放到 old patterns 段。`[S9]` `[F]`

---

### 2.4 Agents（子代理 / 自定义智能体）

**Claude Code 的事实基线（S6）**

- 文件：`.claude/agents/*.md`（项目）/ `~/.claude/agents/*.md`（个人），可递归分子目录；身份只由 frontmatter `name` 决定，同目录重名只加载其一（按文件系统读序，不确定）。优先级：managed > `--agents` CLI > 项目 > 用户 > plugin。`[S6]` `[F]`
- frontmatter 关键字段：`name` / `description` / `tools` / `model`（还支持 effort、permission mode、`omitClaudeMd`、预加载 skills、内联 MCP 等）。`[S6]` `[F]`
- **`description` 是委派开关**：Claude 依据它决定何时把任务交给该 subagent；所有非内置 subagent 的 description 合计超 **15,000 token** 会在启动时告警 → 描述要短，细节放系统提示（只有该 agent 运行时才加载）。`[S6]` `[F]`
- **工具限制即权限边界**：内置 Explore / Plan 都是只读（Write/Edit 被禁）；也可用 `permissions.deny` 关掉特定 agent 或整个 Agent 工具。`[S6]` `[F]`

**编写规范（含 TRAE / Cursor 对应物）**

1. **一个 agent 一个焦点**：Anthropic 的评审 agent 每个"designed and scoped to a specific, narrow focus"，理由是偏见独立、互相兜底、不摊薄。`[S2]` + `[S10]` `[F]`
2. **description 只写"何时委派 + 产出什么"，控制在 2–3 句**：既省上下文又提高命中率。`[S6]` `[F]`
3. **最小工具集**：只读任务不给写权限；需要外部能力时才挂 MCP。TRAE 的自定义智能体同样是"提示词 + 工具/MCP 勾选"模型。`[S6][S20]` `[F]`
4. **输出契约明确**：说清返回结构、是否落盘、是否只回摘要（subagent 只有最终消息回到主会话）。`[S6]` `[F]`
5. **成本分级**：探索类可指定便宜模型（如 haiku / sonnet），官方列为"control costs"手段。`[S6]` `[F]`
6. **不在 agent 里塞敏感信息**：agent 文件通常入库共享；密钥、私有路径应外置。`[S8]`（安全基线）+ `[S16]`（W008 硬编码密钥）`[F]`
7. **命名唯一、作用域正确**：项目级入库共享，个人级放 home，别把团队 agent 放个人目录导致队友不可见。`[S6]` `[F]`

---

### 2.5 Memory（长期记忆 / 规则文件）

**该记什么（S5、S3、S30）**

- 同一个错误犯第二次、代码评审抓到 AI 本该知道的事、同一句纠正重复输入、新同事也需要同样上下文 → 才写进去。`[S5]` `[F]`
- 只放"每个会话都需要的事实"：构建/测试命令、目录结构、约定、"永远要做 X"的规则。`[S5][S3]` `[F]`
- **多写 gotchas，少写显而易见的东西**：token 预算应花在"看文件系统猜不到"的陷阱上。`[S30]` + `[S5]`（"avoid stating the obvious"）`[F]`
- 指令要**具体到可验证**："Use 2-space indentation" 而非 "Format code properly"；"Run `npm test` before committing" 而非 "Test your changes"。`[S5]` `[F]`

**不该记什么**

- 多步流程 / 只对某目录有效的约定 → 迁到 skill 或 path-scoped rule。`[S5][S4]` `[F]`
- 模型能自己推断的框架常识、显而易见的目录说明。`[S30][S5]` `[F]`
- 过期信息（版本号、日期、已删除文件/命令、"目前使用 X"）。`[S5]`（prompt-audit 专查"引用不存在的文件/命令"）+ `[S9]`（time-sensitive）`[F]`
- 会漂移的私有信息（沙箱 URL、测试数据、个人偏好）→ 放 `CLAUDE.local.md` 并 gitignore。`[S5]` `[F]`

**怎么防腐化**

- **长度**：根 CLAUDE.md 目标 <200 行；超了把"只影响局部"的内容下沉到 path-scoped rules（只在该目录被读写时加载）。`[S5][S4]` `[F]`；社区独立观测约 150–200 行后遵循率下降 `[S34]` `[S]`
- **一致性**：两条指令互相矛盾时模型可能任选其一 → 定期清理冲突（含嵌套 CLAUDE.md 与 `.claude/rules/`）。`[S5]` `[F]`
- **有 owner、像代码一样 review**：否则"每个团队都往里加、没人删"，成本对所有工程师叠加。`[S4]` `[F]`
- **自动审计**：`/doctor prompt-audit` 检查过期/冲突指令、指向不存在文件的引用、写给旧模型的措辞，输出 diff 不直接改。`[S5][S7]` `[F]`
- **它不是强制配置**：CLAUDE.md 与 auto memory 都是"context, not enforced configuration"；要硬拦截必须用 PreToolUse hook。`[S5][S4]` `[F]`
- **auto memory 有硬截断**：只注入前 200 行或 25KB。`[S5]`（单源 `[F]`）
- **分层而非堆叠**：Codex 的 32KiB 合并上限、Claude 的 import 深度 4 跳、Cursor 的 500 行建议，都在说明"记忆文件不是无限的容器"。`[S25][S5][S22]` `[F]`

---

### 2.6 跨工具格式差异（归一化诊断用）

| 资产类别 | Claude Code | TRAE | Cursor | Codex |
|---|---|---|---|---|
| 规则/记忆（项目） | `CLAUDE.md` / `.claude/CLAUDE.md`；`.claude/rules/*.md`（可 `paths` 限定） | `.trae/rules/*.md`（如 `project_rules.md`）；兼容 `AGENTS.md`、`CLAUDE.md` | `.cursor/rules/*.mdc`（必须 `.mdc`；`.md` 被忽略） | `AGENTS.md`（根到 cwd 逐层合并）；`AGENTS.override.md` 优先；默认 32KiB 上限 |
| 规则/记忆（全局） | `~/.claude/CLAUDE.md`、`~/.claude/rules/`；企业级 managed 路径 | `%userprofile%/.trae/user_rules` | User Rules（应用内配置） | `~/.codex/AGENTS.md`、`AGENTS.override.md` |
| 规则元数据 | 无 frontmatter（除 rules 的 paths） | 无（Markdown 纯文本） | `description` / `globs` / `alwaysApply` 三旋钮 | 无 |
| 命令 | `.claude/commands/*.md`（旧）/ `.claude/skills/<n>/SKILL.md`（推荐） | `.trae/skills/<n>/SKILL.md` | `.cursor/commands/*.md` → 可迁移为 skills | prompts → skills（`/prompts:name`）`[S]` |
| 技能 | `.claude/skills/`、plugin、`~/.claude/skills/` | `.trae/skills/`、`~/.trae/skills/`、`.agents/skills/`（同名时 `.trae` 优先） | Agent Skills 目录（`/migrate-to-skills`） | Skills（`AGENTS.md` 之外的复用单元）`[S]` |
| 子代理 | `.claude/agents/*.md` + frontmatter（name/description/tools/model…） | 自定义智能体：名称 + 提示词 + 工具/MCP 勾选（应用内配置） | 以 rules/commands/skills 组合为主；plugin 可带 agents | 无独立 subagent 文件，靠 `AGENTS.md` 指导 |
| MCP 配置 | `.mcp.json`（项目，入库需审批）+ 用户级 | `.trae/mcp.json` | `.cursor/mcp.json` | `~/.codex/config.toml` 的 `[mcp_servers.*]`，可 `.codex/config.toml` 项目级 |
| MCP 权限粒度 | 工具权限规则 / managed MCP 限制 | 智能体级勾选 MCP Server 与工具 | 应用内开关 | `enabled_tools` / `disabled_tools` / per-tool `approval_mode` |

**归一化结论（供诊断引擎设计）**

- 可高置信归一：`AGENTS.md` / `CLAUDE.md` / `.trae/rules` / `.cursor/rules` → 统一为「常驻指令（remember）」；其质量规则（长度、具体性、无过期、无冲突）跨工具一致。`[S27][S5][S22][S18]` `[F]`
- 可中置信归一：`SKILL.md` 家族 → 统一为「过程资产（command/skill）」；frontmatter 字段义近似（`name`/`description`，Claude 额外有 `disable-model-invocation` 等扩展）。`[S7][S19][S23][S9]` `[F]`
- 需按工具适配：MCP 配置文件名/结构/Schema 键名不同（`.mcp.json` vs `mcp.json` vs `config.toml` 的 TOML 表），且"工具许可"表达方式不同。`[S21][S22][S26]` `[F]`
- 需按工具适配：子代理（Claude 有独立 frontmatter 文件；TRAE 为应用内对象；Codex 无此概念）→ 诊断只能覆盖"有文件形态"的工具，其余降级为"不支持检测"。`[S6][S20][S25]` `[F]`

---

## 3 反模式

| # | 反模式 | 为什么错 | 来源 | 可检测信号 |
|---|---|---|---|---|
| A1 | 把 SOP/多步流程写进根 CLAUDE.md | 每会话每工程师都付费，稀释真正重要的指令 | S4、S5 | 单文件 >200 行；含步骤序号列表/长代码块 |
| A2 | 记忆文件只增不删、无 owner | 冲突与过期必然累积，模型可能任选矛盾指令 | S5、S4 | 出现"已废弃/旧方案"未删；同一约束两处不同表述 |
| A3 | 用记忆文件当硬门禁 | 它是上下文不是配置，模型可以不听 | S5、S4 | 写着"必须/禁止"但无 hook 对应 |
| A4 | 命令/技能描述写成"我是一个…助手" | 描述是触发条件，视角错会导致不被调用 | S9、S7 | 含"I can help"、"You can use"、第一/第二人称 |
| A5 | 一个"超级 agent"包办评审/修复/测试 | 偏见集中、精力摊薄、无法互相兜底 | S2、S10 | 工具列表覆盖写+删+发；prompt 含 3 个以上不同目标 |
| A6 | 给只读任务开写权限 | 爆炸半径无谓放大 | S6、S2 | 审查/检索类 agent 的 `tools` 含 Write/Edit/Bash 全量 |
| A7 | 把 MCP API key 明文写进配置文件并入库 | 一次提交即永久泄露（历史难清） | S16（W008）、S32 | 配置值匹配 `sk-`/`ghp_`/`AKIA`/`xoxb-` 等；`"env": {"*_KEY": "实值"}` |
| A8 | 用 `@latest` / 不固定版本的 MCP server | 上游变更可静默改变 agent 行为（rug pull 的合法版本） | S15、S32 | `npx -y pkg` 无 `@x.y.z`；docker tag 为 latest |
| A9 | 工具描述里夹带"ignore previous / you must / important: always…" | 这就是 tool poisoning 的形态，可能来自第三方 | S16（E001/E003/W001）、S15 | 描述含祈使句指令、系统提示口吻、跨 server 工具名 |
| A10 | 同时装"读私密文件 + 抓网页 + 发消息"三类 server | 构成 lethal trifecta，注入即可外泄 | S17、S16（TF001） | 能力归类后三类齐备且无隔离 |
| A11 | 工具薄封装 REST API（`list_*` 全量返回） | 浪费上下文、诱导暴力遍历 | S10 | 存在 `list_`/`get_all`；无分页/无过滤参数 |
| A12 | 跨工具复制资产时直接照搬路径/变量 | 各工具目录与 frontmatter 不同，照搬即失效 | S7、S22、S25 | `.claude/commands/x.md` 出现在 Cursor 项目等 |
| A13 | 技能正文塞成长文档（>500 行） | 加载即挤占上下文，细节该按需读 | S9、S33 | 行数阈值；references 未拆分 |
| A14 | 把"当前版本/日期"写进技能或规则 | 迅速过期并误导后续会话 | S9、S5 | 命中年份/版本号 + "currently/目前" 组合 |

---

## 4 可执行检查清单

> 每条格式：`ID | 检查项 | 判定信号（可机械化） | 严重度 | 证据`
> 严重度：**P0** = 安全或功能失效，应立即修；**P1** = 显著降低效果/可维护性；**P2** = 优化项。

### 4.1 AI-native SDLC 原则（7 条）

| ID | 检查项 | 判定信号 | 级别 | 证据 |
|---|---|---|---|---|
| SDLC-01 | 变更前存在书面 spec/plan，且经人确认 | 仓库无 `spec.md`/`plan.md`/`intent.md` 等工件，或工件 mtime 晚于代码 diff | P1 | S1、S28 |
| SDLC-02 | 工件链完整、可追溯 | 从 commit 无法回溯"需求→设计→任务→评审"；PR 描述为空或仅"fix" | P1 | S1、S2 |
| SDLC-03 | 计划与执行分离（先只读探索再改） | 首轮即大范围写文件；无 plan 阶段记录 | P1 | S1、S29 |
| SDLC-04 | Done 有机械判据 | 无测试命令/CI 配置，或"完成"仅凭人眼 | P0 | S1、S2 |
| SDLC-05 | 评审分层而非单点 | 仅 1 个评审主体（人或单个 agent），无确定性检查（lint/type/SAST） | P1 | S2、S10 |
| SDLC-06 | 缺陷回写到指令资产 | 出现过同类 bug 但 rules/skills 未更新 | P1 | S2、S5 |
| SDLC-07 | 高风险操作有硬闸门 | 危险命令无 hook/审批；`permissions` 允许全量 Bash | P0 | S2、S5 |
| SDLC-08 | 最小权限与爆炸半径受控 | agent 可无限制访问全盘/外网；无 egress 限制 | P0 | S2、S13 |

### 4.2 MCP（10 条）

| ID | 检查项 | 判定信号 | 级别 | 证据 |
|---|---|---|---|---|
| MCP-01 | 配置无明文密钥 | 值匹配 `sk-`、`ghp_`、`AKIA`、`xoxb-`、`-----BEGIN`；`env` 中出现长随机串 | P0 | S16/W008、S12 |
| MCP-02 | 服务器版本固定 | `npx -y pkg`/`uvx pkg` 无精确版本；`latest` tag；无 lockfile | P1 | S15、S32 |
| MCP-03 | 服务器来源可信且有记录 | 无来源 URL/维护者/审核日期；指向短链或 pastebin | P0 | S8、S15 |
| MCP-04 | 工具描述无指令性/投毒语言 | 描述含 "ignore"、"you must"、"crucial"、系统提示句式、其他 server 工具名 | P0 | S16/E001-E003/W001 |
| MCP-05 | 工具描述信息充分 | 描述 <3 句或缺"何时不该用"；参数无说明 | P1 | S11、S10 |
| MCP-06 | 工具有命名空间且非薄封装 | 无前缀的通用名（`search`/`list`）；同类 `list_*` 泛滥 | P2 | S10、S11 |
| MCP-07 | 输入 schema 严格 | 全部参数 `type: string` 自由文本；无 `required`/`enum`/`format` | P1 | S12、S11 |
| MCP-08 | 破坏性/外发工具默认不自动执行 | 无 `approval_mode`/确认；删除、发送、支付类工具与只读工具同权 | P0 | S12、S16/TF002 |
| MCP-09 | 无 lethal trifecta 组合 | 会话内同时存在私密数据源 + 不可信内容源 + 外部写入通道 | P0 | S17、S16/TF001 |
| MCP-10 | 有工具指纹基线 | 无 hash 记录文件；无 `mcp-scan` 类扫描入 CI | P1 | S14、S16/W003 |
| MCP-11 | 未开启 token passthrough | 配置/代码把上游 token 直接转发给下游 API | P0 | S13（MUST NOT） |
| MCP-12 | 无效 server 被禁用而非删除后遗忘 | `enabled=false` 缺失但仍有高权限配置 | P2 | S26 |

### 4.3 Commands（8 条）

| ID | 检查项 | 判定信号 | 级别 | 证据 |
|---|---|---|---|---|
| CMD-01 | 单职责 | 一个命令文件含 ≥3 个不相关目标动词（评审+修复+发布） | P1 | S24、S10 |
| CMD-02 | `description` 是触发条件 | 缺 description；或写成摘要（"A command that…"）而无"Use when…" | P1 | S7、S9、S31 |
| CMD-03 | 描述第三人称 | 含 "I can help"、"You can use this" | P2 | S9 |
| CMD-04 | 输入契约显式 | 引用 `$ARGUMENTS`/`[param]` 但未定义类型、必填性、缺省行为 | P1 | S7、S24 |
| CMD-05 | 有验收步骤 | 正文无"运行 X 检查/满足 Y 即完成" | P1 | S9、S1 |
| CMD-06 | 长度与拆分合理 | 正文 >500 行且无 references | P2 | S9、S33 |
| CMD-07 | 无 time-sensitive 内容 | 含年份/版本 + "currently/目前/现在" | P2 | S9 |
| CMD-08 | 使用正确格式与位置 | 在 Cursor 项目里用 `.claude/skills`；Cursor 下用 `.md` 而非 `.mdc` 当规则 | P1 | S7、S22、S23 |

### 4.4 Agents（9 条）

| ID | 检查项 | 判定信号 | 级别 | 证据 |
|---|---|---|---|---|
| AGT-01 | 单一焦点 | prompt 覆盖 3+ 无关职责；名称为 `helper`/`assistant` 泛化 | P1 | S2、S10 |
| AGT-02 | `description` 短且写委派时机 | >3 句/超长；所有 agent 描述合计接近 15k token | P1 | S6 |
| AGT-03 | 工具最小化 | 只读用途却含 Write/Edit；Bash 无限制 | P0 | S6、S2 |
| AGT-04 | 输出契约明确 | 未说明返回结构/是否落盘/是否只回摘要 | P1 | S6 |
| AGT-05 | 成本分级 | 纯检索/解析任务仍指定最强模型 | P2 | S6 |
| AGT-06 | 无敏感信息 | 文件内含 key/token/私有绝对路径/客户名 | P0 | S8、S16/W008 |
| AGT-07 | 命名唯一、作用域正确 | 同目录重名；团队 agent 放在 `~/.claude/agents` | P2 | S6 |
| AGT-08 | 不与主上下文重复搬运 | prompt 要求"把全部日志贴回来" | P2 | S6 |
| AGT-09 | 有触发示例或反例 | 无任何"何时不要用我"的说明 | P2 | S9、S6 |

### 4.5 Memory（9 条）

| ID | 检查项 | 判定信号 | 级别 | 证据 |
|---|---|---|---|---|
| MEM-01 | 只放常驻事实 | 含多步流程/清单式 SOP | P1 | S5、S4 |
| MEM-02 | 指令具体可验证 | 出现 "properly"/"clean"/"good" 等不可判定形容词 | P1 | S5 |
| MEM-03 | 不写模型能推断的内容 | 大段框架介绍、目录逐条解释 | P2 | S30、S5 |
| MEM-04 | 长度受控 | 根文件 >200 行且未拆分；rules 单文件 >500 行（Cursor 规范） | P1 | S5、S22、S34 |
| MEM-05 | 无过期信息 | 引用不存在的文件/命令；含已下线版本号 | P1 | S5、S9 |
| MEM-06 | 无自相矛盾 | 同一约束在不同文件/章节表述冲突 | P0 | S5 |
| MEM-07 | 有 owner 与评审记录 | 无 CODEOWNERS/提交说明；长期单方面追加 | P2 | S4 |
| MEM-08 | 私密信息本地化 | `CLAUDE.local.md` 未 gitignore；规则含真实用户名/内网地址 | P0 | S5、S8 |
| MEM-09 | 定期审计 | 从未跑过 prompt-audit 类检查；无审计记录 | P2 | S5、S7 |

### 4.6 清单 → 诊断规则的落地映射

| AssetPlex 资产类别 | 主要适用清单 | 归一化难度 | 备注 |
|---|---|---|---|
| `identity` | 无直接对应（建议自建：目标读者、语气、禁区） | — | 本调研未覆盖，需另立规则 |
| `rule` | MEM-01…MEM-09 + A1/A2/A3 | 低（各工具都是 markdown 文本） | 长度/具体性/冲突可纯静态判定 |
| `skill` | CMD-01…CMD-08 + 技能类（500 行、渐进披露） | 低-中（SKILL.md 家族） | frontmatter 字段有工具差异 |
| `command` | CMD-01…CMD-08 | 中（Claude/Cursor 向 skills 收敛） | 旧 `.claude/commands` 仍要兼容 |
| `agent` | AGT-01…AGT-09 | 高（仅 Claude 有文件形态） | 无文件形态的工具降级为"不支持" |
| `mcp` | MCP-01…MCP-12 | 高（三套配置 Schema） | 建议先做"密钥/版本/描述"三项通用规则 |
| `memory` | MEM-01…MEM-09 | 中（CLAUDE.md / AGENTS.md / rules 三种落点） | 需先做"哪份文件生效"的解析 |

---

## 5 来源清单

> 全部于 **2026-11-14** 检索；`F` = 官方/可验证一手，`S` = 二手/观点。链接为检索结果中的实际 URL。

| # | 标题 | URL | 级 |
|---|---|---|---|
| S1 | The AI-native SDLC playbook（2026-08-21） | https://claude.com/blog/the-ai-native-sdlc-playbook | F |
| S2 | How Anthropic secures its AI-native software development lifecycle（2026-07-21） | https://claude.com/resources/articles/how-anthropic-secures-its-ai-native-software-development-lifecycle | F |
| S3 | Claude Code Best Practices | https://www.anthropic.com/engineering/claude-code-best-practices | F |
| S4 | Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents（2026-06-18） | https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more | F |
| S5 | How Claude remembers your project（Claude Code Docs · Memory） | https://code.claude.com/docs/en/memory | F |
| S6 | Create custom subagents（Claude Code Docs） | https://code.claude.com/docs/en/sub-agents | F |
| S7 | Extend Claude with skills（Claude Code Docs；含 custom commands 合并说明） | https://code.claude.com/docs/en/slash-commands | F |
| S8 | Security（Claude Code Docs） | https://code.claude.com/docs/en/security | F |
| S9 | Skill authoring best practices | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | F |
| S10 | Writing effective tools for agents — with agents（2025-09-11） | https://www.anthropic.com/engineering/writing-tools-for-agents | F |
| S11 | Define tools（Claude Platform Docs） | https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools | F |
| S12 | Tools（MCP Specification 2025-06-18） | https://modelcontextprotocol.io/specification/2025-06-18/server/tools | F |
| S13 | Security Best Practices（MCP Docs） | https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices | F |
| S14 | MCP-Scan: A security scanner for MCP | https://invariantlabs-ai.github.io/docs/mcp-scan/ | F |
| S15 | MCP Security Notification: Tool Poisoning Attacks | https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks | F |
| S16 | Issue Code Reference（mcp-scan） | https://invariantlabs-ai.github.io/docs/mcp-scan/issue-code-reference/ | F |
| S17 | The lethal trifecta for AI agents（2025-06-16） | https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/ | S |
| S18 | 规则（Rule）— TRAE 文档 | https://docs.trae.ai/ide/rules?_lang=zh | F |
| S19 | 技能（Skill）— TRAE 文档 | https://docs.trae.ai/ide/skills?_lang=zh | F |
| S20 | Create and manage custom agents（TRAE Docs） | https://docs.trae.ai/ide/agent | F |
| S21 | Add MCP servers（TRAE Docs） | https://docs.trae.ai/ide/add-mcp-servers | F |
| S22 | Rules（Cursor Docs） | https://cursor.com/docs/rules | F |
| S23 | Agent Skills（Cursor Docs；含 rules/commands 迁移） | https://cursor.com/docs/skills | F |
| S24 | Best practices for coding with agents（Cursor Blog） | https://cursor.com/blog/agent-best-practices | F |
| S25 | Custom instructions with AGENTS.md（Codex Docs） | https://developers.openai.com/codex/guides/agents-md | F |
| S26 | Model Context Protocol（Codex Docs） | https://developers.openai.com/codex/mcp | F |
| S27 | AGENTS.md — a simple, open format | https://agents.md/ | F |
| S28 | Spec-Driven Development Quickstart（Spec Kit） | https://github.github.io/spec-kit/quickstart.html | F |
| S29 | What is GitHub Spec Kit?（Microsoft Learn） | https://learn.microsoft.com/en-au/training/modules/spec-driven-development-github-spec-kit-greenfield-intro/6-introduction-github-spec-kit | F |
| S30 | The new rules of context engineering for Claude 5 generation models | https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models | F |
| S31 | Lessons from building Claude Code: How we use skills | https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills | F |
| S32 | MCP & Agentic Skill Supply Chain Security（社区清单） | https://lidge-jun.github.io/pabcd_initiative/pages/skills/dev-security-mcp-supply-chain.html | S |
| S33 | Equipping agents for the real world with Agent Skills | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills | F |
| S34 | Writing CLAUDE.md: The Memory File That Actually Works（社区） | https://nisai.dev/guides/writing-claude-md-memory/ | S |

---

## 附：本次调研的已知缺口（供后续补齐，不影响现有规则落地）

1. **Codex 自定义 prompt → skill 的迁移细节**仅有二手汇总（clients.dev），官方条目未直接核验 → 相关结论在正文已标 `[S]`。
2. **Cursor 子代理（agents）的文件形态**未取得官方专门文档；`plugin.json` 文档提到 plugin 可含 agents，但项目级路径未确认 → 清单中不设 Cursor 专属 agent 规则。
3. **TRAE 自定义智能体是否可落盘为文件**未确认（文档描述为应用内创建）→ 按"无文件形态"处理。
4. **`identity`（身份/人设）类资产**不在本次范围，无权威外部规范，建议 AssetPlex 自建内部规则。
