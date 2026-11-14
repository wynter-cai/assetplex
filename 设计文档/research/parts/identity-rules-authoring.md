# 身份（Identity）与规则（Rules）编写质量诊断

> 服务对象：AssetPlex「资产编写质量诊断」——identity / rules 两类资产的检查维度与诊断规则来源。
> 调研边界：一份好的身份文件写什么、规则文件怎么写才有效、提示词工程中与长期身份/规则相关的可靠做法、开源 lint 的检查维度、常见反模式。
> 不展开：模型微调、各工具私有实现细节、具体产品的 UI 设计。
> 检索日期：2026-11-14。标注：`[F]` 官方口径/可验证事实，`[S]` 二手或厂商材料（单一来源时降级表述），`[A]` 本报告的推定/工程判断。

---

## 0. 核心结论

1. **身份与规则是两种资产，不能混写**。Identity 回答「我是谁、为谁、以什么口径说话」，跨任务稳定；Rules 回答「在这个项目/这条路径下必须或禁止怎么做」，随作用域变化。Anthropic 明确建议角色放 system、任务指令放 user turn；OpenAI 的 developer message 结构把 Identity 与 Instructions 分为两段；Microsoft 的系统提示框架同样把 Role 与 Rules 分开。`[F]`（S5、S8、S11）

2. **有效指令的唯一共同标准是「可验证的具体行为」，不是形容词**。Anthropic 要求把「Format code properly」改成「Use 2-space indentation」；Cursor 要求「Avoid vague guidance. Write rules like clear internal docs」；Microsoft 直接给出反例：「Sound friendly and professional」无法执行。`[F]`（S2、S7、S9、S11）

3. **分层加载是机制，不是风格建议**。Claude 从宽到窄拼接（root → cwd），子目录文件按需加载；Cursor 的优先级是 Team → Project → User；TRAE 分全局/项目，并支持子目录规则按需携带；AGENTS.md 的约定是「离被编辑文件最近的赢，聊天指令覆盖一切」。`[F]`（S1、S2、S9、S10）

4. **冲突不会自动仲裁，必须被检测**。Claude 官方说明：两条指令矛盾时，Claude 可能任选一条；TRAE 最佳实践要求「各条规则之间不得彼此冲突或相互覆盖」；Cursor 用来源优先级兜底。诊断器若不做跨文件冲突检测，等于把风险留给模型随机选择。`[F]`（S2、S9、S10；S14 亦把「跨文件矛盾」列为最易修的腐烂项）

5. **长度同时受硬预算与软预算约束**。Claude 建议单个 CLAUDE.md 目标 < 200 行；Cursor 建议规则 < 500 行；Codex 对拼接后的 AGENTS.md 有 32 KiB 默认上限（二手来源一致引用，本次未在官方页直接读到默认值，按 `[S]` 处理）；IFScale 实测 500 条指令密度下最强模型仅约 68% 准确率。`[F]`（S2、S9、S15；32 KiB 为 S17、S18）

6. **常驻规则只放「每次都需要且猜不到」的内容**。Claude 给出一张 Include/Exclude 表（排除代码里能看出的、语言通用规范、详细 API 文档、频繁变化的信息）；Cursor 明确禁止复制整份风格指南、逐条记录常见命令、为罕见边界写规则。多步流程与领域知识应下沉到 skill 或路径规则。`[F]`（S2、S3、S9）

7. **规则不是安全边界**。Claude 文档明确：CLAUDE.md 是 context，不是 enforced configuration，要硬阻断请用 PreToolUse hook；Cursor 也提示 AI 指引不应成为唯一安全控制。密钥、token、内网地址、真实客户名写进规则文件，既是泄密也是无效防护。`[F]`（S2、S9；S12、S13、S14 的 lint 规则均把 secret 检测列为 Critical）

8. **lint 生态能机械判定的是「真不真、贵不贵」，判不了「对不对」**。AgentLinter 的维度是结构/清晰/完整/安全/一致/记忆/运行时/技能安全；agents-lint 查路径、命令、依赖、框架过时、跨文件一致性。二者都不评价「这条建议是否会让 agent 更差」，所以诊断产品必须把确定性规则与语义判断分层。`[F]`（S12、S13；S14 明确写出这一边界）

9. **「写得多」未必更好，证据倾向于「少而准」**。ETH Zurich 的 AGENTS.md 评测摘要结论：上下文文件总体上没有提升任务成功率，反而使推理成本平均增加 20% 以上；LLM 自动生成的文件在部分设置下略负。诊断应奖励「删掉不影响行为的行」，而不是奖励覆盖面。`[F]`（S16）

10. **身份会被长对话稀释**。有研究观察到角色保真度随对话变长而下降、模型逐步回落到基线行为（单一来源，降级表述）。工程含义：身份文件要短、关键约束前置、可被复述，而不是靠堆段落维持人设。`[S]`（S19）

---

## 1. 来源盘点表

