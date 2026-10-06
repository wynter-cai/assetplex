/**
 * 技能分类全貌 API 路由
 *
 * GET  /api/skills                        列出（可按职能/来源筛选、搜索；AI 缓存自动应用）
 * PUT  /api/skills/:id/function           手动覆盖某技能的职能分类
 * POST /api/skills/function-batch         批量覆盖职能分类
 * POST /api/skills/curate                 沉淀单个技能到保险箱
 * POST /api/skills/curate-batch           批量沉淀
 * POST /api/skills                        新建保险箱技能
 * PUT  /api/skills/:id                    编辑保险箱技能（整文件替换）
 * DELETE /api/skills/:id                  删除保险箱技能
 * GET  /api/skills/ai-classify/config     读取 AI 分类配置（apiKey 脱敏）
 * PUT  /api/skills/ai-classify/config     保存 AI 分类配置（apiKey 缺省保留旧值）
 * POST /api/skills/ai-classify            执行 AI 分类（部分成功语义）
 *
 * spec: skills-taxonomy.spec.md, add-skill-agent-write-management, add-skill-curation,
 *       设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 */

import { Hono } from 'hono';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  listSkills,
  getSkillRawContent,
  overrideSkillFunction,
  overrideSkillFunctionsBatch,
  SKILL_FUNCTIONS,
  type SkillFs,
  type SkillFunction,
  type SkillOverrideStore,
  type SkillSources,
  type ListSkillsParams,
} from '../../core/skills-inventory.js';
import {
  createVaultSkill,
  updateVaultSkill,
  deleteVaultSkill,
  type SkillWriteFs,
} from '../../core/skill-write.js';
import { curateVaultSkill, curateVaultSkills } from '../../core/skill-curation.js';
import {
  classifySkillsWithAi,
  createAiLookup,
  AiConfigIncompleteError,
  type LlmClient,
} from '../../core/skill-ai-classification.js';
import {
  loadAiClassifyConfig,
  saveAiClassifyConfig,
  toAiConfigView,
} from '../../core/ai-config.js';
import type { AiConfigStore } from '../../core/ai-config.js';
import type { AiClassifyCacheStore } from '../../core/skill-ai-cache.js';
import { getHubRoot } from '../../utils/paths.js';
import { nodeAgentFs } from '../lib/node-agent-fs.js';
import { nodeSkillWriteFs } from '../lib/node-skill-write-fs.js';
import { nodeSkillOverrideStore } from '../lib/node-skill-override-store.js';
import { nodeAiConfigStore, nodeAiCacheStore } from '../lib/node-ai-classify-store.js';
import { createOpenAiLlmClient } from '../lib/openai-llm-client.js';
import { buildWorkspacesOverview } from '../lib/node-workspaces.js';
import { toWriteErrorResponse } from '../lib/write-error.js';
import { toApiSkill } from '../lib/skill-api.js';

export interface SkillsRouteDeps {
  fs: SkillFs;
  writeFs: SkillWriteFs;
  sources: SkillSources;
  store: SkillOverrideStore;
  /** AI 分类配置存储（可选；缺省用全局单例，测试可注入内存实现） */
  aiConfigStore?: AiConfigStore;
  /** AI 分类内容缓存（可选；缺省用全局单例） */
  aiCacheStore?: AiClassifyCacheStore;
  /** LLM 客户端（可选；缺省按配置现场构造 OpenAI 兼容客户端，测试注入 mock） */
  llmClient?: LlmClient;
  /** 动态解析工作区目录（设置变更即时生效）；缺省用静态 sources.workspaceDirs */
  resolveWorkspaceDirs?: () => string[];
}

/** 解析本机各技能来源根目录 */
export function defaultSkillSources(): SkillSources {
  const home = homedir();
  return {
    userSkillsDir: join(home, '.trae-cn', 'skills'),
    builtinRoot: join(home, '.trae-cn', 'builtin'),
    builtinSkillsDir: join(home, '.trae-cn', 'builtin_skills'),
    pluginsRoot: join(home, '.trae-cn', 'plugins'),
    marketplaceSkillsDir: join(home, '.codebuddy', 'skills-marketplace', 'skills'),
    // 工作区目录由 resolveWorkspaceDirs 每请求动态解析；此处空数组仅作无 resolver 时的回退
    workspaceDirs: [],
    vaultSkillsDir: join(getHubRoot(), 'skills'),
  };
}

