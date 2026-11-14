# research-ai-deep-diagnosis-2026-11-14

> 服务对象：AssetPlex P1-4「AI 深度诊断」
> 调研边界：**如何把「资产体检」从静态规则升级为可信的 AI 深度诊断**——证据链、规则与 LLM 分工、误报控制、隐私与成本边界。
> 不展开：模型微调、自建推理集群、具体供应商选型报价。
> 检索日期：2026-11-14。标注：`[F]` 官方口径/可验证事实，`[S]` 二手或厂商材料，`[A]` 推定/设计判断。

---

## 0. 核心结论（先给答案）

1. **业内没有「纯 LLM 体检」这种成熟形态**。可规模化的产品都是「确定性规则先筛 → LLM 做解释/归因/降噪」的两段式，Semgrep Assistant 是最典型样本。`[F]`
2. **证据链是可信度的地基**：每条结论必须绑定「文件 + 行/片段 + 触发规则 + 影响」，而不是一段自由文本建议。Semgrep 的解释、MCP-Scan 的 issue code 都是这个结构。`[F]`
3. **LLM 天然过度判错**：ASE 2025 论文实测 LLM 在「代码是否符合自然语言规格」上系统性把正确实现判成有问题，且**让它解释得越多、误判率越高**。所以 AI 诊断只能做增量，不能做唯一裁判。`[F]`
4. **降噪比召回更影响信任**。Semgrep 官方数据：AI 降噪过滤掉 60% 的告警，人工同意率 96%，每条平均省 30 分钟；行业调查则显示开发者对「差一点就对」的输出最反感。`[F]` / `[S]`
5. **资产类诊断有独立维度**，不能照搬代码审查：规则要看「模糊/冲突/不可执行」，技能要看「路由描述是否可触发 + 渐进披露」，MCP 要看「工具投毒 + 供应链变更（rug pull）」，记忆要看「过期/重复/与现行规则矛盾」。`[F]`（MCP-Scan、AgentLinter、agent-skill-linter）
6. **MCP 安全已有可复用的工程范式**：静态扫描工具描述中的隐藏指令、用哈希做 tool pinning 检测变更、输出 JSON 供上层消费。AssetPlex 可直接借鉴其「扫描 → issue code → JSON」结构。`[F]`
7. **隐私边界必须是产品设计的一部分**：默认本地静态诊断；AI 只发「必要证据片段」而非全文；支持 BYOK 与本地模型；OWASP LLM02（敏感信息泄露）与 LLM10（无界消耗）是必须写进 spec 的风险项。`[F]` / `[A]`
8. **AI 诊断必须自带评测集与人工复核闭环**，否则无法证明「不是胡说」。行业做法是「人工标注集 + 同意率/误报率 + 反馈回流」，Semgrep 用内部基准 + 用户点赞双轨。`[F]`

---

## 1. 资源盘点表

| 来源 | 类型 | 层级 | 对本次的价值 |
|---|---|---|---|
| Semgrep Assistant 官方文档 | 商业产品文档 | ① 官方 | 两段式架构、解释/修复/自动分诊、降噪、 memories |
| Semgrep Assistant 指标页 | 官方数据 | ① 官方 | 96% 人工同意、60% 降噪、30 分钟/条等可引用数字 |
| Promptfoo 文档 | 开源工具文档 | ① GitHub/官方 | 评测与红队、CI 门禁、数千探针的量化风险 |
| MCP-Scan（Invariant Labs） | 开源工具文档 | ① GitHub/官方 | MCP 配置扫描、工具投毒、哈希 pinning、JSON 输出 |
| OWASP Top 10 for LLM 2025 | 行业标准 | ① 官方 | 诊断项分类与风险命名（LLM01/02/03/06/07/09/10） |
| AgentLinter | 开源产品站 | ①/③ | 五维 lint：清晰度/结构/安全/记忆/一致性 |
| agent-skill-linter（GitHub） | 开源仓库 | ① GitHub | SKILL.md 规范、路由信号质量、渐进披露检查 |
| agents-lint / alint | 开源工具 | ③ | 路径引用完整性、可执行的修复指令 |
| ASE 2025 论文（arXiv:2508.12358） | 同行评审论文 | ① 学术 | LLM 判错的系统性证据与提示词反效果 |
| Augment / Signal65 / 开发者调查 | 厂商或行业报告 | ③/④ | 开发者信任与误报代价的经验锚点 |

