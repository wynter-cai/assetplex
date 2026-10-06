# Tasks: add-skill-ai-classification

> 依赖顺序排列；每个任务独立提交。测试命令：根目录 `node node_modules/vitest/vitest.mjs run`，前端 `cd web` 后同命令。

## Phase 1: 后端 core（TDD）

### T1: functionSource 三态替换 functionOverridden ⭐ 先行（影响面验证）
- [x] `SkillInfo.functionOverridden: boolean` → `functionSource: 'manual' | 'ai' | 'keyword'`（skills-inventory.ts 类型 + dedupeSkills 赋值逻辑 + override 两处返回值）
- [x] 现有测试同步替换（skills-inventory / skill-write / skill-curation / 路由集成测试）
- 验证方式：RED→GREEN，全量测试通过（此时 AI 尚未介入，全部来源为 manual/keyword 两态）✅ 7d6a12a

### T2: AI 配置存取纯逻辑
- [x] `src/core/ai-config.ts`：`AiClassifyConfig` 类型（baseUrl/apiKey/model）+ `loadAiConfig(store)` / `saveAiConfig(config, store)`（store 为 JSON 文件抽象，读写 `ai-config.json`）
- [x] 校验：baseUrl 合法 URL、model 非空；apiKey 缺省保留旧值（合并语义）
- [x] 测试：`tests/unit/core/ai-config.test.ts`（正常保存读取、缺 model 400、非法 URL、apiKey 缺省保留、首次保存）
- 验证方式：RED→GREEN，全量测试通过 ✅ dd82762

### T3: AI 缓存存取纯逻辑
- [x] `src/core/skill-ai-cache.ts`：`AiClassifyCacheEntry { category, model, classifiedAt }` + `getCachedByHash(store, hash)` / `saveCacheEntry(store, hash, entry)`；文件 `skill-ai-classifications.json`，结构 `Record<sha256, entry>`
- [x] `hashSkillContent(content): string`（sha256，node:crypto）
- [x] 测试：`tests/unit/core/skill-ai-cache.test.ts`（写入读取、同 hash 复用、不同 hash 隔离、空文件/损坏 JSON 容错）
- 验证方式：RED→GREEN，全量测试通过 ✅ 1f80420

### T4: classifySkillsWithAi 核心纯逻辑 ⭐ 核心
- [x] `src/core/skill-ai-classification.ts`：
  - `LlmClient` 抽象：`chat(input: { system: string; user: string }): Promise<string>`
  - `classifySkillsWithAi({ ids? }, deps)`：解析目标（ids 缺省=全部非 manual）→ 逐技能读原文算 hash → 命中缓存跳过 LLM → 未命中调 LLM → 解析 JSON 严格校验 9 分类闭集 → 写缓存；固定并发 4
  - 手动覆盖技能进 skipped；解析失败/网络失败进 failed（不写缓存）；配置缺失抛专用错误
  - prompt：system 限定 9 分类闭集+各类别一句定义+只输出 `{"category":"..."}`；user = 技能名+描述+正文（截断 2000 字符）
- [x] 测试：`tests/unit/core/skill-ai-classification.test.ts`（mock LlmClient：单条成功、批量成功、缓存命中不调 LLM、同内容跨技能复用、手动覆盖跳过、闭集外输出失败、非 JSON 失败、网络错误部分成功、ids 缺省全量、配置缺失报错、内容变更后重算 hash）
- 验证方式：RED→GREEN，全量测试通过 ✅ e714f2d

### T5: 盘点集成（优先级落地）
- [x] `skills-inventory.ts`：`buildAll`/`listSkills` 增加可选 `aiCache` 依赖（实现为 `aiLookup` 回调注入，避免 core 内循环依赖）；分类取值 `manual ?? ai(hash 命中) ?? keyword`，`functionSource` 相应标注
- [x] 路由工厂 deps 传入 node AI 缓存 store（未传时行为与现状一致——keyword 兜底）
- [x] 测试：`tests/unit/core/skills-inventory.test.ts`（AI 命中生效且来源 ai、无缓存 keyword、manual 优先于 ai、hash 不匹配回退 keyword）
- 验证方式：RED→GREEN，全量测试通过 ✅ 11482db

## Phase 2: 后端 Node 实现与路由（TDD）

### T6: Node 实现 + 路由接入
- [x] `src/server/lib/node-ai-classify-store.ts`：ai-config.json / skill-ai-classifications.json 的 Node JSON store（对齐 node-skill-override-store.ts 风格）
- [x] `src/server/lib/openai-llm-client.ts`：fetch 实现 `LlmClient`（POST `${baseUrl}/chat/completions`，Bearer 鉴权，超时与非 2xx 抛带上下文错误）
- [x] 路由：`GET/PUT /api/skills/ai-classify/config`（读取脱敏 hasApiKey；保存校验）+ `POST /api/skills/ai-classify`（400 配置缺失/ids 非法；200 部分成功）——注册在 `/:id` 之前
- [x] 测试：`tests/unit/server/skills-ai-routes.test.ts` 路由级（mock LlmClient/内存 store：保存→脱敏读取→分类→盘点含 ai 来源→失败明细）；真实 HTTP server 回环由 T9 API 实测覆盖
- 验证方式：RED→GREEN，全量测试通过 ✅ 80e05aa

## Phase 3: 前端