/** 创建技能路由（可注入依赖，便于测试） */
export function skillsRouteFactory(
  deps: SkillsRouteDeps = {
    fs: nodeAgentFs,
    writeFs: nodeSkillWriteFs,
    sources: defaultSkillSources(),
    store: nodeSkillOverrideStore,
    aiConfigStore: nodeAiConfigStore,
    aiCacheStore: nodeAiCacheStore,
    resolveWorkspaceDirs: () => buildWorkspacesOverview().workspaceDirs,
  },
): Hono {
  const routes = new Hono();
  const { fs, writeFs, sources, store } = deps;

  /** 每请求动态解析工作区目录（设置变更无需重启）；未注入时回退静态 sources */
  const currentSources = (): SkillSources =>
    deps.resolveWorkspaceDirs
      ? { ...sources, workspaceDirs: deps.resolveWorkspaceDirs() }
      : sources;

  /** AI 缓存查询（缓存未注入时为 undefined，盘点回退关键词兜底） */
  const aiLookup = deps.aiCacheStore ? createAiLookup(deps.aiCacheStore) : undefined;

  /** 列出技能全貌（provenance/status 过滤；计数随筛选联动） */
  routes.get('/', (c) => {
    try {
      const result = listSkills({
        fs,
        sources: currentSources(),
        store,
        aiLookup,
        params: {
          function: (c.req.query('function') as ListSkillsParams['function']) ?? undefined,
          provenance: (c.req.query('provenance') as ListSkillsParams['provenance']) ?? undefined,
          status: (c.req.query('status') as ListSkillsParams['status']) ?? undefined,
          search: c.req.query('search') ?? undefined,
        },
      });
      return c.json({
        total: result.total,
        items: result.items.map(toApiSkill),
        countByFunction: result.countByFunction,
        countByProvenance: result.countByProvenance,
        countByStatus: result.countByStatus,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 手动覆盖职能分类 */
  routes.put('/:id/function', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const functionCategory = (body as { functionCategory?: unknown } | null)?.functionCategory;
    if (typeof functionCategory !== 'string' || !(SKILL_FUNCTIONS as string[]).includes(functionCategory)) {
      return c.json({ error: `无效职能，支持：${SKILL_FUNCTIONS.join(', ')}` }, 400);
    }

    try {
      const skill = overrideSkillFunction(id, functionCategory as SkillFunction, { fs, sources: currentSources(), store, aiLookup });
      if (!skill) {
        return c.json({ error: `技能不存在：${id}` }, 404);
      }
      return c.json({ skill: toApiSkill(skill) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 批量覆盖职能分类（ids 中磁盘已不存在的计入 missing，不影响其余） */
  routes.post('/function-batch', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = body as { ids?: unknown; functionCategory?: unknown } | null;
    if (!Array.isArray(parsed?.ids) || parsed.ids.some((id) => typeof id !== 'string')) {
      return c.json({ error: 'ids 必须是字符串数组' }, 400);
    }
    const ids = parsed.ids as string[];
    if (ids.length === 0) {
      return c.json({ error: 'ids 不能为空' }, 400);
    }
    const functionCategory = parsed.functionCategory;
    if (typeof functionCategory !== 'string' || !(SKILL_FUNCTIONS as string[]).includes(functionCategory)) {
      return c.json({ error: `无效职能，支持：${SKILL_FUNCTIONS.join(', ')}` }, 400);
    }
    try {
      const result = overrideSkillFunctionsBatch(ids, functionCategory as SkillFunction, { fs, sources: currentSources(), store, aiLookup });
      return c.json({ updated: result.updated.map(toApiSkill), missing: result.missing });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 沉淀单个技能到保险箱（复制非 vault 技能并记录来源） */
  routes.post('/curate', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = body as { id?: unknown; name?: unknown } | null;
    if (typeof parsed?.id !== 'string' || parsed.id.trim() === '') {
      return c.json({ error: 'id 必须是非空字符串' }, 400);
    }
    if (parsed.name !== undefined && typeof parsed.name !== 'string') {
      return c.json({ error: 'name 必须是字符串' }, 400);
    }
    try {
      const skill = curateVaultSkill(
        { id: parsed.id, name: parsed.name as string | undefined },
        { fs: writeFs, sources: currentSources(), store },
      );
      return c.json({ skill: toApiSkill(skill) }, 201);
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 批量沉淀（部分成功语义：created 与 failed 分开返回，已成功不回滚） */
  routes.post('/curate-batch', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = body as { ids?: unknown } | null;
    if (!Array.isArray(parsed?.ids) || parsed.ids.some((id) => typeof id !== 'string')) {
      return c.json({ error: 'ids 必须是字符串数组' }, 400);
    }
    const ids = parsed.ids as string[];
    if (ids.length === 0) {
      return c.json({ error: 'ids 不能为空' }, 400);
    }
    try {
      const result = curateVaultSkills({ ids }, { fs: writeFs, sources: currentSources(), store });
      return c.json({ created: result.created.map(toApiSkill), failed: result.failed });
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 读取 AI 分类配置（apiKey 脱敏，只回传 hasApiKey） */
  routes.get('/ai-classify/config', (c) => {
    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    return c.json(toAiConfigView(config));
  });

  /** 保存 AI 分类配置（校验失败 400 且不写入；apiKey 缺省保留旧值） */
  routes.put('/ai-classify/config', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = body as { baseUrl?: unknown; apiKey?: unknown; model?: unknown } | null;
    if (typeof parsed?.baseUrl !== 'string' || typeof parsed?.model !== 'string') {
      return c.json({ error: 'baseUrl 与 model 必须是字符串' }, 400);
    }
    if (parsed.apiKey !== undefined && typeof parsed.apiKey !== 'string') {
      return c.json({ error: 'apiKey 必须是字符串或缺省（缺省保留旧值）' }, 400);
    }
    try {
      const view = saveAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore, {
        baseUrl: parsed.baseUrl,
        apiKey: parsed.apiKey as string | undefined,
        model: parsed.model,
      });
      return c.json(view);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 执行 AI 分类（部分成功语义；配置未就绪 400；失败明细不写缓存） */
  routes.post('/ai-classify', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = body as { ids?: unknown } | null;
    if (parsed?.ids !== undefined && (!Array.isArray(parsed.ids) || parsed.ids.some((id) => typeof id !== 'string'))) {
      return c.json({ error: 'ids 必须是字符串数组或缺省' }, 400);
    }
    const ids = parsed?.ids as string[] | undefined;

    const aiConfigStore = deps.aiConfigStore ?? nodeAiConfigStore;
    const aiCacheStore = deps.aiCacheStore ?? nodeAiCacheStore;
    const config = loadAiClassifyConfig(aiConfigStore);
    const llm = deps.llmClient ?? createOpenAiLlmClient(config);

    try {
      const result = await classifySkillsWithAi(
        { ids },
        { fs, sources: currentSources(), store, cache: aiCacheStore, llm, config },
      );
      return c.json({ ...result, classified: result.classified.map(toApiSkill) });
    } catch (err) {
      if (err instanceof AiConfigIncompleteError) {
        return c.json({ error: err.message }, 400);
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  /** 新建保险箱技能（vault skills/<name>/SKILL.md） */
  routes.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = body as { name?: unknown; description?: unknown; content?: unknown } | null;
    if (typeof parsed?.name !== 'string') {
      return c.json({ error: 'name 必须是字符串' }, 400);
    }
    if (typeof parsed?.content !== 'string') {
      return c.json({ error: 'content 必须是字符串' }, 400);
    }
    if (parsed.description !== undefined && typeof parsed.description !== 'string') {
      return c.json({ error: 'description 必须是字符串' }, 400);
    }
    try {
      const skill = createVaultSkill(
        { name: parsed.name, description: parsed.description, content: parsed.content },
        { fs: writeFs, sources: currentSources(), store },
      );
      return c.json({ skill: toApiSkill(skill) }, 201);
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 编辑保险箱技能（整文件替换 SKILL.md） */
  routes.put('/:id', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const content = (body as { content?: unknown } | null)?.content;
    if (typeof content !== 'string') {
      return c.json({ error: 'content 必须是字符串' }, 400);
    }
    try {
      const skill = updateVaultSkill(id, content, { fs: writeFs, sources: currentSources(), store });
      return c.json({ skill: toApiSkill(skill) });
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 删除保险箱技能（整个 skills/<name>/ 目录） */
  routes.delete('/:id', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      deleteVaultSkill(id, { fs: writeFs, sources: currentSources(), store });
      return c.json({ success: true });
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 单个技能详情（元信息 + SKILL.md 原文） */
  routes.get('/:id', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const result = getSkillRawContent(id, { fs, sources: currentSources(), store, aiLookup });
    if (!result) {
      return c.json({ error: `技能不存在：${id}` }, 404);
    }
    return c.json({ skill: toApiSkill(result.skill), rawContent: result.rawContent });
  });

  return routes;
}

/** 默认路由（真实文件系统 + 持久化覆盖存储） */
export const skillsRoutes = skillsRouteFactory();