---

## 2. 主体分析

### 2.1 三种成熟形态

**A. 规则优先 + LLM 增强（Semgrep Assistant）** `[F]`
- 确定性引擎先产出 finding（规则、位置、严重度、置信度），LLM 只做三件事：解释为什么是问题、给出修复建议、判断是否误报。
- 关键工程点：只对**新增且高危**的 finding 自动分析（全量扫描仅 Critical/High + High/Medium 置信度；PR 扫描每次最多 10 条），用范围控制成本。
- 支持 memories：把团队偏好/历史反馈注入后续建议，避免重复纠正。
- 产出有「你的代码 / 规则说明 / 解释」三栏，证据与结论分离。

**B. 评测/红队型（Promptfoo）** `[F]`
- 把「诊断」变成可回归的测试：用大量探针模拟攻击与异常输入，量化风险并设阈值，CI 里非零退出阻断发布。
- 适合 AssetPlex 的部分不是「攻击用户资产」，而是**诊断规则本身也要有评测集**：同一批资产在不同版本诊断器下结果应可比较。

**C. 资产/配置 lint 型（AgentLinter、agent-skill-linter、MCP-Scan）** `[F]`/`[S]`
- AgentLinter：按清晰度、结构、安全、记忆、一致性五维扫描 CLAUDE.md/AGENTS.md 类文件，强调「抓泄露密钥、模糊指令、坏引用」。
- agent-skill-linter：检查 SKILL.md frontmatter、必填字段、description 前缀、命名、渐进披露结构。
- MCP-Scan：扫描 Claude/Cursor/Windsurf 等客户端配置，检测工具描述里的提示注入与 tool poisoning、跨服务引用、用哈希做 tool pinning 发现 rug pull，并支持 `--json` 供上层消费。

> 对 AssetPlex 的含义：我们要做的不是再写一个「代码审查器」，而是**资产领域的语义体检器**——规则层覆盖可判定的坏味道，LLM 层负责「这条规则为什么会误导模型」这类需要理解语义的问题。

### 2.2 证据链的最小结构

综合以上产品，一条可信诊断至少包含：

| 字段 | 作用 | 参考来源 |
|---|---|---|
| `ruleId` / `issueCode` | 可稳定引用、可回归 | Semgrep rule、MCP-Scan E001… |
| `evidence[]`（path + line/片段） | 让用户自己复核 | Semgrep「Your code」三栏 |
| `impact`（威胁模型/后果） | 说明为什么值得改 | Semgrep 安全规则 threat model |
| `suggestion`（可执行动作） | 修复或忽略 | Semgrep remediation / alint 修复命令 |
| `confidence` / `severity` | 决定是否打扰用户 | Semgrep 置信度门槛 |
| `source`（rule / llm） | 区分确定性与推断 | 本报告设计建议 `[A]` |

**反例**：只给「你的规则写得不够清晰」+ 一段重写建议，没有原文定位、没有影响说明——这正是开发者最反感的「almost right」。`[S]`

### 2.3 误报控制：三个必须写进产品的机制

1. **LLM 不能单独下结论**。ASE 2025 的研究发现，LLM 在判断「实现是否满足自然语言规格」时会系统性高估缺陷；更糟的是，要求它「解释 + 给修复」会让误判率进一步上升。`[F]`
   → 对策：LLM 输出必须被结构化约束（只能引用已提供的证据、只能从枚举的问题类型里选），并提供「证据不足 → 不下结论」的出口。
2. **降噪优先于全量**。Semgrep 的做法是默认不打扰：疑似误报不进 PR 评论，但在后台保留可复核入口，用户可同意/不同意并回流。`[F]`
   → 对策：向导只展示 Top N 高置信问题；「AI 认为没问题」也要可查看，不能黑箱吞掉。
3. **用数据证明可信**。Semgrep 双轨：3500+ 客户、650 万 finding 的用户反馈 + 2000+ finding 的内部专家基准；对外给「人工同意率 / 误报置信率」而不是「准确率」一个笼统词。`[F]`
   → 对策：AssetPlex 先建 30–50 条人工标注的资产样本（含「应报/不应报」），每次改提示词或模型都跑回归，记录 precision/recall 与人工同意率。