| 编号 | 来源 | 类型 | 层级 | 对本次的价值 |
|---|---|---|---|---|
| S1 | agents.md 官网 | 开放格式官方站 | ① 官方 | AGENTS.md 定位、无必填字段、嵌套与冲突规则、生态覆盖 |
| S2 | Claude Code 官方文档：Memory / CLAUDE.md | 产品官方文档 | ① 官方 | 目录层级、加载顺序、<200 行、一致性、context 非强制、prompt-audit |
| S3 | Claude Code 官方文档：Best practices | 产品官方文档 | ① 官方 | CLAUDE.md 的 Include/Exclude 清单、删行自检法 |
| S4 | Anthropic：Prompting best practices | 模型厂商官方 | ① 官方 | 清晰直接、正例优先、字面遵循、显式声明作用域 |
| S5 | Anthropic：Give Claude a role (system prompts) | 模型厂商官方 | ① 官方 | 角色放 system、其余放 user；角色的准确率/语气/聚焦收益 |
| S6 | Anthropic：Multishot prompting | 模型厂商官方 | ① 官方 | 3–5 个多样、相关、清晰的示例 |
| S7 | Anthropic：Be clear, direct, and detailed | 模型厂商官方 | ① 官方 | 受众/用途/终局等上下文；具体到可执行 |
| S8 | OpenAI：Prompt engineering guide | 模型厂商官方 | ① 官方 | instructions 的层级；developer message 四段：Identity/Instructions/Examples/Context |
| S9 | Cursor：Rules 官方文档 | 产品官方文档 | ① 官方 | 四类规则、四种生效方式、<500 行、Best practices / What to avoid、优先级 |
| S10 | TRAE：规则官方文档 | 产品官方文档 | ① 官方 | 全局/项目规则、四种生效方式、3 层嵌套、子目录按需、最佳实践 |
| S11 | Microsoft Fluent 2：Content engineering | 设计系统官方指南 | ① 官方 | Role/Task/Rules/Example 四组件；角色三问；语气显式化；约束类别 |
| S12 | AgentLinter（npm / GitHub） | 开源 lint 工具 | ① 工具文档 | 八维评分；clarity/consistency/security/token 的具体规则与阈值 |
| S13 | agents-lint（npm） | 开源 lint 工具 | ① 工具文档 | 路径/命令/依赖/框架过时/结构/跨文件一致性/记忆文件检查 |
| S14 | Yaw Labs：六个 CLAUDE.md/AGENTS.md linter 对比 | 厂商博客（评测） | ③ 二手 | 机械可查项清单；「lint 是地板不是评分」的边界判断 |
| S15 | IFScale（arXiv:2507.11538） | 学术论文 | ① 学术 | 指令密度与遵循率：500 条时最强模型约 68% |
| S16 | Evaluating AGENTS.md（arXiv:2602.11988） | 学术论文 | ① 学术 | 上下文文件总体不提升成功率、成本 +20% 以上 |
| S17 | Codex AGENTS.md 进阶模式（第三方知识库） | 技术博客 | ③ 二手 | 32 KiB 默认上限、root→cwd 拼接、override 文件 |
| S18 | ai-tldr：AGENTS.md / CLAUDE.md 解释 | 技术博客 | ③ 二手 | <200 行、每行都在每轮消耗 token 的预算视角 |
| S19 | Persistent Personas?（arXiv:2512.12775） | 学术论文 | ① 学术（单来源） | 长对话中角色保真度下降、回落基线 |

> 说明：S12/S13 是工具文档，其「检查项」可作为诊断维度的事实依据，但其权重与评分是作者主观设定（S14 亦指出「100 分编码的是某人的偏好」）。

---

## 2. 最佳实践

### 2.1 Identity / 人设文件

#### 2.1.1 先分清三层：Identity / Rules / Task

| 层 | 回答的问题 | 稳定性 | 典型载体 | 不该放什么 |
|---|---|---|---|---|
| Identity | 我是谁、为谁服务、以什么口径表达、绝不做什么 | 跨项目稳定 | system prompt、identity/persona 文件 | 具体项目的路径、命令、一次性任务 |
| Rules | 在这个项目/这条路径下必须或禁止怎么做 | 随项目/路径变化 | AGENTS.md、CLAUDE.md、`.cursor/rules`、`.trae/rules` | 人格设定、长篇领域教程 |
| Task | 这次要完成什么 | 一次性 | 对话输入 | 需要长期复用的约束 |

依据：Anthropic 明确「用 system 设置角色，其它任务指令放 user turn」`[F]`（S5）；OpenAI 的 developer message 推荐顺序是 Identity → Instructions → Examples → Context，并说明 instructions 参数承载 tone、goals 与正确响应示例 `[F]`（S8）；Microsoft 把系统提示拆成 Role / Task / Rules / Example output 四组件 `[F]`（S11）。

> AssetPlex 含义 `[A]`：身份资产要能独立分发——不依赖某个项目的 rules 才能成立；项目约束则必须留在 rules 资产里，否则换项目即失真。

#### 2.1.2 一份合格身份文件的六个必备要素

