# 技能（Agent Skills / SKILL.md）编写质量调研

- 调研日期：2026-11-14
- 适用范围：AssetPlex「资产编写质量诊断」中的 `skill` 类资产（目录 + `SKILL.md`），兼顾 Claude / Claude Code / TRAE / Codex / Cursor 等消费端
- 标记约定：`[F]` = 官方规范、官方文档、官方仓库或可验证学术论文；`[S]` = 二手文章、社区经验、项目自报数据
- 单一来源结论已降级表述；冲突阈值并列给出，不强行取一

---

## 0 核心结论

1. **技能的单位是"目录"，不是"一个 Markdown 文件"**。最小必需是 `SKILL.md`，可选 `scripts/`、`references/`、`assets/`。把技能等同于 markdown 是官方点名的常见误解。`[F]`（Anthropic 工程博客 2025-10-16；Claude Code 官方博客 2026-06-03；规范 agentskills.io）
2. **触发几乎完全由 `name` + `description` 决定**。启动时所有技能的元数据被预加载进系统提示，正文只有在判定相关后才读入。因此 `description` 不是"摘要"，而是"路由键 / 何时该用我"的说明，这是诊断中权重最高的字段。`[F]`（Anthropic 工程博客；技能规范；TRAE 官方文档；Claude Code 官方博客）
3. **渐进披露是硬设计原则**：元数据常驻（约 100 tokens）→ `SKILL.md` 正文按需加载（建议 <500 行 / 1,500–2,000 词）→ 引用文件按需读。引用必须**从 SKILL.md 一层可达**，避免 A→B→C 链式引用。`[F]`（规范；Anthropic 最佳实践；TRAE 最佳实践；Anthropic 官方 skill-creator）
4. **好的技能是"单一职责 + 明确边界 + 可执行步骤 + 结构化 I/O + 失败策略"**。TRAE 官方把它总结为"五个核心标准"，Anthropic 的对应表达是"自由度分级 + 工作流/检查清单 + 反模式清单"。`[F]`（TRAE 最佳实践；Anthropic 最佳实践）
5. **质量必须由评测守护，而不是靠感觉**：先跑"无技能基线"暴露失败点 → 写 3–5 个可复现用例（含应触发/不应触发）→ 写刚好能过评测的最小技能 → 每次修改回归。官方给出的参考指标之一是"相关请求的自动触发率 ≥90%（用 10–20 条测试查询测）"。`[F]`（TRAE 最佳实践；Anthropic Complete Guide；Anthropic skill-creator）
6. **反模式高度集中且可自动检测**：Windows 反斜杠路径、多选项无默认、时效性信息、术语不一致、嵌套引用、正文过长、描述过泛。前四类在 Anthropic 与 TRAE 两套官方文档中同名同义出现。`[F]`
7. **实证上这是真问题**：对 238 个真实 SKILL.md 的研究发现 **99% 以上至少含 1 个 skill smell**，且 smell 一旦引入很少随迭代消失；二手解读称 26 类 smell 中有 11 类出现在 >50% 样本中。→ 诊断功能有实际价值，且默认应假设"用户资产大概率不合格"。`[F]`（arXiv:2607.01456）+ `[S]`（论文解读）
8. **生态里有三种成功范式可直接对照**：官方示例仓库（复杂任务拆 `scripts/` + `references/`）、superpowers（把方法论拆成可组合的单一技能链）、ponytail（单文件"行为约束型"技能 + 自建基准）。`[F]` + `[S]`（ponytail 的性能数字为项目自报）

---

## 1 来源盘点表