### 2.4 成本与隐私边界

- **范围控制**：只分析高风险/新增项（Semgrep 做法），避免对全部资产全文调用。`[F]`
- **最小传输**：只发命中规则附近的片段 + 结构化元数据，默认不发整份资产；这与 OWASP LLM02（敏感信息泄露）一致。`[F]`
- **本地优先**：静态诊断零 Key 可用；AI 为可选增量，支持 BYOK 与本地模型（Ollama）。`[A]`，与 AssetPlex 现有 AI 分类配置一致。
- **用量护栏**：按资产数分批、内容哈希缓存、单次 token 预算、超限降级为静态结果；对应 OWASP LLM10（无界消耗）。`[F]`/`[A]`
- **可撤销**：任何「一键应用」必须有撤销与备份；MCP-Scan 的 pinning 思路可借鉴到「资产变更前后哈希对比」。`[F]`

### 2.5 适配筛选：哪些适用、哪些不适配

| 做法 | 是否适用 AssetPlex | 理由 |
|---|---|---|
| 规则产出 finding、LLM 只解释/降噪 | ✅ 直接采用 | 与现有静态健康分天然衔接，成本可控 |
| 证据三栏（原文/规则/解释） | ✅ 直接采用 | 向导「查看详情」已有类似交互，可扩展 |
| 自动分诊 + 用户反馈回流 | ✅ 采用（轻量版） | 先做「有用/没用」两键，不做复杂工单 |
| 红队式数千探针 | ⚠️ 只用于诊断器自测 | 不对用户资产发起攻击性探测 |
| 代码级数据流分析 | ❌ 不复用 | 资产是提示词/规则/配置，不是可执行代码 |
| 云端全量上传分析 | ❌ 不做默认 | 隐私边界与本地优先原则冲突 |
| 用 LLM 直接给「健康分」 | ❌ 不做 | 分数不可解释、不可回归；分数仍由规则计算 |

---

## 3. 可执行方案（给 P1-4 的初稿）

### 3.1 诊断结果模型（建议进 `api-contract.ts`）

```ts
type DiagnosisSource = 'rule' | 'llm';
type DiagnosisSeverity = 'critical' | 'high' | 'medium' | 'low';
type DiagnosisCategory =
  | 'rule-vague' | 'rule-conflict' | 'rule-unenforceable'
  | 'skill-routing' | 'skill-structure' | 'skill-duplicate'
  | 'mcp-poisoning' | 'mcp-supply-chain' | 'mcp-permission'
  | 'memory-stale' | 'memory-conflict'
  | 'secret-leak' | 'stale-reference';

interface DiagnosisEvidence {
  path: string;
  line?: number;
  snippet: string;
}

interface DiagnosisFinding {
  id: string;
  ruleId: string;
  category: DiagnosisCategory;
  severity: DiagnosisSeverity;
  confidence: 'high' | 'medium' | 'low';
  source: DiagnosisSource;
  title: string;
  evidence: DiagnosisEvidence[];
  impact: string;
  suggestion: string;
  /** LLM 未拿到足够证据时必须为 true，前端显示「证据不足」而不是硬下结论 */
  insufficientEvidence?: boolean;
  actions?: Array<{ kind: 'open-file' | 'apply-fix' | 'ignore'; payload?: unknown }>;
}
```

### 3.2 两阶段流程

1. **静态阶段（零 Key，必达）**：扩展现有四维健康检查，新增可判定规则：
   - 规则：超长、无动作动词、与 always 规则冲突、包含无法执行的模糊表述；
   - 技能：description 过短/无触发词、正文与 description 不一致、重复技能；
   - MCP：工具描述含隐藏指令/跨服务引用、配置哈希变化（pinning）；
   - 记忆：引用了不存在的路径/文件、与现行规则矛盾。
2. **AI 阶段（可选，BYOK）**：只对静态阶段产出的 medium 以上 finding 做「解释 + 影响 + 建议」，强制结构化输出；证据不足返回 `insufficientEvidence`。
3. **合并**：同一 ruleId 以规则结果为准，AI 只补充 impact/suggestion；不允许 AI 新增无证据的 finding（MVP）。