| 要素 | 要写什么 | 不合格示例 | 合格示例 |
|---|---|---|---|
| 角色与职能 | 是什么、优化什么、不是什么 | 「你是一个专业的 AI 助手」 | 「你是面向 toB 售前场景的方案架构助手，优化目标是让非技术决策者 10 分钟内看懂取舍」 |
| 服务对象 | 受众的知识水平、决策权、使用场景 | 「帮助用户」 | 「读者是一线业务负责人，不写代码，关心成本与落地风险」 |
| 目标与成功标准 | 什么算完成、什么算好 | 「提供高质量回答」 | 「每次输出必须给出：结论、两条依据、一个可执行下一步」 |
| 语气与输出契约 | 语言、长度、格式、称呼、禁用表达 | 「语气专业友好」 | 「中文；先结论后论据；正文 ≤ 300 字；不用『赋能/抓手』；不称『亲』」 |
| 边界与拒绝 | 不做什么、越界时怎么处理 | 只写「要遵守规范」 | 「不编造客户名与数据；缺数据时标注『待补』并列出需要的最小信息」 |
| 不确定时 | 提问、停下、还是声明假设 | 无 | 「需求歧义超过两处时先提问，不自行假设」 |

依据：Microsoft 的角色三问是「是什么 / 优化什么 / 不是什么（scope boundaries）」，并强调不写边界会导致漂移 `[F]`（S11）；AgentLinter 的 Completeness 把「identity/persona defined、boundaries & constraints、error recovery strategy」列为必查 `[F]`（S12）；Anthropic 指出提供受众、用途、终局会直接改善表现 `[F]`（S7）。

#### 2.1.3 写法规则（可直接变成诊断项）

1. **一个角色，不要一串头衔**。Anthropic 的实验口径是「领域越具体，行为越聚焦」，但具体指的是职能与场景，不是形容词数量 `[F]`（S5）。
2. **用行为动词替代形容词**。把「严谨」翻译成「引用数据必须给出来源；无来源则标注推测」`[F]`（S2、S11）。
3. **正例优先于负例**。Anthropic 明确：想减少某种行为时，展示「正确示范」通常比「不要做 X」更有效 `[F]`（S4）。
4. **给 3–5 个多样示例**，覆盖正常、边界、拒绝三类情形 `[F]`（S6）。
5. **输出契约要可数**：字数、条数、字段名、是否用表格，而不是「简洁清晰」`[F]`（S11）。
6. **语言单一**。同一文件混用中英/多语会提高 token 成本与解释歧义（工具侧观察，`[S]`，S12）。
7. **长度控制**：身份文件建议 ≤ 80–120 行、≤ 1,500 tokens `[A]`（由 S2 的 200 行上限与 S12 的 3,000 token 建议预算倒推，非官方硬指标）。
8. **关键约束前置**。长对话中角色保真度会衰减（单来源，`[S]`，S19），因此「绝不做」的条目应放在文件前 20%，不要埋在附录。

#### 2.1.4 最小可用骨架

```markdown
# Identity: <角色名>

## 我是谁
- 职能：<一句话，含领域与优化目标>
- 不是：<最容易被误判成的角色>

## 我为谁工作
- 受众：<知识水平 / 决策权 / 使用场景>
- 他们最在意：<1–3 项>

## 我的目标
- 成功标准：<可验证的输出契约>
- 默认交付物：<结构 / 长度 / 字段>

## 我怎么说
- 语言与称呼：
- 结构：先结论，后依据
- 禁止表达：<空洞词、谄媚语、免责套话>

## 我不做什么
- <边界 1>：<越界时的替代动作>
- <边界 2>：<越界时的替代动作>

## 不确定时
- <提问条件> / <必须声明假设的条件>
```

---

### 2.2 Rules / 规则文件

#### 2.2.1 四种载体的机制差异

| 载体 | 位置与作用域 | 冲突/优先级 | 官方长度口径 | 关键特性 |
|---|---|---|---|---|
| AGENTS.md | 仓库根与任意子目录；子项目可各放一份 | 离被编辑文件最近者赢；聊天指令覆盖一切 | 无官方行数；Codex 拼接预算 32 KiB（`[S]`） | 无必填字段、纯 Markdown、跨工具通用 |
| CLAUDE.md | 托管策略 / 用户 `~/.claude` / 项目 / `CLAUDE.local.md` | 全部拼接，不互相覆盖；宽→窄，子目录按需加载 | 目标 < 200 行 | `@import`、`.claude/rules/` + paths、`/doctor prompt-audit` |
| Cursor Rules | `.cursor/rules` 项目级 / User / Team | Team → Project → User；冲突时靠前者 | < 500 行 | 四种生效方式、`.mdc` frontmatter、可 import 远程规则 |
| TRAE Rules | 全局 `~/.trae/user_rules` / 项目 `.trae/rules` | `@Rule` 最高；子目录规则按需携带 | 无官方行数 | 四种生效方式、最多 3 层嵌套、可导入 AGENTS.md/CLAUDE.md |

依据：S1、S2、S9、S10。`[F]`

**一个容易踩的差异** `[F]`：AGENTS.md 的 FAQ 说「最近的赢」，但 Claude Code 的实际行为是**全部拼接**、靠「越近越后出现」形成软优先级，且明确承认矛盾时可能任选一条（S2）。所以「就近覆盖」不能当作可靠的冲突解决机制，诊断器必须主动查重与查冲突。

#### 2.2.2 生效方式与作用域

四类生效方式在同构产品中命名不同但语义一致 `[F]`（S9、S10）：

