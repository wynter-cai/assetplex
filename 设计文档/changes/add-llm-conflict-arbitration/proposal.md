# proposal: add-llm-conflict-arbitration（裁决准则元资产化 + LLM 冲突仲裁）

> 级别：S（新资产类别 + 新能力模块 + 新 API + 新 UI 接入）
> 关联规格：refactor-skill-origin-taxonomy（出处体系）、enable-tool-hot-swap（预览-确认-备份-回滚骨架）、assetplex-p0-p1-conflict-spec（导入冲突处理现状）、refactor-skill-asset-first-view（资产/环境口径）、**add-asset-doctor（后续变更：同一准则地基上的诊断/修复/分发能力，维护者 2026-10-18 追加需求）**
> 状态：待维护者审核

## 为什么做（背景）

1. **冲突处理现状是"纯字节级 + 全抛回人工"**：`computeConflict` 只判 none/exists/differs；differs 一律"未确认不覆盖"，导入向导里两边内容各演化了什么，用户得人肉 diff 决策。资产在多个工具间长期使用后必然语义级分叉，这正是"智能管理"该发力而现在是空白的地方。
2. **维护者拍板（2026-10-18）**："不同工具之间资产发生冲突，该引入大模型仲裁；同时要把优秀最佳实践（skill 设计最佳实践、token 效率规则等）放进裁决大模型的 prompt 里，软件要真正做到智能管理，把这些核心资产好好用起来。"
3. **本变更的设计支点——裁决准则本身也是一类资产（元资产）**：skill 设计最佳实践、token 效率准则、规则文件简洁性准则，不硬编码在 prompt 字符串里，而是作为 `criterion` 类别资产存进我的库：有版本、可编辑、可从工具沉淀。仲裁时动态组装进 system prompt。闭环效果：维护者优化一条准则，所有冲突裁决跟着变聪明——"用自己的机制管理管理标准"，这是资产 hub 定位的完成态。

## 目标

| # | 目标 | 用户可见结果 |
|---|------|-------------|
| G1 | criterion 资产类别落地 | 资产库出现「裁决准则」页：新建/编辑/删除准则卡（每条一个 md），有内置示例模板 |
| G2 | 准则组装进仲裁 prompt | 仲裁请求按准则优先级动态拼装 system prompt，超预算截断并在建议中披露 |
| G3 | LLM 冲突仲裁（advisory） | 导入向导 differs 冲突项出现「AI 仲裁」：给出建议侧 + 理由 + 合并草案；不点采纳什么都不变 |
| G4 | 合并草案可采纳 | 草案可编辑后「以此为准」，走现有导入 merge 写库路径（同名校验、备份语义不变） |
| G5 | 确定性冲突不烧 token | none/exists 项不显示仲裁入口；同内容对+同准则集二次仲裁命中缓存 |

## 非目标（明确不做）

- ❌ **自动裁决/自动落盘**：LLM 输出永远是建议；"我的库"被模型悄悄改内容是信任红线（决策 D1）
- ❌ swap 分发方向的仲裁入口（本次只做导入方向；分发 differs 已有显式确认+备份+回滚，入口下期按同一契约扩展）
- ❌ 市场技能智能策展（待办第 4 项，复用本基建另立变更）
- ❌ GitHub 外部技能源（待办第 2 项）
- ❌ 资产医生（诊断/一键修复/分发）：维护者 2026-10-18 追加需求，另立变更 **add-asset-doctor**，复用本变更的准则元资产与 LLM 基建
- ❌ 多轮对话式协商（单轮建议 + 人拍板）
- ❌ 准则跨工具分发（准则服务内部仲裁；作为 rule 分发到工具是伪需求——各工具的最佳实践应由各工具自己的 rule 承担）
- ❌ 字节级/祖先关系等确定性判定的模型化（可确定性代码做的不用 LLM）

## 关键决策

- **D1 advisory-only**：仲裁结果只渲染为建议卡；采纳动作全部映射到既有写路径（merge 策略），不新增"AI 直写"通道。
- **D2 criterion 为新的 Hub 资产类别**：存储 `Hub/criteria/<slug>.md`（扁平单文件，frontmatter：name/description/priority/enabled/appliesTo/source）；`HubFileCategory` 与资产页导航按动态类别机制扩展，不写死数量（AGENTS.md 铁律）。准则可服务仲裁与诊断两类消费方（appliesTo 标适用范围）。内置**业内准则包**（精选 skill 设计/agent 配置/token 效率等最佳实践，带来源标注）仅在用户点「导入业内准则包」时按勾选生成，不自动播种进库。
- **D3 复用 AI 分类基建**：LlmClient DI（core 纯函数 + server Node 实现）、aiConfigStore 配置、内容哈希缓存。仲裁缓存 key = sha256(左内容 + 右内容 + 准则集哈希 + model)——内容或准则变更自然失效。
- **D4 闭集输出 + 失败隔离**：decision ∈ keep-left / keep-right / merge / manual-review，严格 JSON 解析（容忍 fenced），非法输进失败明细（带错误文案），永不部分生效。merge 必带 mergedContent，其余可省。
- **D5 准则预算**：进 prompt 的准则按 priority 升序取，总字符预算 4000（与分类 prompt 同一量级）；截断时在建议的 `criteriaSkipped` 中披露"有 N 条准则未参与"。
- **D6 隐私口径**：资产内容发送至用户自配 OpenAI 兼容端点，与 AI 分类同性质（用户显式触发、端点用户自有）；PRIVACY.md/data-and-privacy.md 核对补一行仲裁说明（tasks D4）。

## 影响面

- `src/core/`：新文件 `criteria.ts`（准则 CRUD 纯逻辑）、`arbitration.ts`（prompt 组装/解析/执行）；`hub-files.ts` 增 criterion 类别
- `src/server/`：新路由 `routes/arbitration.ts` + criteria 复用 hub 文件路由模式；llm client 复用
- `web/`：新页面「裁决准则」（复用资产页框架）；`ConflictDialog` 增 AI 仲裁区
- 分类法文档：`assetplex-asset-taxonomy.md` 增「元资产」层（验收时修订，非代码）
- 不动：swap 执行链路、同步引擎、扫描器、AI 分类管线

## 回滚

三张 capability 相互独立分 commit：revert UI commit 回到手动 diff 决策；revert 后端 commit 后 criterion 目录残留但不被读取；引擎扫描范围零改动。
