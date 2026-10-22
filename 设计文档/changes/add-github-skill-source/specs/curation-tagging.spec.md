# curation-tagging.spec.md：候选清单策展打标（market-curation 合并交付）

> capability: 对 GitHub 候选清单手动发起 AI 九职能打标，复用分类管线基建
> 变更: add-github-skill-source | 决策依据: proposal.md D4，评估报告 §2（AI 分类 = 拉取清单的策展打标基础）

## 定义

- **打标**：对候选技能的 SKILL.md 内容调用既有九职能闭集分类（coding/writing/browser/data/…，`SKILL_FUNCTIONS`），产出 `function ∈ 九值 + unknown 兜底`
- **复用不另建**：prompt 构造（`buildClassifyPrompt`）、闭集解析（`parseCategoryOutput`）、内容哈希缓存（`skill-ai-cache`）、LlmClient（用户自配端点）全部来自 add-skill-ai-classification 管线
- 打标对象是**内存中的候选**，与盘点条目的分类存储互不写入（候选入库后按正常盘点走自己的分类流程）

## Scenario 1：手动发起打标

- **Given** 候选清单 12 条已展示
- **When** 用户点「智能打标」并确认
- **Then** 发起前显示预算"将调用 N 次模型（M 条命中内容缓存不消耗）"；执行期并发 ≤4、逐条进度可见；完成后候选条目出现职能徽章，可按职能筛选

## Scenario 2：未配置 AI 端点降级

- **Given** baseUrl/apiKey/model 任一未配置
- **When** 打标入口渲染/点击
- **Then** 不发起请求；入口置灰或点击后提示"配置 AI 端点后可为候选打标"与跳转设置页；候选浏览/预览/入库全部照常（打标是增强项非依赖项）

## Scenario 3：单条失败隔离

- **Given** 12 条打标，1 条模型输出非法 JSON / 职能不在闭集
- **When** 解析
- **Then** 该条标"打标失败"徽章缺省，其余正常产出，整体不中断；错误原因可见

## Scenario 4：内容哈希缓存

- **Given** 同一内容（sha256 相同）已打过标（无论来自盘点分类还是候选打标）
- **When** 再次打标该候选
- **Then** 命中缓存直接返回并标注"缓存"，不调模型；上游改了 SKILL.md 内容 → 哈希变化自然失效

## Scenario 5：数据流出边界

- **Given** 打标发起
- **When** 请求发出
- **Then** 仅候选 SKILL.md 内容（截断规则沿用分类管线）发往**用户自配** OpenAI 兼容端点，不经任何第三方（含 GitHub）；与 PRIVACY.md 既有"AI 分类"披露同节合并说明

## Scenario 6：默认关闭（智能默认宪法条款）

- **Given** 用户完成一次发现
- **When** 候选清单渲染
- **Then** 打标**不自动发生**（不"顺手烧 N 次调用"）；徽章区缺省显示"未打标"，入口是一次显式点击；对用户不利的默认行为（未确认的模型消耗）默认不启用