| 语义 | Cursor | TRAE | 适用内容 |
|---|---|---|---|
| 始终 | Always Apply | 始终生效 | 全项目都成立的硬约束（语言、包管理器、禁改目录） |
| 按路径 | Apply to Specific Files（globs） | 指定文件生效（globs） | 某技术栈/目录的规范（React、SQL、测试） |
| 智能 | Apply Intelligently（description） | 智能生效（description） | 低频但可判定的领域知识 |
| 手动 | Apply Manually（@rule） | 手动触发（@Rule） | 一次性流程、重构清单 |

诊断含义 `[A]`：**只在某目录成立的规则却设为 always**，是最常见的「token 浪费 + 跨模块干扰」来源；TRAE 官方也把「所有规则都放根目录会导致模块专属规则干扰其他模块」写进了文档 `[F]`（S10）。

#### 2.2.3 该写什么、不该写什么

Claude 官方给出的取舍表可直接产品化 `[F]`（S3）：

| ✅ 该写 | ❌ 不该写 |
|---|---|
| Claude 猜不到的 bash 命令 | 读代码就能知道的事 |
| 与语言默认不同的风格规则 | 语言通用规范 |
| 测试方式与首选 runner | 详细 API 文档（给链接） |
| 仓库礼仪（分支名、PR 约定） | 频繁变化的信息 |
| 项目特有的架构决策 | 长篇解释与教程 |
| 开发环境怪癖（必需 env） | 逐文件描述代码库 |
| 常见坑与非显然行为 | 「写干净的代码」这类自明实践 |

Cursor 的「What to avoid」与此高度重合，并额外禁止：复制整份风格指南（应交给 linter）、记录所有常见命令、为罕见边界写规则、复制代码而非指向规范示例 `[F]`（S9）。

#### 2.2.4 可执行性公式

一条可诊断的规则应满足：

```
[触发条件] + [具体动作] + [可验证的完成标准]
```

| 反例 | 问题 | 改法 |
|---|---|---|
| 「注意代码质量」 | 无动作、无标准 | 「提交前运行 `pnpm typecheck`，退出码必须为 0」 |
| 「适当地处理错误」 | 「适当」不可判定 | 「外部调用失败时返回结构化错误 `{code, message}`，禁止吞异常」 |
| 「如果需要就补测试」 | 裸条件 | 「修改 `src/core/**` 必须新增或更新对应 `tests/core/**` 用例」 |
| 「更新一下配置」 | 代词无指代 | 「更新 `config/app.yaml` 的 `timeout` 字段」 |
| 「遵循团队规范，保持一致性，注意性能」 | 多指令 + 空洞 | 拆成三条，各自带验收标准 |

依据：Anthropic「具体到可验证」的 before/after 示例 `[F]`（S2）；Microsoft 的 Specificity / Steps / Response shape 三组 Do-Don't `[F]`（S11）；AgentLinter 把 naked conditionals 列为 Critical、compound instructions 与 ambiguous pronouns 列为 Warning `[F]`（S12）。

#### 2.2.5 长度与 token 预算

| 口径 | 阈值 | 来源 | 建议处理 |
|---|---|---|---|
| Claude 单文件行数 | 目标 < 200 行 | S2 `[F]` | > 200 行：Warn，提示拆分到 path 规则 |
| Cursor 单规则行数 | < 500 行 | S9 `[F]` | > 500 行：Error，强制拆分 |
| Codex 拼接总字节 | 默认 32 KiB | S17、S18 `[S]` | > 32 KiB：Error，提示会静默截断 |
| AgentLinter token 预算 | 建议 ≤ 3,000 tokens | S12 `[F]`（工具口径） | > 3,000：Warn，给出最重章节 |
| 指令密度 | 500 条时最强模型约 68% | S15 `[F]` | 规则条数 > 150 条：Warn（阈值衰减起点 150–250） |

补充 `[F]`：
- Claude 的 `@import` 只改善组织性，**不降低上下文成本**——被导入文件会一起加载（S2）。
- Claude 会剥离块级 HTML 注释再注入上下文，可用 `<!-- 维护者备注 -->` 写给人看的内容而不花 token（S2）。
- 子目录 CLAUDE.md 按需加载，但一旦加载就进入上下文；深层级会在任务开始前吃掉预算 `[S]`（S17、S18）。

#### 2.2.6 引用完整性：规则会腐烂

agents-lint 的可机械检查项是目前最完整的工程清单 `[F]`（S13）：

- 提到的路径是否仍存在；
- `npm run <script>` / `make <target>` 是否真实存在；
- 引用的包是否在 `package.json`、是否已废弃；
- 框架 API 是否过时（如 React 19 后的 `ReactDOM.render()`）；
- 是否存在未处理的 `TODO` / `FIXME`；
- 是否引用了 2024 年之前的年份/版本；
- 多文件间的包管理器、测试命令、路径是否一致。

Yaw Labs 的对比文章把这套检查归纳为「文件真不真、贵不贵」，并指出路径腐烂是最常见、最可自动修的一类 `[S]`（S14）。Cursor 的原则是「引用文件而不是复制内容」，因为复制会随代码变化而过期 `[F]`（S9）。

#### 2.2.7 安全与隐私

