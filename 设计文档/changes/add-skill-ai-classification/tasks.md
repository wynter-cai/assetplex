# Tasks: add-skill-ai-classification

> 依赖顺序排列；每个任务独立提交。测试命令：根目录 `node node_modules/vitest/vitest.mjs run`，前端 `cd web` 后同命令。

## Phase 1: 后端 core（TDD）

### T1: functionSource 三态替换 functionOverridden ⭐ 先行（影响面验证）
- [ ] `SkillInfo.functionOverridden: boolean` → `functionSource: 'manual' | 'ai' | 'keyword'`（skills-inventory.ts 类型 + dedupeSkills 赋值逻辑 + override 两处返回值）
- [ ] 现有测试同步替换（skills-inventory / skill-write / skill-curation / 路由集成测试）
- 验证方式：RED→GREEN，全量测试通过（此时 AI 尚未介入，全部来源为 manual/keyword 两态）

### T2: AI 配置存取纯逻辑
- [ ] `src/core/ai-config.ts`：`AiClassifyConfig` 类型（baseUrl/apiKey/model）+ `loadAiConfig(store)` / `saveAiConfig(config, store)`（store 为 JSON 文件抽象，读写 `ai-config.json`）
- [ ] 校验：baseUrl 合法 URL、model 非空；apiKey 缺省保留旧值（合并语义）
- [ ] 测试：`tests/unit/core/ai-config.test.ts`（正常保存读取、缺 model 400、非法 URL、apiKey 缺省保留、首次保存）
- 验证方式：RED→GREEN，全量测试通过

### T3: AI 缓存存取纯逻辑
- [ ] `src/core/skill-ai-cache.ts`：`AiClassifyCacheEntry { category, model, classifiedAt }` + `getCachedByHash(store, hash)` / `saveCacheEntry(store, hash, entry)`；文件 `skill-ai-classifications.json`，结构 `Record<sha256, entry>`
- [ ] `hashSkillContent(content): string`（sha256，node:crypto）
- [ ] 测试：`tests/unit/core/skill-ai-cache.test.ts`（写入读取、同 hash 复用、不同 hash 隔离、空文件/损坏 JSON 容错）
- 验证方式：RED→GREEN，全量测试通过

### T4: classifySkillsWithAi 核心纯逻辑 ⭐ 核心
- [ ] `src/core/skill-ai-classification.ts`：
  - `LlmClient` 抽象：`chat(input: { system: string; user: string }): Promise<string>`
  - `classifySkillsWithAi({ ids? }, deps)`：解析目标（ids 缺省=全部非 manual）→ 逐技能读原文算 hash → 命中缓存跳过 LLM → 未命中调 LLM → 解析 JSON 严格校验 9 分类闭集 → 写缓存；固定并发 4
  - 手动覆盖技能进 skipped；解析失败/网络失败进 failed（不写缓存）；配置缺失抛专用错误
  - prompt：system 限定 9 分类闭集+各类别一句定义+只输出 `{"category":"..."}`；user = 技能名+描述+正文（截断 2000 字符）
- [ ] 测试：`tests/unit/core/skill-ai-classification.test.ts`（mock LlmClient：单条成功、批量成功、缓存命中不调 LLM、同内容跨技能复用、手动覆盖跳过、闭集外输出失败、非 JSON 失败、网络错误部分成功、ids 缺省全量、配置缺失报错、内容变更后重算 hash）
- 验证方式：RED→GREEN，全量测试通过

### T5: 盘点集成（优先级落地）
- [ ] `skills-inventory.ts`：`buildAll`/`listSkills` 增加可选 `aiCache` 依赖；分类取值 `manual ?? ai(hash 命中) ?? keyword`，`functionSource` 相应标注
- [ ] 路由工厂 deps 传入 node AI 缓存 store（未传时行为与现状一致——keyword 兜底）
- [ ] 测试：`tests/unit/core/skills-inventory.test.ts`（AI 命中生效且来源 ai、无缓存 keyword、manual 优先于 ai、hash 不匹配回退 keyword）
- 验证方式：RED→GREEN，全量测试通过

## Phase 2: 后端 Node 实现与路由（TDD）

### T6: Node 实现 + 路由接入
- [ ] `src/server/lib/node-ai-classify-store.ts`：ai-config.json / skill-ai-classifications.json 的 Node JSON store（对齐 node-skill-override-store.ts 风格）
- [ ] `src/server/lib/openai-llm-client.ts`：fetch 实现 `LlmClient`（POST `${baseUrl}/chat/completions`，Bearer 鉴权，超时与非 2xx 抛带上下文错误）
- [ ] 路由：`GET/PUT /api/skills/ai-classify/config`（读取脱敏 hasApiKey；保存校验）+ `POST /api/skills/ai-classify`（400 配置缺失/ids 非法；200 部分成功）——注册在 `/:id` 之前
- [ ] 测试：`tests/integration/` 路由回环（mock LLM server + 真实临时目录：保存→脱敏读取→分类→盘点含 ai 来源→失败明细）
- 验证方式：RED→GREEN，全量测试通过

## Phase 3: 前端

### T7: API 客户端与类型
- [ ] `web/src/types/api.ts`：`functionOverridden` → `functionSource: 'manual' | 'ai' | 'keyword'`；新增配置/分类类型
- [ ] `web/src/lib/api.ts`：`getAiClassifyConfig` / `saveAiClassifyConfig` / `aiClassifySkills` 方法
- 验证方式：`tsc -b` 无错误

### T8: UI —— 来源徽章 + 分类入口 + 配置对话框
- [ ] `SkillsView.tsx` / `SkillDetail.tsx`：来源徽章三态（AI/手动/关键词，替换现「已手动分类」徽章）
- [ ] `SkillDetail.tsx`：单条「AI 分类」按钮；`SkillsView.tsx`：批量条「AI 分类」+ 工具栏「全部 AI 分类」（含待分类数量提示）
- [ ] 配置对话框（baseUrl/apiKey/model 表单；apiKey 留空保留旧值 placeholder 提示）；未配置触发时先弹配置、保存后继续分类
- [ ] 结果提示：成功 N（缓存命中 M）/ 跳过 N / 失败明细；loading 态
- [ ] 测试：`SkillsView.test.tsx` / `SkillDetail.test.tsx`（三态徽章、单条分类刷新、批量跳过手动、未配置弹配置、失败提示、配置保存）
- 验证方式：组件测试通过

## Phase 4: 收尾

### T9: 全量验证
- [ ] 后端全量测试、`tsc -b`、tsup build
- [ ] 前端测试、`tsc -b`、vite build
- [ ] 浏览器/API 实测（对照 spec 全部 Scenario）：配置保存与脱敏 → 单条分类（真实 Lite 模型）→ 来源徽章 → 缓存命中复跑 → 手动覆盖不被 AI 覆盖 → 批量失败隔离 → 内容编辑后缓存失效回退关键词
- [ ] 实测记录写入本文件；测试数据清理回 vault 基线（31 技能）
- 验证方式：对照 spec 全部 Scenario 逐条确认

## 优先级说明

- T1 是影响面收敛项，先行（独立 commit，纯替换不改行为）
- T2/T3 是基础设施；T4 是核心逻辑（最多测试用例）；T5 是优先级落地点
- T6-T8 常规；T9 验收
- 全部完成前不合并交付；每任务一个 commit
- T4 与 T5 可并行（T4 独立于盘点，T5 只消费缓存抽象）