### T7: API 客户端与类型
- [x] `web/src/types/api.ts`：`functionOverridden` → `functionSource: 'manual' | 'ai' | 'keyword'`；新增配置/分类类型
- [x] `web/src/lib/api.ts`：`getAiClassifyConfig` / `saveAiClassifyConfig` / `aiClassifySkills` 方法
- 验证方式：`tsc -b` 无错误 ✅（随 T8 提交 5ff94e1）

### T8: UI —— 来源徽章 + 分类入口 + 配置对话框
- [x] `SkillsView.tsx` / `SkillDetail.tsx`：来源徽章三态（AI/手动/关键词，替换现「已手动分类」徽章；三态常显符合 spec「来源标注可见」）
- [x] `SkillDetail.tsx`：单条「AI 分类」按钮；`SkillsView.tsx`：批量条「AI 分类」+ 工具栏「全部 AI 分类（待分类 N）」（N = 关键词源数量，手动跳过、AI 源缓存命中不计入调用）+「AI 配置」入口
- [x] 配置对话框（`AiConfigDialog.tsx`：baseUrl/apiKey/model 表单；apiKey 留空保留旧值 placeholder 提示）；未配置触发时先弹配置、保存后继续分类（`use-ai-classify.ts` hook 统一三入口流程）
- [x] 结果提示：成功 N（缓存命中 M）/ 跳过 N / 失败明细；loading 态
- [x] 测试：`SkillsView.test.tsx` / `SkillDetail.test.tsx`（三态徽章、单条分类刷新、批量跳过手动、未配置弹配置、失败提示、配置保存）
- 验证方式：组件测试通过 ✅ 80/80 全绿（新增 11 用例），tsc 0 错，5ff94e1

## Phase 4: 收尾

### T9: 全量验证
- [x] 后端全量测试、`tsc -b`、tsup build（414/414 全绿）
- [x] 前端测试、`tsc -b`、vite build（80/80 全绿）
- [x] API 实测（mock OpenAI 兼容 LLM server 回环，见下方实测记录）+ 浏览器关键 UI 路径实测
- [x] 实测记录写入本文件；测试数据清理回基线（技能 375 无残留、缓存/配置/覆盖文件清空、overrides 恢复原状）
- [ ] 真实 Lite 模型调用一次（**待维护者**：UI「AI 配置」填入真实 OpenAI 兼容 baseUrl/apiKey/model 后点任意 AI 分类入口；唯一遗留项）

## T9 实测记录（2026-10-06）

### API 回环（mock LLM server @127.0.0.1:17999，逐条对照 spec Scenario）

| # | Scenario | 结果 |
|---|----------|------|
| S1 | 未配置读取：返回空配置无错误 | PASS |
| S2 | 保存缺 model → 400 | PASS |
| S3 | baseUrl 非法 → 400 | PASS |
| S4 | 保存合法配置 → 200 | PASS |
| S5 | 读取脱敏：回显 baseUrl/model + hasApiKey=true，明文 apiKey 不泄露 | PASS |
| S6-S7 | 以真实技能 12306（marketplace/keyword）沉淀副本 ai-classify-test-tmp 入 vault → 来源 keyword | PASS |
| S8 | 单条 AI 分类 → classified=1、category=coding、source=ai | PASS |
| S9 | mock LLM 恰好被调用 1 次 | PASS |
| S10 | 盘点反映 AI 分类与来源 | PASS |
| S11 | 复跑同技能 → cacheHits=1 且 LLM 调用数仍为 1（缓存命中不调 LLM） | PASS |
| S12 | 手动覆盖 → source=manual；再触发 AI 分类 → skipped 且 LLM 不调用（手动优先） | PASS |
| S13 | 批量含闭集外输出技能 → failedCount=1（错误「输出分类不合法：travel」）、整批 200 部分成功（失败隔离） | PASS |
| S14 | 显式 ids 含不存在技能 → failed「技能不存在：xxx」 | PASS |
| S15 | DELETE 两个临时技能 → 200/200，search 复查 items 为空无残留 | PASS |

说明：S13 中另一技能此时已是 manual 进 skipped（S12 所致），"同批其他技能正常完成"由 S8/S11（成功路径）与 S13（失败不回滚）组合覆盖。

### 浏览器实测（关键 UI 路径，browser 子代理 4 步全 PASS）

1. 首页侧边栏导航至技能视图，列表渲染正常 — PASS
2. 卡片可见「关键词」「手动」来源徽章；工具栏有「全部 AI 分类（待分类 374）」（375 技能 − 1 手动 = 374，计数正确）与「AI 配置」按钮 — PASS
3. 「AI 配置」弹对话框含 Base URL / API Key / 模型三输入框；未配置时 API Key placeholder 为 sk-...（已配置时才显示「留空保留原值」提示） — PASS
4. 未配置状态点「全部 AI 分类」→ 弹配置对话框、不发分类请求（spec：未配置触发场景） — PASS

### 数据清理核验

- `ai-config.json` / `skill-ai-classifications.json` 已删除；`skill-overrides.json` 恢复为 `{"arkcli-agent": "coding"}`（测试前原状）
- 服务重启后核验：config 为空、技能 total=375 与测试前一致、无临时技能残留
- mock LLM server 进程与临时脚本已清理；浏览器标签已全部关闭

## 优先级说明

- T1 是影响面收敛项，先行（独立 commit，纯替换不改行为）
- T2/T3 是基础设施；T4 是核心逻辑（最多测试用例）；T5 是优先级落地点
- T6-T8 常规；T9 验收
- 全部完成前不合并交付；每任务一个 commit
- T4 与 T5 可并行（T4 独立于盘点，T5 只消费缓存抽象）