- **绝不写入**：API key、token、私钥、内网地址、真实客户名/项目代号、个人身份信息。`[F]`（S12、S13 的 secret 检测均为 Critical；S14 将「粘贴进上下文的密钥」列为首要风险）
- **个人偏好与团队规则分离**：Claude 的 `CLAUDE.local.md` 应加入 `.gitignore`；项目规则只放团队共享标准 `[F]`（S2）。
- **规则不是执行边界**：Claude 明确 CLAUDE.md 是 context 而非强制配置，硬阻断用 hooks；Cursor 提示 AI guidance 不能作为唯一安全控制 `[F]`（S2、S9）。
- **把外部内容当数据**：规则文件不应要求 agent 无条件执行来自网页/issue/日志的指令；AgentLinter 把「无 prompt injection defense」列为安全项 `[F]`（S12）。
- **权限边界要显式**：哪些目录只读、哪些命令需确认、哪些外部动作禁止，应写成可判定条目，而不是「注意安全」`[F]`（S12 的 permission boundaries）。

---

## 3. 反模式

| # | 反模式 | 典型表现 | 为什么坏 | 修法 | 来源 |
|---|---|---|---|---|---|
| 1 | 形容词堆砌 | 「专业、严谨、有温度、极致」 | 不可验证、不可判定，模型只能自由发挥 | 每条形容词翻译成一个可观察行为或输出契约 | S11、S2 `[F]` |
| 2 | 规则互相冲突 | 一处写 pnpm、一处写 npm；一处 Vitest、一处 Jest | 模型可能任选一条，行为不可预测 | 建单一事实源，其他文件引用；跨文件冲突检测 | S2、S10、S13 `[F]` |
| 3 | 规则不可验证 | 「保持代码优雅」「性能要好」 | 无法验收，等于没写 | 加触发条件、动作、验收命令/阈值 | S2、S9、S12 `[F]` |
| 4 | 裸条件与模糊限定 | 「如适用」「必要时」「尽量」 | 判定权交给模型，等于随机 | 写清判定条件与默认动作 | S12 `[F]`（Critical） |
| 5 | 一条规则塞多件事 | 一句话四个动作、三个主题 | 模型漏执行其中一项 | 一条一动作，必要时编号 | S12 `[F]` |
| 6 | 代词与指代不明 | 「更新它」「放在那里」 | 指代对象丢失 | 写全路径/文件名/字段名 | S12 `[F]` |
| 7 | 把一次性任务写进常驻 | 写死「本次修复 bug #123」「先改 login 页」 | 污染所有后续会话，且很快过期 | 移到对话或临时 override 文件 | S2、S3、S9 `[F]`；S17 的 override 模式 `[S]` |
| 8 | 把密钥/隐私写进规则 | token、私钥、真实客户名、内网 IP | 泄密 + 规则文件被提交后永久留存 | 改用环境变量/密钥管理；个人内容放 local 并 gitignore | S2、S12、S13 `[F]` |
| 9 | 超长与文档搬家 | 2,000 行 AGENTS.md、整份 API 文档 | 挤占上下文、关键规则被埋没、成本上升 | 只留「删掉会让模型犯错」的行；长篇移到 docs/skill | S2、S3 `[F]`；S16 成本 +20% `[F]` |
| 10 | 复制代码/风格指南 | 贴大段示例代码、整份 ESLint 规则 | 易过期、与真实代码脱节 | 指向规范文件/目录；风格交给 linter | S9 `[F]` |
| 11 | 只写「要做什么」，不写边界 | 没有拒绝策略、没有越界处理、没有升级路径 | 边界场景行为不可预测 | 补「不做什么 + 越界替代动作 + 升级条件」 | S11、S12 `[F]` |
| 12 | 身份与规则混写 | 人设文件里塞项目路径；全局规则里写个人语气 | 换项目即失真；作用域错配 | 按 §2.1.1 三层拆分 | S5、S8、S11 `[F]` |
| 13 | 语言/术语混用 | 同段中英夹杂、同一概念两种叫法 | 增加 token 与解释歧义，一致性检查失败 | 统一语言与术语表 | S12 `[F]`（工具口径） |
| 14 | 陈旧引用 | 指向已删除目录、已废弃 API、旧版本号 | agent 忠实执行错误指令并稳定失败 | 引用完整性 lint + 定期审计 | S13、S14 `[F]`/`[S]` |
| 15 | 把规则当安全控制 | 「禁止读取 .env」写在规则里就以为安全 | 提示层约束可被绕过，且可能被注入覆盖 | 用 hooks / permissions / sandbox / CI 落地 | S2、S9 `[F]` |

---

## 4. 可执行检查清单

> 使用方式：每条都给出「检查什么 / 不合格判定 / 建议改法 / 判定方式 / 严重度」。
> 判定方式分三类：**机器**（正则/解析/AST/文件系统）、**启发式**（统计 + 词表 + 相似度）、**LLM**（语义判断，需引用证据片段）。
> 严重度建议沿用同类工具口径：Critical / Warning / Info；打分可用 Critical=15、Warning=7、Info=2 的扣分制（agents-lint 的做法，`[F]` S13）。
> 误报控制：所有 LLM 判定必须回传「文件 + 行号 + 原文片段」，无证据不下结论（`[A]`，与同类产品证据链做法一致）。