| 编号 | 来源 | 类型 | 层级 | 主要覆盖 | 备注 |
|---|---|---|---|---|---|
| S1 | Anthropic Engineering: Equipping agents for the real world with Agent Skills（2025-10-16） | 官方博客 | `[F]` | 技能解剖、三级渐进披露、开发与评估建议、安全 | 最权威的概念来源 |
| S2 | Agent Skills Specification（agentskills.io/specification） | 开放标准 | `[F]` | 字段约束、目录结构、引用规则、校验工具 | 跨工具可移植性的"法" |
| S3 | Claude Platform Docs: Agent Skills Overview | 官方文档 | `[F]` | 结构、字段限制、加载机制 | 与 S2 基本一致 |
| S4 | Claude Platform Docs: Skill authoring best practices | 官方文档 | `[F]` | 简洁性、自由度、命名、描述写法、渐进披露、反模式 | 诊断规则主来源 |
| S5 | Claude Code Docs: Extend Claude with skills | 官方文档 | `[F]` | 安装位置、调用控制、扩展字段、排障（不触发/过度触发/描述被截断） | 平台差异来源 |
| S6 | Anthropic《The Complete Guide to Building Skills for Claude》(PDF) | 官方指南 | `[F]` | 命名硬规则、目录禁忌、触发测试、成功指标 | 给出 90% 触发率等可量化目标 |
| S7 | anthropics/claude-plugins-official → plugin-dev/skills/skill-development/SKILL.md | 官方仓库技能 | `[F]` | 质量清单、第三人称写法、正文词数目标 | 官方"教人写技能"的技能 |
| S8 | anthropics/skills → skills/skill-creator/SKILL.md | 官方仓库技能 | `[F]` | 创建流程、评测方法、写作风格、description 优化 | 官方方法论落地版 |
| S9 | Anthropic 博客: Lessons from building Claude Code: How we use skills（2026-06-03，claude.dev 镜像） | 官方博客 | `[F]` | 9 类技能、gotchas、文件系统/渐进披露、描述为触发而写、测量 | 大规模内部实践 |
| S10 | TRAE Docs: 技能（Skill） | 官方文档 | `[F]` | 目录位置、SKILL.md 格式、全局/项目、`.agents/skills`、与 Rule/MCP 区别 | TRAE 侧权威 |
| S11 | TRAE Docs: 如何写好一个 Skill（docs.trae.ai / docs.trae.cn 双站） | 官方文档 | `[F]` | 元数据规范、自由度分级、五个核心标准、渐进披露、脚本加固、六步评测、反模式附录 | 与 S4 高度互补 |
| S12 | TRAE Blog: Best Practices for Agent Skills in TRAE（2026-01-15） | 官方博客 | `[F]` | 何时用技能、技能 vs Rule/Context/Subagent、模板、显式/隐式调用 | 决策边界来源 |
| S13 | arXiv:2607.01456《From Anatomy to Smells: An Empirical Study of SKILL.md in Agent Skills》 | 学术论文 | `[F]` | 238 技能实证、13/44 语义组件、26 smells、自动检测 | 唯一的规模化实证 |
| S14 | DietrichGebert/ponytail（GitHub，MIT） | 开源项目 | `[F]`（实现）/`[S]`（性能数字自报） | 单文件技能、触发词堆叠、基准对比 | 已确认为真实项目 |
| S15 | obra/superpowers（GitHub） | 开源项目 | `[F]` | 技能链、跨 harness 分发、自动触发 | 生态代表 |
| S16 | anthropics/skills（官方示例仓库） | 官方仓库 | `[F]` | 目录组织、复杂技能范式、模板 | 参考实现 |
| S17 | 二手解释与聚合站（skillmd.ai、TRAE 社区精华帖、GetKnack、calebstew 等） | 二手 | `[S]` | 交叉印证反模式、排障经验、15k 字符上限等 | 只用于印证，不单独作为规则依据 |

---

## 2 最佳实践

### 2.1 目录与文件

标准结构 `[F]`（S2 / S4 / S6 / S8）：

```
skill-name/
├── SKILL.md          # 必需：YAML frontmatter + Markdown 正文
├── scripts/          # 可选：可执行代码（Python/Bash/JS）
├── references/       # 可选：按需读入的参考文档（REFERENCE.md、FORMS.md、finance.md…）
└── assets/           # 可选：输出用模板、图标、字体、数据表
```

官方明确点名的硬规则 / 禁忌 `[F]`（S6，Anthropic《Complete Guide》）：

- 文件名必须是 **`SKILL.md`，大小写敏感**（`SKILL.MD`、`skill.md` 不接受）。
- 目录名 **kebab-case**：`notion-project-setup`；禁止空格、下划线、大写。
- 技能目录内**不要放 `README.md`**，所有说明进 `SKILL.md` 或 `references/`（仓库根 README 另说）。
- `name` 应**与父目录同名**（S2 列为规范要求，S6 表述为"should match"）。

TRAE 侧结构约定略有差异 `[F]`（S10）：可用 `examples/`、`templates/`、`resources/` 等命名；项目技能在 `.trae/skills/`，全局技能在 `~/.trae/skills`（Windows `%userprofile%/.trae/skills`）；同时支持开放标准的 `.agents/skills/`，同名时 **`.trae/skills/` 优先**。

