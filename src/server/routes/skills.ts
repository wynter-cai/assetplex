/**
 * 技能分类全貌 API 路由
 *
 * GET /api/skills                 列出（可按职能/来源筛选、搜索）
 * PUT /api/skills/:id/function    手动覆盖某技能的职能分类
 *
 * spec: skills-taxonomy.spec.md
 */

import { Hono } from 'hono';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  listSkills,
  getSkillRawContent,
  overrideSkillFunction,
  SKILL_FUNCTIONS,
  type SkillFs,
  type SkillFunction,
  type SkillOverrideStore,
  type SkillSources,
  type ListSkillsParams,
} from '../../core/skills-inventory.js';
import { nodeAgentFs } from '../lib/node-agent-fs.js';
import { nodeSkillOverrideStore } from '../lib/node-skill-override-store.js';

export interface SkillsRouteDeps {
  fs: SkillFs;
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
  };
}

/** 创建技能路由（可注入依赖，便于测试） */
export function skillsRouteFactory(
  deps: SkillsRouteDeps = {
    fs: nodeAgentFs,
    sources: defaultSkillSources(),
    store: nodeSkillOverrideStore,
  },
): Hono {
  const routes = new Hono();
  const { fs, sources, store } = deps;

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
