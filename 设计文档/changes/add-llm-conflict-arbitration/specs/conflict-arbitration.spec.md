# conflict-arbitration.spec.md：LLM 冲突仲裁与合并草案

> capability: differs 冲突的模型仲裁建议、合并草案采纳、缓存与失败隔离
> 变更: add-llm-conflict-arbitration | 决策依据: proposal.md D1/D3/D4/D6

## 定义

- **仲裁输入**：一个 differs 冲突项，左=Hub/导入源内容，右=目标工具已存在内容，附资产类别与两侧来源标签
- **仲裁建议（advisory）**：模型输出 decision（keep-left / keep-right / merge / manual-review）+ 理由 + 可选合并草案；**永不自动落盘**
- **内置基线**：即使库内无准则，system prompt 也含一段不依赖外部资产的最小裁决骨架（对比两侧、给出决策、要求 JSON）；准则集为空时 `criteriaUsed=[]`

## Scenario 1：differs 冲突项出现 AI 仲裁入口

- **Given** 导入向导 Step 3 某冲突项 conflict=differs
- **When** 用户展开该项
- **Then** diff 预览下方出现「AI 仲裁」按钮；conflict=none/exists 的项不显示该按钮（确定性冲突不烧 token，proposal G5）

## Scenario 2：一次仲裁产出结构化建议并渲染

- **Given** 用户已配置 AI 端点且库内有 ≥1 条 enabled 准则
- **When** 点击「AI 仲裁」
- **Then** 请求模型（左内容+右内容+按 Scenario5 组装的准则），返回后渲染建议卡：决策徽标（保留导入版/保留现有版/智能合并/需人工复核）+ 理由 + 命中准则清单 + 「N 条准则未参与」提示（若有截断）

## Scenario 3：合并草案可编辑并「以此为准」

- **Given** 仲裁 decision=merge 且返回了 mergedContent
- **When** 用户在草案文本框中调整内容后点「以此为准」
- **Then** 该冲突项的解决策略置为 merge 且合并结果采用草案文本；点「确认导入」时才真正写入（沿用既有 ImportItem 流程，proposal D1 不新增直写通道）

## Scenario 4：keep-left / keep-right 映射到既有策略

- **Given** 仲裁返回 keep-right（保留目标工具现有版）
- **When** 用户点「采纳」
- **Then** 该项策略设为 skip（不覆盖）；keep-left 采纳则设为 overwrite。采纳仅改前端待确认状态，仍需「确认导入」提交（信任红线）

## Scenario 5：manual-review 与安全兜底

- **Given** 模型判断差异语义复杂、confidence 低或输出 decision=manual-review
- **When** 建议渲染
- **Then** 仅显示理由，不显示「采纳」按钮；引导用户回到手动 diff + 三策略选择

## Scenario 6：闭集外/非法输出失败隔离

- **Given** 模型返回无法解析为 JSON、或 decision 不在四值闭集、或 merge 缺 mergedContent
- **When** 解析
- **Then** 该项标记"仲裁失败：<原因>"，冲突项保持原手动策略选择可用，不产生半成品建议；批量场景单条失败不影响其余

## Scenario 7：内容哈希缓存复用

- **Given** 同一冲突项（左+右内容未变）且准则集未变
- **When** 用户第二次点「AI 仲裁」
- **Then** 命中缓存直接返回上次建议（不重复调用模型），建议卡标注"来自缓存"；改动任一侧内容或增删/改准则后缓存自然失效（key 含内容哈希+准则集哈希）

## Scenario 8：未配置 AI 端点时的降级

- **Given** 用户未配置 baseUrl/apiKey/model
- **When** 点击「AI 仲裁」
- **Then** 不发起请求，提示"请先在设置中配置 AI 端点"，并提供跳转配置的入口；冲突项手动处理路径始终可用（仲裁是可选项，不是前置条件）

## Scenario 9：隐私边界（proposal D6）

- **Given** 用户触发仲裁
- **When** 请求发出
- **Then** 发送至**用户自配**的 OpenAI 兼容端点（与 AI 分类同一配置、同一 `LlmClient`），不经任何第三方中转；请求内容仅含该冲突项两侧文本与准则正文，不含无关资产

## 非目标

- swap 分发方向 differs 的仲裁入口（下期，按同一 api-contract 扩展 direction 参数）
- 准则自动提炼、仲裁历史报表、confidence 校准