> 诊断含义：目录/文件名不合规属于"能不能被加载"级别的问题（P0），而不是风格问题。

### 2.2 元数据：name 与 description

两套官方来源的字段约束合并如下 `[F]`（S2 / S3 / S4 / S6 / S11）：

| 字段 | 必需 | 约束 | 写法要求 |
|---|---|---|---|
| `name` | 是 | 1–64 字符；仅小写字母、数字、连字符；不含首尾连字符与连续 `--`；与目录同名；不含 `anthropic` / `claude` 保留词 | 用动名词（`processing-pdfs`）或名词短语（`pdf-processing`）；避免 `helper` / `utils` / `tools` / 版本号 |
| `description` | 是 | 1–1024 字符；非空；不含 XML 尖括号 | 必须同时写 **做什么（what）** 与 **何时用（when）**；第三人称；含用户真实会说的触发词、文件类型、场景名 |
| `license` | 否 | 许可证名或指向 LICENSE 文件 | 开源技能建议填 |
| `compatibility` | 否 | 1–500 字符 | 仅在确有环境依赖时写（系统包、网络、Python 版本） |
| `metadata` | 否 | string→string 映射 | 建议 `author` / `version` |
| `allowed-tools` | 否 | 空格分隔的工具白名单 | 实验性，各工具支持不一致 |

**description 的"路由键"性质**（多源一致）：

- 启动时只预加载所有技能的 `name` + `description`，正文不读 `[F]`（S1 / S3 / S10）。
- 官方原话：description "不是摘要，而是这个技能何时该被触发的描述" `[F]`（S9）。
- 官方 skill-creator 指出模型当前倾向 **undertrigger**（该用不用），建议描述写得"稍微 pushy"一点，把"即使用户没说 X，只要提到 Y/Z 也用"写进去 `[F]`（S8，单一来源，降级为"倾向性建议"）。
- TRAE 官方对坏描述的定义：`"I can help you review code"`（第一人称）、`"Helps with code review"`（缺触发时机）`[F]`（S11）。
- Anthropic Complete Guide 的坏描述三连：`Helps with projects.`（太泛）、`Creates sophisticated multi-page documentation systems.`（无触发）、`Implements the Project entity model with hierarchical relationships.`（太技术、无用户语言）`[F]`（S6）。

**推荐的 description 句式**（综合 S4 / S6 / S7）：

```
[做什么] + [何时用：Use when user asks to / mentions …] + [关键能力或文件类型]
```

正例（官方）：

