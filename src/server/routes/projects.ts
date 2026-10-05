/**
 * AI-Coding 项目可视化 API 路由
 *
 * GET  /api/projects           列出（existingOnly/search）
 * POST /api/projects/:id/open  在本机以 explorer/terminal/ide 打开（白名单校验）
 *
 * spec: projects-page.spec.md
 */

import { Hono } from 'hono';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  listProjects,
  validateOpenRequest,
  type GitRunner,
  type ProjectFs,
  type ProjectSources,
  type OpenTarget,
} from '../../core/projects.js';
import { nodeProjectFs } from '../lib/node-project-fs.js';
import { nodeGitRunner } from '../lib/node-git-runner.js';
import { nodeProjectOpener, type ProjectOpener } from '../lib/node-project-opener.js';

export interface ProjectsRouteDeps {
  fs: ProjectFs;
  sources: ProjectSources;
  gitRunner: GitRunner;
  opener: ProjectOpener;
}

/** 解析本机 TRAE 项目数据来源 */
export function defaultProjectSources(): ProjectSources {
  const home = homedir();
  const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
  return {
    workspaceStorageDir: join(appData, 'Trae CN', 'User', 'workspaceStorage'),
    worktreesDir: join(home, '.trae-cn', 'worktrees'),
  };
}

/** 创建项目路由（依赖可注入，便于测试） */
export function projectsRouteFactory(
  deps: ProjectsRouteDeps = {
    fs: nodeProjectFs,
    sources: defaultProjectSources(),
    gitRunner: nodeGitRunner,
    opener: nodeProjectOpener,
  },
): Hono {
  const routes = new Hono();
  const { fs, sources, gitRunner, opener } = deps;

  /** 列出项目 */
  routes.get('/', (c) => {
    const result = listProjects({
      fs,
      sources,
      gitRunner,
      params: {
        existingOnly: c.req.query('existingOnly') ?? undefined,
        search: c.req.query('search') ?? undefined,
      },
    });
    return c.json(result);
  });

  /** 快捷打开（路径必须在本次扫描清单内） */
  routes.post('/:id/open', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    let body: unknown = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const target = (body as { target?: unknown } | null)?.target;
    if (typeof target !== 'string') {
      return c.json({ error: '缺少 target（explorer / terminal / ide）' }, 400);
    }

    // 每次请求重新扫描，确保白名单即当前清单
    const scanned = listProjects({ fs, sources, gitRunner }).items;

    try {
      const decision = validateOpenRequest(id, target, scanned);
      opener(decision.path, decision.target as OpenTarget);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.startsWith('项目不存在') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  return routes;
}

/** 默认路由（真实文件系统） */
export const projectsRoutes = projectsRouteFactory();
