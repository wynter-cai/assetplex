/**
 * 技能分类全貌 API 路由
 *
 * GET /api/skills                 列出（可按职能/来源筛选、搜索）
 * PUT /api/skills/:id/function    手动覆盖某技能的职能分类
 * POST /api/skills/function-batch 批量覆盖职能分类
 * POST /api/skills                新建保险箱技能
 * PUT /api/skills/:id             编辑保险箱技能（整文件替换）
 * DELETE /api/skills/:id          删除保险箱技能
 *
 * spec: skills-taxonomy.spec.md, add-skill-agent-write-management
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
import { getHubRoot } from '../../utils/paths.js';
import { nodeAgentFs } from '../lib/node-agent-fs.js';
import { nodeSkillWriteFs } from '../lib/node-skill-write-fs.js';
import { nodeSkillOverrideStore } from '../lib/node-skill-override-store.js';
import { toWriteErrorResponse } from '../lib/write-error.js';

export interface SkillsRouteDeps {
  fs: SkillFs;
  writeFs: SkillWriteFs;
  sources: SkillSources;
  store: SkillOverrideStore;
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
  },
): Hono {
  const routes = new Hono();
  const { fs, writeFs, sources, store } = deps;

  /** 列出技能全貌 */
  routes.get('/', (c) => {
    try {
      const result = listSkills({
        fs,
        sources,
        store,
        params: {
          function: (c.req.query('function') as ListSkillsParams['function']) ?? undefined,
          origin: (c.req.query('origin') as ListSkillsParams['origin']) ?? undefined,
          search: c.req.query('search') ?? undefined,
        },
      });
      return c.json(result);
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
      const skill = overrideSkillFunction(id, functionCategory as SkillFunction, { fs, sources, store });
      if (!skill) {
        return c.json({ error: `技能不存在：${id}` }, 404);
      }
      return c.json({ skill });
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
      const result = overrideSkillFunctionsBatch(ids, functionCategory as SkillFunction, { fs, sources, store });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
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
        { fs: writeFs, sources, store },
      );
      return c.json({ skill }, 201);
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
      const skill = updateVaultSkill(id, content, { fs: writeFs, sources, store });
      return c.json({ skill });
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 删除保险箱技能（整个 skills/<name>/ 目录） */
  routes.delete('/:id', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      deleteVaultSkill(id, { fs: writeFs, sources, store });
      return c.json({ success: true });
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 单个技能详情（元信息 + SKILL.md 原文） */
  routes.get('/:id', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const result = getSkillRawContent(id, { fs, sources, store });
    if (!result) {
      return c.json({ error: `技能不存在：${id}` }, 404);
    }
    return c.json(result);
  });

  return routes;
}

/** 默认路由（真实文件系统 + 持久化覆盖存储） */
export const skillsRoutes = skillsRouteFactory();