```
Extract text and tables from PDF files, fill forms, merge documents.
Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

**人称口径差异**：S4 明确要求第三人称陈述句（"Processes Excel files…"），S7 建议 `This skill should be used when the user asks to "…"`。二者共同底线是**不要用 I / you / "我可以帮你"**；"Use when…" 触发子句本身被 S6 / S11 广泛采用。

### 2.3 正文：自由度、结构与内容

**按容错度选择约束强度**（Anthropic 与 TRAE 给出同构的三级表）`[F]`（S4 / S11）：

| 自由度 | 场景 | 给什么 | 例子 |
|---|---|---|---|
| 高 | 多种有效路径、依赖上下文判断 | 原则 / 启发式 | 代码审查：先安全、再可读性 |
| 中 | 有首选模式、允许变通 | 模板 / 伪代码 / 参数化脚本 | 报告：摘要-分析-建议 |
| 低 | 易错、必须固定序列 | 精确命令 / 脚本，禁止改参数 | 数据库迁移 |

**正文推荐骨架**（S6 模板 + S11 工作流 + S9 gotchas 合并）：

```markdown
# 技能名
## 何时使用 / When to use（正向 + 负向）
## 指令 / Steps（Step 1..N，动宾结构，可执行）
## 输出格式（模板 / 字段 / 示例）
## Gotchas（高频踩坑，一条一句，写明"为什么"）
## 失败处理（On failure：重试 / 降级 / 拒绝 / 回报什么）
## 参考文件（一层链接 + 何时读）
```

关键写法要点：

- **不要陈述模型已知的常识**；技能应提供"把模型推出默认路径"的信息 `[F]`（S9；S4 的"Default assumption: Claude is already very smart"）。
- **Gotchas 是最高信号内容**，应持续从失败中沉淀（例："`subscriptions` 表是 append-only，要取 version 最大那行，不是 created_at 最新"）`[F]`（S9）。
- **给目标与约束，不要给每一步铺轨**；过度具体会限制模型适配 `[F]`（S9 "Avoid railroading Claude"）。
- **用祈使句**写指令 `[F]`（S8）；解释"为什么重要"比堆 MUST 更有效 `[F]`（S8）。
- **多步骤任务给工作流 + 可勾选检查清单**，关键节点做"验证→修正→再验证" `[F]`（S4 / S11）。
- **术语前后一致**；同一概念不要混用 Endpoint / API URL / Endpoint Path `[F]`（S11 反模式）。

### 2.4 渐进披露与引用（诊断最易量化的部分）

| 约束 | 数值 | 来源 |
|---|---|---|
| 元数据常驻预算 | ≈100 tokens（S2）/ ≈100 words（S7） | `[F]`，两说并存 |
| `SKILL.md` 正文 | <500 行（S2/S4/S8/S11）；1,500–2,000 词为宜、<3,000 词（S7） | `[F]` |
| 正文 tokens | <5,000 tokens 建议（S2） | `[F]` |
| 引用深度 | 必须从 `SKILL.md` **一层可达**，禁止 A→B→C | `[F]`（S2/S4/S11） |
| 参考文件目录 | >100 行加 TOC（S4/S11）；S8 说 >300 行 | `[F]`，取 100 为严格线 |
| 引用写法 | 相对路径 + 正斜杠，并说明"何时读它" | `[F]` |
| 校验工具 | `skills-ref validate ./my-skill` | `[F]`（S2） |

`[S]` 二手排障经验：工具侧对"所有技能描述合计"存在字符预算，超限后部分描述被静默截断或丢弃（有文章称 15,000 字符，未在官方文档核实）——诊断时可作为提示项，不宜作为硬失败。

### 2.5 脚本与资源

- 脚本用于"确定性、重复、昂贵"的操作；模型可直接执行而不必把脚本读进上下文 `[F]`（S1）。
- 脚本必须：自包含或写清依赖；常见异常显式捕获；错误信息包含**原因 + 下一步建议**；成功/失败路径都有可读输出；常量语义化并说明取值依据（不要魔法数字）`[F]`（S2 / S11）。
- `SKILL.md` 必须说清"该运行脚本，还是只把脚本当参考读" `[F]`（S1）。
- 输出模板放 `assets/`，让模型复制而非凭空生成 `[F]`（S8）。

### 2.6 触发、调用与分发

- 两种调用：**显式**（`/skill-name`、或"用 X 技能"）与**隐式**（模型按 description 判断）`[F]`（S12 / S5）。
- 显式触发用于"不留解释空间"的稳定场景；隐式触发质量取决于"When to Use"写得多清楚 `[F]`（S12）。
- 平台扩展字段（`disable-model-invocation`、`argument-hint`、`allowed-tools`、`` !`cmd` `` 动态注入、subagent 执行）属于 Claude Code 扩展，非标准字段；跨工具分发时可能被忽略或解析失败 `[F]`（S5）。
- 分发形态：单文件夹拷贝、plugin marketplace、`.agents/skills/`、zip 上传 `[F]`（S5 / S10 / S15）。
- 安全：只安装可信来源；审阅脚本与网络访问；禁止"忽略此前指令"式注入；`name` 保留词与尖括号限制的本质是防提示注入 `[F]`（S1 / S2 / S6）。

### 2.7 评测与迭代（官方标准流程）

1. **建无技能基线**：裸跑目标任务，记录不稳定点、歧义点、错误时机的"主动帮忙" `[F]`（S11 / S1 "Start with evaluation"）。
2. **先写评测用例**：3–5 个可复现用例，明确通过/失败标准；至少覆盖"应触发 / 不应触发"两类 `[F]`（S11 / S6）。
3. **写最小技能**：只写刚好过评测的规则；先写"何时不该用"与"最短成功路径" `[F]`（S11）。
4. **补边界与示例**：结构化 Input/Output、关键示例；每条新规则都要有评测支撑 `[F]`（S11）。
5. **回归**：任何修改都跑旧用例；不过就**简化**而不是叠规则 `[F]`（S11 / S8）。
6. **真实使用校准**：观察误触发、漏读参考文件、反复读同一段形成的隐性依赖 `[F]`（S11）。

参考指标 `[F]`（S6）：相关请求自动触发率 ≥90%（10–20 条查询测）；工具调用次数/token 与无技能基线对比；同一请求跑 3–5 次看结构一致性。

### 2.8 生态案例拆解

**A. Anthropic 官方 skills 仓库** `[F]`（S16 / S1）
- 每个技能自包含一目录一 `SKILL.md`；docx/pdf/pptx/xlsx 是生产级复杂技能样板。
- PDF 技能把"填表"拆到 `forms.md`、API 细节拆到 `reference.md`，正文只留 quick start 与导航 → 教科书式渐进披露。

**B. `skill-creator`（官方技能，用于写技能）** `[F]`（S8）
- 方法论闭环：意图访谈 → 草稿 → 2–3 条真实测试 prompt → 有技能/无技能双跑 → 断言与人工评审 → 按反馈重写 → 扩测试集。
- 目录约定：`scripts/` 确定性代码、`references/` 按需文档、`assets/` 输出素材；正文 <500 行；域多时按变体拆（`references/aws.md|gcp.md|azure.md`）。
- 明确"缺乏惊喜原则"：技能内容不得超出描述所承诺的意图（安全底线）。

**C. `obra/superpowers`** `[F]`（S15）
- 把方法论拆成一条可组合链：brainstorming → worktrees → writing-plans → subagent-driven-development / executing-plans → TDD → code review → finishing branch。
- 每个技能只做一件事，靠"技能间引用 + 自动触发"编排；另配 `diagnosing-superpowers` 技能排查"该触发没触发/不该触发却触发"。
- 分发上同一套技能适配 18+ harness（Claude Code、Codex、Cursor、Gemini、Copilot…）。

**D. `ponytail`（用户点名核查项）** `[F]` 项目真实存在（`DietrichGebert/ponytail`，MIT，npm `@dietrichgebert/ponytail`）
- 它**是一个 AI 编码技能**：核心资产就是单文件 `skills/ponytail/SKILL.md`（约 60 行）+ 一份 `AGENTS.md` 精简版；其余仓库内容是把该 prompt 装进 20 个 agent 的适配层。
- 内容形态：一段人格设定 + 一张"决策阶梯"（要不要存在 → 代码库已有 → 标准库 → 平台能力 → 已装依赖 → 一行 → 最小实现）+ 不可裁剪清单（校验/安全/可访问性）+ 分级（lite/full/ultra）。
- 元数据：`description` 堆叠触发语（"ponytail"、"be lazy"、"simplest solution"、"yagni"、抱怨过度设计），并声明 `license: MIT`；另用了非标准字段 `argument-hint`（Claude Code 扩展）。
- 它自报基准（同一 agent 有/无技能，Claude Code，39 任务，Opus 5.5，各 5 次）：代码 -53%、时间 -41%、成本 -26%、token -45%，风险逻辑带测试率 98% vs 68% `[S]`（项目自报，无第三方复现）。
- **对诊断的启示**：它属于"行为约束 / 风格型"技能——正文极短、无 scripts/references、靠强描述触发；说明"短"不等于"差"，但这类技能必须自带验收口径（它用"每次回复结尾说明跳过了什么/风险"自检）。

**E. TRAE 自建技能** `[F]`（S10 / S11 / S12）
- 推荐格式：frontmatter 两字段 + `## 描述` / `## 使用场景` / `## 指令` / `## 示例（可选）`。
- 与 Rule 的分工：Rule 全量常驻、持续占上下文；Skill 按需加载。**"同一 prompt 打了三遍"或 Rule 里长出流程**时就该升级为 Skill `[F]`（S12 / S5）。
- 提供 `.agents/skills/` 互操作与 `find-skills` 安装路径 `[F]`（S10）。