### 4.1 Identity 检查清单（12 条）

| ID | 检查什么 | 不合格判定 | 建议改法 | 判定方式 | 严重度 |
|---|---|---|---|---|---|
| ID-01 | 角色定义是否存在且具体 | 全文无「你是/You are/角色」陈述；或只有「AI 助手」这类无领域、无职能的表述 | 补「职能 + 领域 + 优化目标」，并写「不是什么」 | 机器 + LLM | Critical |
| ID-02 | 受众与使用场景 | 未出现受众、知识水平、决策权、使用场景中任一项 | 补「为谁、在什么场景、用来做什么决定」 | LLM | Warning |
| ID-03 | 目标与成功标准 | 无「什么算完成/什么算好」；仅有「高质量」「有帮助」 | 改成可验收的输出契约（字段、条数、判定条件） | LLM | Critical |
| ID-04 | 语气与输出契约可执行 | 只有形容词（专业/友好/简洁）；未规定语言、长度、格式、称呼中至少两项 | 写「中文；先结论；≤300 字；不用感叹号；称『你』」 | 机器（词表）+ LLM | Warning |
| ID-05 | 边界与拒绝策略 | 否定型约束 < 2 条；或没有「越界时怎么办」 | 至少 3 条「不做 X → 改做 Y」；补拒绝/转交条件 | LLM | Critical |
| ID-06 | 不确定/信息缺失时的行为 | 未规定提问、停下、声明假设中的任一策略 | 明确触发条件与默认动作（如「歧义 ≥2 处先提问」） | LLM | Warning |
| ID-07 | 是否有正例/输出样例 | 无任何示例、无 before/after、无输出骨架 | 加 1–3 个示例，覆盖正常/边界/拒绝 | 机器（代码块/「例」标题）+ LLM | Warning |
| ID-08 | 可验证性（空洞表达密度） | 形容词/空洞副词密度超阈值（如每 100 字 > 3 个「专业/高效/优质/极致/赋能」）；或出现「适当/尽量/必要时」无限定 | 每个空洞词替换为可观察行为；裸条件补判定标准 | 启发式 + LLM | Warning |
| ID-09 | 身份与任务/项目规则是否分层 | 身份文件中出现具体项目路径、内部命令、日期、工单号、一次性任务 | 移到 rules 或对话；身份只保留跨项目稳定内容 | 机器（路径/日期/编号正则）+ LLM | Critical |
| ID-10 | 长度与内部冗余 | > 120 行或 > 1,500 tokens；或段落相似度 > 0.9 的重复表述 ≥ 2 处 | 删「删掉也不影响行为」的段落；合并重复 | 机器 + 启发式 | Warning |
| ID-11 | 隐私与密钥 | 命中密钥/私钥/内网 IP/邮箱/真实姓名/客户名模式 | 立即移除并轮换已泄露凭证；改占位符 | 机器（正则） | Critical |
| ID-12 | 与规则文件的一致性（persona alignment） | 身份文件规定的语气/语言/角色，与 rules 中的规定不同（如身份说中文、规则说英文回复） | 建单一事实源：身份定语气，规则只做项目约束；冲突处删除一方 | 机器（关键字段比对）+ LLM | Critical |

### 4.2 Rules 检查清单（12 条）

| ID | 检查什么 | 不合格判定 | 建议改法 | 判定方式 | 严重度 |
|---|---|---|---|---|---|
| RU-01 | 长度与 token 预算 | 单文件 > 200 行（Claude 口径）或 > 500 行（Cursor 口径）；估算 > 3,000 tokens；拼接 > 32 KiB | 拆分到路径规则；长流程移到 skill；删可推断内容 | 机器 | Warning / Error（按阈值） |
| RU-02 | 结构可扫描性 | 200 行以上无任何标题；单段 > 15 行；同类规则散落多处 | 加二级标题分组（命令/风格/测试/提交/安全）；同类合并 | 机器 | Warning |
| RU-03 | 每条规则可执行 | 缺动作动词；缺对象（文件/命令/字段）；缺验收标准（命令、退出码、阈值） | 改写为「触发条件 + 动作 + 验收」；补可运行命令 | 启发式 + LLM | Critical |
| RU-04 | 原子性（一条一事） | 单条含 ≥ 3 个动作，或跨 ≥ 2 个主题 | 拆条并编号；必要时分组 | 启发式（连接词/分句）+ LLM | Warning |
| RU-05 | 裸条件与模糊限定 | 命中「如适用/必要时/适当/尽量/酌情/if appropriate/as needed」且无判定标准 | 补判定条件与默认动作，或删除该条 | 机器（词表）+ LLM | Critical |
| RU-06 | 跨文件冲突 | 同一主题取值不一致：包管理器、测试框架、缩进、语言、目录约定、提交格式 | 指定唯一事实源；其他文件改为引用；删除过时一方 | 机器（实体抽取 + 比对） | Critical |
| RU-07 | 重复与近重复 | 文件内/跨文件规则相似度 > 0.85；同一命令出现 ≥ 2 次 | 保留一处，其余引用；合并同义规则 | 启发式（相似度） | Warning |
| RU-08 | 作用域匹配 | 只适用于某目录/技术栈的规则被设为 always；或全局规则含项目专属路径 | 改为 glob/path 规则或移到子目录规则文件 | 机器（路径/技术栈词）+ LLM | Warning |
| RU-09 | 引用完整性 | 提到的路径不存在；`npm run x`/`make x` 不存在；包不在依赖中；API 已废弃；含 TODO/FIXME；出现早于 2024 的版本/年份 | 删除或更新引用；改为指向规范文件；处理 TODO | 机器 | Critical（路径/命令）/ Warning（过时） |
| RU-10 | 密钥与隐私 | 命中密钥、token、私钥头、内网地址、真实客户/个人信息 | 移除、轮换、改环境变量；个人内容放 local 并 gitignore | 机器（正则） | Critical |
| RU-11 | 优先级与裁决信号 | 存在互斥要求但无「必须/建议/禁止」或 P0–P2 标注；无冲突裁决说明 | 加优先级标签；写明冲突时以哪条为准 | 启发式 + LLM | Warning |
| RU-12 | 常驻 vs 按需 | 常驻规则中出现多步教程、长篇背景、一次性任务、单模块细节 | 下沉到 skill / 路径规则 / 对话；常驻只留全员每次需要的内容 | LLM | Warning |

