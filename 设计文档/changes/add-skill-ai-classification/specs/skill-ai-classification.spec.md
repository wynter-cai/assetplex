# Spec: skill-ai-classification（AI 智能分类）

> 变更：add-skill-ai-classification | 状态：待审核

## ADDED Requirements

### Requirement: 分类来源标注

每个技能的分类结果标注来源，来源为三选一：手动覆盖（manual）、AI 分类（ai）、关键词规则兜底（keyword）。来源在盘点响应中返回，卡片与详情面板可见。

#### Scenario: 关键词分类技能显示关键词来源

- **Given** 技能 `pdf` 既无手动覆盖也无 AI 缓存，关键词规则将其归为 `writing`
- **When** 查看技能列表或详情面板
- **Then** 该技能分类为 `writing`，来源标注为「关键词」

#### Scenario: 手动覆盖技能显示手动来源

- **Given** 用户已手动把技能 `pdf` 覆盖为 `data`
- **When** 查看技能列表或详情面板
- **Then** 该技能分类为 `data`，来源标注为「手动」

#### Scenario: AI 分类技能显示 AI 来源

- **Given** 技能 `airbnb` 已通过 AI 分类为 `travel` 对应的合法分类 `workflow`，结果已入缓存
- **When** 查看技能列表或详情面板
- **Then** 该技能分类为 `workflow`，来源标注为「AI」

### Requirement: 分类优先级 手动 > AI > 关键词

技能职能分类按优先级取值：有手动覆盖时用手动值；否则有 AI 缓存命中时用 AI 值；否则用关键词规则。AI 分类永不覆盖手动覆盖的技能。

#### Scenario: AI 不覆盖手动分类

- **Given** 技能 `pdf` 已手动覆盖为 `data`
- **When** 执行 AI 分类（单条或批量）
- **Then** 该技能被跳过，分类保持 `data` 且来源仍为「手动」
- **And** 不为该技能调用 LLM

#### Scenario: AI 结果生效于盘点

- **Given** 技能 `airbnb` 的 AI 缓存已存在且内容 hash 匹配
- **When** `GET /api/skills` 盘点
- **Then** `airbnb` 的分类为 AI 缓存值，来源为「AI」，盘点过程无任何 LLM 调用

#### Scenario: 无 AI 缓存时关键词兜底

- **Given** 技能 `mycode` 从未执行过 AI 分类
- **When** 盘点
- **Then** 该技能分类为关键词规则结果，来源为「关键词」

### Requirement: AI 分类触发

用户可显式触发 AI 分类，三种入口：详情面板对单个技能触发；批量条对勾选技能触发；工具栏对全部未手动覆盖技能触发。触发时逐技能调用 LLM，结果写入内容 hash 缓存。

#### Scenario: 详情面板单条 AI 分类

- **Given** 技能 `airbnb` 来源为关键词，AI 配置已完成
- **When** 在详情面板点击「AI 分类」
- **Then** 该技能分类被 AI 结果更新，来源变为「AI」，详情面板与列表同步刷新
- **And** 再次触发同一技能时显示缓存命中（不再消耗 LLM 调用）

#### Scenario: 批量 AI 分类

- **Given** 勾选 3 个技能，其中 1 个已手动覆盖
- **When** 在批量操作条点击「AI 分类」
- **Then** 2 个非手动技能被分类并更新来源为「AI」，手动覆盖的跳过
- **And** 结果提示「成功 N 个、跳过 N 个（已手动分类）」

#### Scenario: 全量 AI 分类

- **Given** 资产库共 300 个技能，其中 5 个已手动覆盖、2 个已有有效 AI 缓存
- **When** 点击工具栏「全部 AI 分类」
- **Then** 仅对 293 个无手动覆盖且无有效缓存的技能调用 LLM（5 个手动跳过、2 个缓存命中）
- **And** 触发前 UI 展示待分类数量（不把手动与缓存命中的算进费用预估）

#### Scenario: 未配置 AI 时触发