### 2.9 平台差异速查（诊断时的兼容性注意）

| 维度 | 开放标准 | Claude Code | TRAE |
|---|---|---|---|
| 必需字段 | name / description | 同 | 同 |
| name 唯一强制 | 与目录同名、小写连字符 | 目录名或 name 即命令名 | 同上，中文场景常见"技能名称"填中文 |
| 扩展字段 | 无（metadata 兜底） | `disable-model-invocation`、`argument-hint`、`allowed-tools`、hooks、动态注入 | 以 UI 字段 + 正文为主 |
| 目录 | 任意（建议 `.agents/skills`） | `~/.claude/skills`、`.claude/skills`、plugin、enterprise | `.trae/skills`、`~/.trae/skills`、`.agents/skills` |
| 描述截断 | 1024 字符硬限 | 另有排障项 "Skill descriptions are cut short" | 未明示 |

> 诊断含义：同一资产在不同平台的可加载性不同。**用中文 name / 含空格目录名 / 依赖 Claude Code 专有字段**，都应给出"跨工具降级"提示而不是直接判死。

---

## 3 反模式

| # | 反模式 | 可观测症状 | 为什么坏 | 来源 |
|---|---|---|---|---|
| A1 | description 过泛 | "Helps with projects" / "A helpful skill for various tasks" / 描述里没有任何具体名词 | 触发全凭运气，或与其它技能抢触发 | `[F]` S6/S11；`[S]` S17 |
| A2 | 只写 what，不写 when | 描述是一句功能摘要，无 "Use when / 当用户…" 子句 | 模型不知道"何时"该加载 | `[F]` S4/S6/S11 |
| A3 | 人称错位 | "I can help you…" / "You can use this to…" / "Use this skill when…"（第二人称） | 元数据进系统提示，口径不一致导致发现异常 | `[F]` S4/S7 |
| A4 | 正文过长 | SKILL.md >500 行或 >3,000 词，且没有拆分 | 触发后挤占上下文，稀释关键指令 | `[F]` S2/S4/S8/S11 |
| A5 | 深层嵌套引用 | SKILL.md → advanced.md → details.md → 真正内容 | 模型可能只 `head -100` 预览，读到残缺信息 | `[F]` S4/S11 |
| A6 | 引用断链 / 无读取指引 | 引用的文件不存在；或只说"见 reference.md"不说何时读 | 触发后走错路，或反复试探 | `[F]` S4/S8；`[S]` S7 检查清单 |
| A7 | 多选项无默认 | "你可以用 PostgreSQL、MySQL、SQLite 或 Oracle…" | 增加决策成本与不确定性 | `[F]` S4/S11（同名反模式） |
| A8 | 写死时效性信息 | "2025 年 8 月前用旧 API" / "目前最新版本是…" | 很快过期，技能变成错误知识 | `[F]` S4/S11 |
| A9 | 术语不一致 | 同一概念混用 Endpoint / API URL / Endpoint Path | 模型理解成本上升、指令歧义 | `[F]` S11 |
| A10 | Windows 反斜杠路径 | `configs\deploy.yaml` | 非 Windows 环境直接失败 | `[F]` S4/S11 |
| A11 | 把一次性任务/常识写成技能 | 无触发条件、无流程、内容模型默认就会 | 只增加常驻描述负担，不改变行为 | `[F]` S9/S12；`[S]` S17 |
| A12 | 多职责捆绑 | 一个技能同时"跑测试 + 改 PR 状态 + 发通知" | 边界模糊、触发不准、难维护 | `[F]` S11/S9 |
| A13 | 缺失败策略 | 只写 happy path，没有重试/降级/拒绝条件 | 失败时模型自由发挥 | `[F]` S11 |
| A14 | 无验收标准 / 从不评测 | 没有测试 prompt、没有"通过/失败"判定 | 无法回归，质量随迭代漂移 | `[F]` S11/S8/S6 |
| A15 | 目录/文件不合规 | `skill.md`、`SKILL.MD`、目录含空格/下划线/大写、技能内放 README.md | 直接不被加载或被忽略 | `[F]` S6 |
| A16 | 安全与可移植性隐患 | 脚本发起未知网络请求、读凭据、`allowed-tools` 过宽、来源不可信、无 license | 供应链风险；跨工具行为不一致 | `[F]` S1/S2/S5 |