### 4.3 建议的诊断输出结构（供 spec 参考）

```ts
interface AssetFinding {
  ruleId: string;            // 如 "RU-05"
  category: "identity" | "rules";
  severity: "critical" | "warning" | "info";
  file: string;
  line?: number;
  evidence: string;          // 原文片段，≤120 字
  message: string;           // 不合格判定的人话解释
  suggestion: string;        // 可执行改法
  detector: "machine" | "heuristic" | "llm";
  confidence: number;        // 0–1；LLM 判定必须 < 1
}
```

`[A]`：`detector` 与 `confidence` 是控制误报的关键字段——同一 ruleId 在 machine 与 llm 两条通道下应有不同的严重度上限。

---

## 5. 来源清单

> 全部链接于 2026-11-14 检索/访问。层级：① 官方/一手，③ 二手/评测。

1. **S1** `[F]` AGENTS.md 开放格式官网 — https://agents.md/
   支撑：定位为「给 agent 的 README」；无必填字段；嵌套文件「最近的赢」、聊天指令覆盖一切；推荐章节（概览/构建测试/代码风格/测试/安全）；60k+ 项目使用；由 Agentic AI Foundation（Linux Foundation）托管。

2. **S2** `[F]` Claude Code Docs — How Claude remembers your project（CLAUDE.md / memory）— https://code.claude.com/docs/en/memory
   支撑：四类作用域与加载顺序；全部拼接、宽→窄；子目录按需加载；< 200 行；矛盾时可能任选；context 非强制配置、硬阻断用 hooks；`@import` 不降成本；HTML 注释被剥离；`/doctor prompt-audit`；`CLAUDE.local.md` 应 gitignore。

3. **S3** `[F]` Claude Code Docs — Best practices（Write an effective CLAUDE.md）— https://code.claude.com/docs/en/best-practices
   支撑：Include/Exclude 表；「删掉这行会不会让 Claude 犯错」自检法；文件过长会导致规则被忽略；强调词可提升遵循度；规则要像代码一样定期修剪。

4. **S4** `[F]` Anthropic — Prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering
   支撑：清晰直接；正例通常优于负例（降低冗长）；更字面地遵循指令，需显式声明作用域；示例与结构化输出。

5. **S5** `[F]` Anthropic — Giving Claude a role with a system prompt — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/system-prompts
   支撑：角色放 `system`，其余任务指令放 user turn；角色可提升准确率、语气与聚焦；角色越具体（领域/职能）差异越大。

6. **S6** `[F]` Anthropic — Multishot prompting（use examples）— https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting
   支撑：3–5 个相关、多样、清晰的示例；示例提升准确率与一致性；建议用 `<example>` 包裹。

7. **S7** `[F]` Anthropic — Be clear, direct, and detailed — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/be-clear-and-direct
   支撑：提供受众、用途、工作流位置、终局；把指令写成顺序步骤；「给同事看能否照做」的黄金法则。

8. **S8** `[F]` OpenAI — Prompt engineering guide — https://platform.openai.com/docs/guides/prompt-engineering
   支撑：`instructions` 参数承载 tone、goals、正确响应示例且优先于 input；developer/user 角色层级；developer message 推荐四段：Identity / Instructions / Examples / Context；Markdown 标题与 XML 标签用于划分边界。

9. **S9** `[F]` Cursor Docs — Rules — https://cursor.com/docs/context/rules
   支撑：四类规则；四种生效方式；Best practices（< 500 行、拆分、具体示例、避免模糊）；What to avoid（复制风格指南、记录所有命令、罕见边界、复制代码）；Team → Project → User 优先级；AGENTS.md 作为简化替代；规则不应是唯一安全控制。

10. **S10** `[F]` TRAE Docs — 规则（Rule）— https://docs.trae.ai/ide/rules
    支撑：全局 `~/.trae/user_rules` 与项目 `.trae/rules`；四种生效方式；最多 3 层嵌套；子目录规则按需携带；`@Rule` 优先级最高；可导入 AGENTS.md / CLAUDE.md / CLAUDE.local.md；最佳实践（粒度、不冲突、相对路径、优先引用强相关规则、改规则后开新对话、存量坏代码会带偏模型）。

