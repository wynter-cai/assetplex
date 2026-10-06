/**
 * 工作区发现管理 API
 *
 * GET /api/workspaces   配置 + 工作区总览（有效/禁用、技能计数、错误提示）
 * PUT /api/workspaces   合并更新配置（字段可选；校验失败 400 且不写入）
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */

import { Hono } from 'hono';
import {
  buildWorkspacesOverview,
  createNodeWorkspacesConfigStore,
  type BuildWorkspacesDeps,
} from '../lib/node-workspaces.js';
import { mergeWorkspacesConfig, WorkspaceConfigError } from '../../core/workspaces-config.js';

export type WorkspacesRouteDeps = BuildWorkspacesDeps;

/** 组装当前总览（剥离去往盘点内部使用的 workspaceDirs 字段） */
function overviewView(deps: WorkspacesRouteDeps) {
  const { workspaceDirs: _workspaceDirs, ...view } = buildWorkspacesOverview(deps);
  return view;
}

export function workspacesRouteFactory(deps: WorkspacesRouteDeps = {}): Hono {
  const routes = new Hono();
  const store = deps.configStore ?? createNodeWorkspacesConfigStore();
  const effectiveDeps: WorkspacesRouteDeps = { ...deps, configStore: store };

  routes.get('/', (c) => c.json(overviewView(effectiveDeps)));

  routes.put('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    try {
      const merged = mergeWorkspacesConfig(body, store.load());
      store.save(merged);
      return c.json(overviewView(effectiveDeps));
    } catch (err) {
      if (err instanceof WorkspaceConfigError) return c.json({ error: err.message }, 400);
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return routes;
}

/** 默认路由（真实文件系统 + ~/.assetplex/workspaces.json） */
export const workspacesRoutes = workspacesRouteFactory();