### 3.3 评测与门禁

- 建 30–50 条标注样本（覆盖四类资产 × 应报/不应报），落盘在 `tests/fixtures/diagnosis/`。
- 指标：precision ≥ 0.85、recall ≥ 0.70、人工同意率 ≥ 0.85（初值，跑完基线再定）。
- 每次改提示词/模型必须跑回归；CI 里不阻断构建，但报告差异。
- 用户侧反馈两键（有用/没用）写本地，作为后续规则权重依据。

### 3.4 UI 落点

- 向导体检屏：只显示 Top 3 高置信 finding + 总数；每条可展开证据（复用本次「查看详情」交互）。
- 完整报告：独立体检页（后续治理中心），支持按类别/严重度筛选、逐条应用/忽略/撤销。
- 零 Key 时：静态结果完整可用，AI 区域显示「配置模型可解锁语义诊断」，不阻断下一步。

### 3.5 里程碑

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M1 | 静态规则扩展 + 证据模型 + 标注集 | 规则 findings 全带证据；回归指标达标 |
| M2 | AI 增量诊断（BYOK、结构化、预算护栏） | 证据不足不下结论；单次成本可估算 |
| M3 | 反馈回流 + 应用/撤销 + 完整报告页 | 人工同意率可统计；误报可一键纠正 |

---

## 4. 来源清单

**官方/一手**
- [Semgrep Assistant overview](https://semgrep.dev/docs/semgrep-assistant/overview)（2026-03-13 更新，检索 2026-11-14）`[F]`
- [Semgrep Assistant metrics and methodology](https://semgrep.dev/docs/semgrep-assistant/metrics)（2025-08-21）`[F]`
- [Promptfoo: LLM red teaming](https://www.promptfoo.dev/docs/red-team/) `[F]`
- [Promptfoo: CI/CD integration](https://www.promptfoo.dev/docs/integrations/ci-cd/) `[F]`
- [MCP-Scan documentation](https://invariantlabs-ai.github.io/docs/mcp-scan/) `[F]`
- [MCP-Scan issue code reference](https://invariantlabs-ai.github.io/docs/mcp-scan/issue-code-reference/) `[F]`
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/) `[F]`
- [OWASP LLM06:2025 Excessive Agency](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html) `[F]`
- [AgentLinter](https://agentlinter.com/) `[S]`（产品站，自称开源；未核验仓库）
- [agent-skill-linter README](https://raw.githubusercontent.com/William-Yeh/agent-skill-linter/main/README.md) `[F]`（GitHub 原始文件）
- [CodeRabbit Knowledge Base](https://docs.coderabbit.ai/knowledge-base) `[S]`（厂商文档）

**学术**
- Jin & Chen, *Uncovering Systematic Failures of LLMs in Verifying Code Against Natural Language Specifications*, ASE 2025, [arXiv:2508.12358](https://arxiv.org/abs/2508.12358) `[F]`
- *Trust or Escalate: LLM Judges with Provable Guarantees for Human Agreement*, ICLR 2025 `[F]`

**行业/二手（只作经验锚点）**
- [How Accurate Is AI Code Review?](https://www.augmentcode.com/guides/ai-code-review-accuracy) `[S]`（引用 Stack Overflow 2025 调查：46% 不信任 / 33% 信任；66% 最反感「almost right」）
- [Signal65: Evaluating AI Code Review Tools](https://signal65.com/wp-content/uploads/2026/03/Signal65-Insights_Evaluating-AI-Code-Review-Tools.pdf) `[S]`（厂商委托研究，样本有限，误报计数仅作方向参考）
- [AGENTS.md Configuration Smells](https://www.developersdigest.tech/blog/agents-md-configuration-smells-catalog-2026) `[S]`（观点文，提供「配置坏味道」分类线索）

---

## 5. 未展开但需后续决策的问题

1. 诊断器默认模型选型（云 vs 本地）与定价，需结合用户 BYOK 现状单独评估。
2. 是否允许 AI 修改资产正文（不仅是建议）；涉及备份/撤销与信任门槛。
3. 跨工具「同一资产的版本漂移」是否纳入诊断，还是继续放在同步/分发模块。
4. 评测样本由谁维护、如何避免把维护者偏好写成「行业最佳实践」。