11. **S11** `[F]` Microsoft Fluent 2 — Content engineering（system prompt engineering）— https://fluent2.microsoft.design/content-engineering
    支撑：Role / Task / Rules / Example output 四组件；角色三问（是什么、优化什么、不是什么）；语气必须显式编码、不能靠模型推断；Specificity / Steps / Response shape 的 Do-Don't；约束类别（安全、非拟人化、诚实能力、反谄媚、升级路径、范围边界、缺数据处理）。

12. **S12** `[F]` AgentLinter — npm / GitHub README — https://www.npmjs.com/package/agentlinter ；https://github.com/seojoonkim/agentlinter
    支撑：八维评分（结构/清晰/完整/安全/一致/记忆/运行时/技能安全）；clarity 规则（naked conditionals Critical、compound instructions、ambiguous pronouns、missing priorities、vague language）；completeness（identity、tools、boundaries、error recovery）；security（secret、injection defense、permission boundaries）；consistency（persona alignment、permission conflicts、broken references、language mixing）；structure（200+ 行无标题）；token budget（建议 ≤ 3,000、filler 短语、< 150 tokens 过稀）。

13. **S13** `[F]` agents-lint — npm README — https://www.npmjs.com/package/agents-lint
    支撑：路径存在性、npm scripts、Make targets、依赖与废弃包、框架过时模式、结构（<100 字符/<15,000 字符、TODO/FIXME、2024 前年份）、跨文件一致性（包管理器冲突 Error、脚本角色冲突 Warning、路径不对称 Info）、Claude 记忆文件索引/字段；0–100 freshness 评分与扣分权重。

14. **S14** `[S]` Yaw Labs — Lint Your CLAUDE.md and AGENTS.md Before Your Agent Does — https://yaw.sh/blog/agents-md-claude-md-linter/
    支撑：机械可查项清单（死路径、假命令、跨文件矛盾、粘贴密钥、MCP 配置密钥、死 hook、token 成本）；「lint 回答真不真/贵不贵，不回答对不对」；各工具评分权重是主观的；路径腐烂最常见且可自动修。

15. **S15** `[F]` IFScale — How Many Instructions Can LLMs Follow at Once?（arXiv:2507.11538）— https://arxiv.org/pdf/2507.11538
    支撑：500 条关键词指令密度下，最强前沿模型仅约 68% 准确率；20 个模型、7 家供应商；存在「阈值衰减」（约 150–250 条后陡降）等退化模式。

16. **S16** `[F]` Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?（arXiv:2602.11988）— https://arxiv.org/pdf/2602.11988
    支撑：上下文文件总体上没有提升任务成功率，反而使推理成本平均增加 20% 以上；对 LLM 自动生成与开发者手写两类设置均成立（摘要口径）。

17. **S17** `[S]` Codex Knowledge Base — AGENTS.md Advanced Patterns — https://codex.danielvaughan.com/2026/03/26/agents-md-advanced-patterns/
    支撑：`~/.codex` → repo root → cwd 的拼接顺序；同层 `AGENTS.override.md` 优先；`project_doc_max_bytes` 默认 32 KiB、超出即停止发现；空文件跳过；每次运行重建指令链。**默认值未在官方页直接核到，按二手处理。**

18. **S18** `[S]` AI/TLDR — AGENTS.md and CLAUDE.md: Context Files Explained — https://ai-tldr.dev/learn/ai-coding-tools/coding-agents-assistants/agents-md-claude-md/
    支撑：目标 < 200 行；每次会话/每轮都消耗 token；1,000 行文件会埋没关键规则；只写能改变行为且代码里看不出的内容。

19. **S19** `[S]` Persistent Personas? Role-Playing, Instruction Following, and Safety in Extended Interactions（arXiv:2512.12775）— https://arxiv.org/html/2512.12775
    支撑：随对话变长，角色保真度持续下降；目标导向对话更明显；模型倾向回落到基线行为。**单一来源，仅作方向性参考。**

20. **S20** `[S]` OpenAI Codex Docs — Advanced Configuration — https://developers.openai.com/codex/config-advanced
    支撑：Codex 从工作目录向上发现 `.codex/` 层与 `AGENTS.md`，默认以含 `.git` 的目录为项目根；项目级配置仅在项目受信任时加载（说明规则文件的信任边界）。

---

### 附：证据强度说明

- **双来源以上**：身份/规则分层（S5/S8/S11）、可验证性（S2/S7/S9/S11/S12）、冲突风险（S2/S9/S10/S13）、长度预算（S2/S9/S15/S18）、内容取舍（S2/S3/S9）、规则非安全边界（S2/S9）、lint 的机械边界（S12/S13/S14）。
- **单来源已降级**：32 KiB 默认值（S17/S18 一致但均为二手）、角色漂移（S19）、语言混用成本（S12 工具口径）。
- **本报告工程判断 `[A]`**：身份文件 80–120 行 / 1,500 tokens 的建议阈值；诊断严重度映射；`AssetFinding` 结构；「身份不依赖项目 rules」的分发原则。
