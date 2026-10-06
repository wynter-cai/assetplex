# Tasks: add-skill-curation

> 依赖顺序排列；每个任务独立提交。测试命令：根目录 `node node_modules/vitest/vitest.mjs run`，前端 `cd web` 后同命令。

## Phase 1: 后端 core（TDD）

### T1: frontmatter 支持 source 字段 ⭐ 先行验证风险
- [x] `buildAssetMarkdown` 增加可选 `source` 参数，写入 frontmatter
- [x] 技能盘点解析 frontmatter 时读取 `source` 字段进 `SkillInfo.source`（验证解析器容忍未知键；若不兼容则改用注释行方案并在本任务内落实）
- [x] 测试：`tests/unit/core/asset-name.test.ts`、`tests/unit/core/skills-inventory.test.ts`
- 验证方式：RED→GREEN，全量测试通过

### T2: curateVaultSkill 纯逻辑
- [x] `src/core/skill-curation.ts`：`curateVaultSkill({ id, name? }, deps)` — 读源技能原文 → 剥离 frontmatter → `createVaultSkill` → 写入 source
- [x] 错误：源不存在 404 / 源为 vault 400 / 同名冲突 400 / 名称非法 400
- [x] 测试：`tests/unit/core/skill-curation.test.ts`（正常沉淀、改沉淀名、同名冲突、源为 vault、来源标识写入、正文原样保留）
- 验证方式：RED→GREEN，全量测试通过

### T3: curateVaultSkills 批量纯逻辑
- [x] `curateVaultSkills({ ids }, deps)`：逐条调用单条逻辑，部分成功不回滚，返回 created/failed
- [x] 测试：混合勾选（vault 跳过）、同名冲突跳过、全失败
- 验证方式：RED→GREEN，全量测试通过

## Phase 2: 后端路由（TDD）

### T4: 路由接入
- [x] `POST /api/skills/curate`（201 + skill；400/404 错误体 `{error}`，走 toWriteErrorResponse）
- [x] `POST /api/skills/curate-batch`（200 + { created, failed }；400 ids 为空）
- [x] 测试：`tests/integration/` 路由回环（真实临时目录）
- 验证方式：RED→GREEN，全量测试通过

## Phase 3: 前端

### T5: API 客户端与类型
- [x] `web/src/types/api.ts`：SkillInfo 加 `source?: string`
- [x] `web/src/lib/api.ts`：`curateSkill`、`curateSkillsBatch` 方法
- 验证方式：`tsc -b` 无错误

### T6: 详情面板沉淀入口 + 对话框
- [x] `SkillDetail.tsx`：非 vault 技能显示「沉淀到保险箱」按钮 → 名称预填对话框（可改）→ 成功后面板切换为新技能
- [x] 测试：`SkillDetail.test.tsx`（沉淀成功、同名冲突错误提示、vault 技能无按钮）
- 验证方式：组件测试通过

### T7: 批量沉淀 + 来源标识展示
- [x] `SkillsView.tsx`：批量条加「沉淀到保险箱」（仅勾选含非 vault 时显示）→ 确认 → 结果提示（成功 N / 跳过 N 及原因）
- [x] `SkillDetail.tsx`：沉淀技能显示「沉淀自 {来源}」+ 源路径；自建技能不显示
- [x] 测试：`SkillsView.test.tsx` 批量场景、来源标识场景
- 验证方式：组件测试通过

## Phase 4: 收尾

### T8: 全量验证
- [x] 后端全量测试、`tsc -b`、tsup build
- [x] 前端测试、`tsc -b`、vite build
- [x] 浏览器实测：沉淀 airbnb 类技能 → 详情显示来源 → 编辑保留 → 批量沉淀冲突跳过（实测后删除测试数据）
- 验证方式：对照 spec 全部 Scenario 逐条确认

### T8 实测记录（2026-10-06）

- 后端 359 测试全绿、前端 69 测试全绿、两端 tsc 0 错、tsup/vite build 成功
- API 回环：单条沉淀 201 + `source: marketplace:<路径>` → vault 文件 frontmatter 含 source 行；vault 来源再沉淀 400；批量 [真实, ghost] → created 1 / failed 1 不回滚；PUT 编辑整文件替换后 source 保留；DELETE 清理干净
- 浏览器实测：卡片「沉淀到保险箱」按钮 → 对话框名称预填 → 确认后卡片变「保险箱」来源（vault 计数 +1 / 市场 -1 实证），airbnb 沉淀产物带完整溯源
- 测试数据已全部清理（a-stock-data / 12306-train-assistant / airbnb vault 副本均删除，市场源未受影响），浏览器标签已关闭
- 注：`~/.trae-cn/skills` 与 `~/.workbuddy/skills` 是工具自管目录，冒烟数据放进去会被外部进程回收，测试一律用 API 对真实盘点数据做可逆操作

## 优先级说明

- T1 是风险验证项，先行；T2/T3 是核心逻辑；T4-T7 常规
- 全部完成前不合并交付；每任务一个 commit
