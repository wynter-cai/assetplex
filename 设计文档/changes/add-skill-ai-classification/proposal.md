# Proposal: add-skill-ai-classification

> 级别：S | 日期：2026-10-06 | 状态：待审核

## Goal

关键词规则分类对复杂技能误判率高（如 airbnb 技能靠关键词归不到位）。本变更引入 AI 智能分类：调用 OpenAI 兼容的 LLM 按内容判断 9 个职能分类之一，替代关键词规则成为默认主力；关键词规则降级为兜底。分类优先级落地为：

**手动覆盖 > AI 分类 > 关键词规则兜底**

## 已拍板的决策

1. OpenAI 兼容配置化接入（baseUrl / apiKey / model 可配，不写死厂商）
2. Lite 级别小模型即可（分类任务不需要旗舰模型）
3. 分类优先级：手动覆盖 > AI 分类 > 关键词规则兜底
4. AI 结果按内容 hash 缓存，避免重复调用
5. UI 上标注分类来源（AI / 手动 / 关键词）

## Scope

**做**：
1. AI 分类服务：对技能（名称+描述+正文）调用 LLM，输出 9 分类闭集之一；LLM 客户端为抽象接口，Node 实现走 OpenAI 兼容 `/chat/completions`
2. 内容 hash 缓存：以 SKILL.md 原文 sha256 为 key 持久化 AI 结果；命中缓存不再调 LLM，同内容跨技能复用，技能内容变更后缓存自然失效
3. 显式触发：详情面板单条「AI 分类」、批量条勾选「AI 分类」、工具栏「全部 AI 分类」三种入口
4. 盘点集成：`GET /api/skills` 自动应用已缓存的 AI 分类（优先级 手动 > AI > 关键词），并新增分类来源标注字段
5. 配置管理：配置 API（保存/读取，读取时 apiKey 脱敏不回传明文），未配置时 UI 引导填写
6. 失败隔离：单条失败（网络/鉴权/输出不合法）不中断批量、不污染缓存，结果中报告原因

**不做**：
- 盘点时自动静默调 LLM（`GET /api/skills` 是同步接口，不能被网络调用拖慢；AI 分类一律显式触发，缓存命中后自动生效）
- 多模型对比、自动重试策略、embedding 相似度等增强
- 非技能资产的 AI 分类（身份/规则/MCP 结构简单，关键词规则已够用）
- 流式输出、多语言 prompt 适配

## 关键设计决策（待确认）

| 决策点 | 方案 | 理由 |
|--------|------|------|
| 触发方式 | 显式触发三种入口；缓存命中后盘点自动应用 | 同步盘点接口不能被 LLM 拖慢；缓存让 AI 结果"一次调用长期生效" |
| 分类来源字段 | `SkillInfo.functionOverridden: boolean` 升级为 `functionSource: 'manual' \| 'ai' \| 'keyword'` 三态 | UI 要标注三种来源，布尔表达不了；旧字段引用少（前端 2 处 + 测试），干净替换 |
| 缓存 key | sha256(SKILL.md 原文) | 内容变则结果失效，天然正确；同内容技能（如沉淀副本）复用一次调用 |
| 缓存存储 | `~/.assetplex/skill-ai-classifications.json`（与 skill-overrides.json 同目录同风格） | Hub 根目录已有元数据先例，无需新存储设施 |
| AI 配置存储 | `~/.assetplex/ai-config.json`（baseUrl/apiKey/model） | 同上；apiKey 读取接口脱敏（只返回 hasApiKey），保存时缺省保留旧值 |
| LLM 调用 | core 定义 `LlmClient` 抽象注入；node 实现用 fetch 调 `/chat/completions` | 严格 TDD 可 mock；OpenAI 兼容协议覆盖面最广 |
| prompt 约束 | system 指令限定 9 分类闭集、只输出 JSON `{"category":"..."}`；正文截断控制 token | 小模型输出稳定性靠闭集约束+解析校验双保险；解析失败按失败处理 |
| 批量并发 | 固定小并发（4）调用 | 数百技能串行太慢，无节制并发会被限流 |

## Risks

- 小模型偶尔输出闭集外的值或不合 JSON——解析严格校验，非法即该条计入 failed 并提示原因，可重跑
- apiKey 明文存本地文件——与现有 skill-overrides.json 同等安全边界（本机用户目录）；读取接口脱敏，不回传明文
- 全量分类首次跑 300+ 技能有 LLM 费用——按 hash 缓存后重复为 0；UI 触发前展示待分类数量
- `functionOverridden` 字段替换涉及前后端与测试同步改动——范围已确认（引用点少），tasks 中作为独立任务先行