- **Given** AI 配置（baseUrl/apiKey/model）任一缺失
- **When** 点击任一 AI 分类入口
- **Then** 弹出配置对话框引导填写，不发起分类请求
- **And** 配置保存成功后回到之前的触发意图（继续完成刚才想做的分类）

### Requirement: AI 配置管理

AI 分类使用 OpenAI 兼容配置：baseUrl、apiKey、model 三项，持久化在本机 Hub 元数据目录。提供查看与保存的配置接口；读取时 apiKey 不回传明文，只告知是否已配置；保存时 apiKey 缺省表示保留原值。

#### Scenario: 保存配置

- **Given** 用户在配置对话框填入 baseUrl `https://api.example.com/v1`、apiKey `sk-xxx`、model `lite-model`
- **When** 提交保存
- **Then** 配置持久化成功，响应与后续读取均不包含明文 apiKey（只含「已配置」状态）

#### Scenario: 读取配置脱敏

- **Given** AI 配置已保存
- **When** 查询配置
- **Then** 返回 baseUrl、model 与 `hasApiKey: true`，不返回 apiKey 明文

#### Scenario: 未配置读取

- **Given** 从未保存过 AI 配置
- **When** 查询配置
- **Then** 返回空配置（baseUrl/model 为空、`hasApiKey: false`），无错误

#### Scenario: 保存配置缺项校验

- **Given** 提交的配置缺 model 或 baseUrl 不是合法 URL
- **When** 提交保存
- **Then** 返回 400 与具体缺失/非法项说明，配置不被写入

### Requirement: 内容 hash 缓存

AI 分类结果按 SKILL.md 原文内容的 sha256 缓存持久化。相同内容跨技能复用同一条缓存；技能内容变更后旧缓存自动失效（hash 不匹配），该技能回到关键词兜底，直到重新执行 AI 分类。

#### Scenario: 同内容技能复用缓存

- **Given** 技能 `airbnb`（marketplace）已 AI 分类入缓存，随后该技能被沉淀到保险箱（内容相同）
- **When** 对保险箱副本执行 AI 分类
- **Then** 直接命中缓存返回结果，不调用 LLM，分类与来源「AI」立即生效

#### Scenario: 内容变更后缓存失效

- **Given** 技能 `airbnb` 已 AI 分类，之后其 SKILL.md 正文被修改
- **When** 盘点
- **Then** 该技能来源回到「关键词」（旧 hash 不匹配），直到重新执行 AI 分类

#### Scenario: 重新分类覆盖旧缓存

- **Given** 技能 `airbnb` 内容变更后执行 AI 分类
- **When** LLM 返回结果
- **Then** 以新 hash 写入新缓存条目，分类与来源「AI」生效

### Requirement: 失败隔离与结果报告

AI 分类过程中单条失败（网络错误、鉴权失败、输出不合法）不影响其他技能；失败结果不写入缓存；批量执行为部分成功语义，返回成功与失败明细。

#### Scenario: LLM 输出闭集外分类

- **Given** LLM 对技能 `x` 返回 `{"category":"travel"}`（闭集外）
- **When** 执行包含该技能的 AI 分类
- **Then** 技能 `x` 计入失败（原因：输出分类不合法），分类保持关键词兜底，缓存不写入
- **And** 同批次其他技能正常完成

#### Scenario: LLM 输出非 JSON

- **Given** LLM 对技能 `x` 返回自然语言而非 JSON
- **When** 执行 AI 分类
- **Then** 技能 `x` 计入失败（原因：输出无法解析），不影响其他技能

#### Scenario: 网络或鉴权失败

- **Given** apiKey 失效，对 10 个技能执行全量 AI 分类
- **When** 执行完成
- **Then** 返回失败明细（每条含技能名与错误原因），成功数为 0，缓存无任何写入
- **And** UI 提示检查配置

#### Scenario: 重跑失败的技能

- **Given** 上批有 3 个技能失败
- **When** 修复配置后对同样 3 个技能再次触发
- **Then** 3 个技能重新走完整 LLM 调用（无有效缓存可命中），成功后来源变「AI」