补充 `[S]`（S17，多篇社区文章交叉）：描述写成 800 字长文导致触发子句被截断；YAML 未加引号的冒号导致解析失败；解压出双层同名目录导致技能"存在但不可见"。这些可作为诊断的"高概率解释"话术，而非硬规则。

---

## 4 可执行检查清单

> 判定分级：**P0** = 资产不可加载/不可用；**P1** = 显著降低触发率或执行稳定性；**P2** = 可维护性/长期质量。
> 实现方式：`M` = 纯机器可判（正则/行数/文件存在性/YAML 解析）；`L` = 需 LLM 判定；`M+L` = 机器初筛 + LLM 复核。

| ID | 检查项 | 读哪个字段 | 判定规则（不合格条件） | 级别 | 实现 | 来源 |
|---|---|---|---|---|---|---|
| C01 | 可加载性 | 文件树 | 缺 `SKILL.md`；文件名不是精确大写 `SKILL.md`；frontmatter 不以 `---` 开头或 YAML 解析失败；缺 `name` 或 `description` | P0 | M | S2/S6 |
| C02 | name 合规 | frontmatter.name + 目录名 | 不匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`；长度 >64；含 `anthropic`/`claude`；目录名含空格/下划线/大写；name 与目录名不一致 | P0 | M | S2/S3/S6 |
| C03 | description 基本形态 | frontmatter.description | 空；>1024 字符；含 `<` / `>`；无"何时用"子句（无 `Use when` / `当用户` / `适用于` 等触发表达）；出现 `I can` / `you can` / `helps with` 开头 | P1 | M+L | S3/S4/S6/S11 |
| C04 | description 触发具体度 | frontmatter.description | 泛化词表命中（helper、utils、tools、various、general、misc、各种、通用、相关任务）；且无 ≥2 个具体名词/用户原话/文件类型/场景名 | P1 | M+L | S4/S6/S11/S17 |
| C05 | description 区分度 | 同库全部 description | 与另一技能描述语义相似度超阈值（建议 embedding cos ≥0.85）或关键词重合度 ≥0.8，且两者职责未显式区分 | P2 | M（需向量） | S4（100+ 技能并存时的选择问题）+ 工程判断 |
| C06 | 触发边界 | 正文 | 只有正向条件，缺"何时不该用"（`Do NOT use` / `不要用于` / `不适用于` 等价表达） | P1 | L | S11 |
| C07 | 单一职责 | 正文 | 出现 ≥3 个互不依赖的动作域（如"跑测试 + 改状态 + 发通知"），或核心动词 >2 个 | P2 | L | S11/S9 |
| C08 | 正文体量 | 正文行数/词数 | >500 行或 >3,000 词且未拆分到 `references/`；或 <50 行且无流程、无引用、无示例（内容不足，需人工确认是否本身不该是技能） | P2 | M | S2/S4/S7/S8/S11 |
| C09 | 渐进披露与引用健康 | 正文中的链接/路径 + 引用文件 | 任一引用文件不存在（断链）；引用深度 >1（引用的文件再引用）；>100 行参考文件无 TOC；用反斜杠路径或绝对路径 | P0（断链）/P2（其余） | M | S2/S4/S11 |
| C10 | 输出契约 | 正文 | 未定义输出格式/模板/字段/示例中的任一项，也未说明"输出由用户决定" | P1 | L | S6/S11（主观创作类可豁免，需显式声明） |
| C11 | 失败策略与 guardrail | 正文 | 无失败处理段；破坏性操作（删除/迁移/发布/付款）无二次确认、备份或回滚说明 | P1（破坏性操作升为 P0） | L | S11/S1 |
| C12 | 文本反模式 | 正文全文 | 命中任一：Windows 反斜杠路径；时效性表述（具体年月 + "最新/目前/暂时"）；多选项枚举且无"默认使用 X"；同一概念 ≥2 种叫法混用 | P2 | M+L | S4/S11 |
| C13 | 该不该是技能 | 全文 + 库内 rule 资产 | 无触发条件且无多步流程；内容属模型常识；与已有 rule 高度重复；一次性任务 | P1 | L | S9/S12/S11 |
| C14 | 脚本质量 | `scripts/*` | 无错误处理（裸抛异常）；错误信息只有堆栈无下一步；魔法数字无注释；`SKILL.md` 未说明"该运行还是只该读" | P2 | M+L | S2/S11/S1 |
| C15 | 安全与可移植性 | 全文 + 脚本 + frontmatter | 含"忽略此前指令"类注入语句；脚本访问未知外部网络/读取凭据/执行不可逆删除；`allowed-tools` 为通配或无限制；来源不可信且无 license；依赖 Claude Code 专有字段但未标注"仅 Claude Code" | P0（注入）/P1（其余） | M+L | S1/S2/S5/S6 |

**评分建议（可直接用于产品侧）**：从 100 分起扣，`P0 −30 / P1 −10 / P2 −3`，下限 0；≥85 为 A（可直接分发）、70–84 为 B（可用待优化）、50–69 为 C（触发/稳定性有风险）、<50 为 D（建议重写）。P0 命中时直接封顶为 D，不给"高分但不加载"的错觉。

**诊断所需最小输入**（控制成本）：文件树（含各文件行数）→ frontmatter 原文 → 正文全文（>500 行时取前 200 行 + 各级标题 + 引用行）→ `scripts/` 的头 20 行与是否存在网络/删除调用。C03/C04/C06/C07/C10/C11/C13 用一次 LLM 判定即可，其余纯规则。

---

## 5 来源清单

检索日期均为 **2026-11-14**。

### 官方 / 标准（`[F]`）

| # | 来源 | URL |
|---|---|---|
| 1 | Anthropic Engineering — Equipping agents for the real world with Agent Skills（2025-10-16） | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills |
| 2 | Agent Skills Specification | https://agentskills.io/specification |
| 3 | Claude Platform Docs — Agent Skills Overview | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview |
| 4 | Claude Platform Docs — Skill authoring best practices | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices |
| 5 | Claude Docs — Skill authoring best practices（含 "Avoid Windows-style paths"） | https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices |
| 6 | Claude Code Docs — Extend Claude with skills（含 troubleshooting） | https://code.claude.com/docs/en/skills |
| 7 | Anthropic — The Complete Guide to Building Skills for Claude（PDF） | https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf?hsLang=en |
| 8 | Anthropic 官方仓库 — plugin-dev/skills/skill-development/SKILL.md | https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/skill-development/SKILL.md |
| 9 | Anthropic 官方仓库 — skills/skill-creator/SKILL.md | https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md |
| 10 | Anthropic 博客 — Lessons from building Claude Code: How we use skills（2026-06-03，claude.dev 镜像） | https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/ |
| 11 | TRAE Docs — 技能（Skill） | https://docs.trae.ai/ide/skills |
| 12 | TRAE Docs — 如何写好一个 Skill（国际站） | https://docs.trae.ai/ide/best-practice-for-how-to-write-a-good-skill |
| 13 | TRAE Docs — 如何写好一个 Skill（中国站，含反模式附录） | https://docs.trae.cn/ide_best-practice-for-how-to-write-a-good-skill |
| 14 | TRAE Blog — Best Practices for Agent Skills in TRAE（2026-01-15） | https://www.trae.ai/blog/trae_tutorial_0115 |

### 学术（`[F]`）

| # | 来源 | URL |
|---|---|---|
| 15 | Hong, Imani, Ahmed — From Anatomy to Smells: An Empirical Study of SKILL.md in Agent Skills（arXiv:2607.01456v2） | https://arxiv.org/abs/2607.01456 |

### 开源项目（`[F]` 事实 / `[S]` 自报数字）

| # | 来源 | URL |
|---|---|---|
| 16 | anthropics/skills（官方示例与模板） | https://github.com/anthropics/skills |
| 17 | anthropics/skills — frontend-design/SKILL.md | https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md |
| 18 | DietrichGebert/ponytail（MIT） | https://github.com/DietrichGebert/ponytail |
| 19 | ponytail — skills/ponytail/SKILL.md | https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md |
| 20 | obra/superpowers | https://github.com/obra/superpowers |

### 二手 / 社区（`[S]`，仅用于交叉印证）

| # | 来源 | URL |
|---|---|---|
| 21 | TRAE 官方社区精华帖《如何写好一个 Skill？Trae 官方最佳实践精华版》（含反模式速查表） | https://forum.trae.cn/t/topic/183670 |
| 22 | SkillMD.ai — Skill Design（描述泛化/触发冲突） | https://www.skillmd.ai/skills/skill-design/ |
| 23 | calebstew — Skill Authoring Best Practices in Depth | https://calebstew.art/ai-slop/skills/writing-skills/reference-best-practices/ |
| 24 | GetKnack — Claude Skill Not Working? A Triage Checklist | https://getknack.ai/blog/claude-skill-not-working |

---

## 附：未采信 / 待核实

- **"技能描述合计 15,000 字符上限"**：仅见于二手排障文章，未在 Anthropic / Claude Code 官方文档中找到对应表述。可作为提示文案，不作为诊断失败项。
- **`SKILL.md` 正文上限的三种说法（500 行 / 5,000 tokens / 3,000 词）**：来自不同官方文档，量纲不同且未互相引用。本清单采用"500 行或 3,000 词"双阈值，取先触发者。
- **ponytail 的基准数据（-53% 代码等）**：项目 README 自报，未见第三方复现或论文引用，按 `[S]` 处理。
- **"26 种 skill smell / 11 种出现在 >50% 样本"**：来自论文解读文章，论文摘要仅确认"13 个高层 + 44 个低层语义组件"与"99% 以上至少 1 个 smell"，故该数字标 `[S]`。
