/**
 * 项目路由测试
 *
 * spec: projects-page.spec.md（列表、existingOnly、打开白名单、400/404）
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { projectsRouteFactory, type ProjectsRouteDeps } from '../../../src/server/routes/projects.js';
import type { ProjectFs, ProjectSources } from '../../../src/core/projects.js';

interface Node {
  type: 'dir' | 'file';
  content?: string;
  mtime?: string;
}

function makeFs(nodes: Record<string, Node>): ProjectFs {
  const table = new Map(Object.entries(nodes).map(([p, n]) => [p.replace(/\\/g, '/'), n]));
  const parentDirs = new Set<string>();
  for (const p of table.keys()) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length - 1; i++) parentDirs.add(parts.slice(0, i + 1).join('/'));
  }
  const isDir = (p: string): boolean => table.get(p)?.type === 'dir' || parentDirs.has(p);
  return {
    read: (p) => {
      const n = table.get(p);
      return n && n.type === 'file' ? n.content ?? '' : null;
    },
    exists: (p) => table.has(p),
    isDirectory: isDir,
    listDir: (p) => {
      const names = new Set<string>();
      const collect = (key: string): void => {
        if (key.startsWith(p + '/')) {
          const seg = key.slice(p.length + 1).split('/')[0];
          if (seg) names.add(seg);
        }
      };
      for (const key of table.keys()) collect(key);
      for (const key of parentDirs) collect(key);
      return [...names].sort();
    },
    mtime: (p) => table.get(p)?.mtime ?? null,
  };
}

const sources: ProjectSources = {
  workspaceStorageDir: '/appdata/workspaceStorage',
  worktreesDir: '/home/u/.trae-cn/worktrees',
};

function setup(): { app: Hono; calls: Array<{ path: string; target: string }> } {
  const calls: Array<{ path: string; target: string }> = [];
  const fs = makeFs({
    [`${sources.workspaceStorageDir}/a/workspace.json`]: {
      type: 'file',
      content: JSON.stringify({ folder: 'file:///d:/proj/alive' }),
      mtime: '2026-10-01T00:00:00.000Z',
    },
    [`${sources.workspaceStorageDir}/b/workspace.json`]: {
      type: 'file',
      content: JSON.stringify({ folder: 'file:///d:/proj/gone' }),
      mtime: '2026-09-01T00:00:00.000Z',
    },
    'd:/proj/alive': { type: 'dir' },
    'd:/proj/alive/.trae': { type: 'dir' },
  });
  const deps: ProjectsRouteDeps = {
    fs,
    sources,
    gitRunner: () => null,
    opener: (path, target) => {
      calls.push({ path, target });
    },
  };
  const app = new Hono();
  app.route('/api/projects', projectsRouteFactory(deps));
  return { app, calls };
}

describe('GET /api/projects', () => {
  it('200 返回项目列表与计数', async () => {
    const { app } = setup();
    const res = await app.request('/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.existingCount).toBe(1);
    expect(body.items[0].path).toBe('d:/proj/alive');
  });

  it('existingOnly=true 仅返回存在的项目', async () => {
    const { app } = setup();
    const res = await app.request('/api/projects?existingOnly=true');
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});

describe('POST /api/projects/:id/open', () => {
  it('合法请求调用 opener 并返回 ok', async () => {
    const { app, calls } = setup();
    const list = await (await app.request('/api/projects')).json();
    const id = list.items[0].id;
    const res = await app.request(`/api/projects/${id}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'terminal' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual([{ path: 'd:/proj/alive', target: 'terminal' }]);
  });

  it('非法 target 返回 400', async () => {
    const { app } = setup();
    const list = await (await app.request('/api/projects')).json();
    const res = await app.request(`/api/projects/${list.items[0].id}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'virus' }),
    });
    expect(res.status).toBe(400);
  });

  it('未知 id 返回 404', async () => {
    const { app } = setup();
    const res = await app.request('/api/projects/ghost/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'ide' }),
    });
    expect(res.status).toBe(404);
  });

  it('已删除项目拒绝打开（400）', async () => {
    const { app } = setup();
    const list = await (await app.request('/api/projects?existingOnly=false&search=gone')).json();
    const gone = list.items[0];
    const res = await app.request(`/api/projects/${gone.id}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'explorer' }),
    });
    expect(res.status).toBe(400);
  });
});
