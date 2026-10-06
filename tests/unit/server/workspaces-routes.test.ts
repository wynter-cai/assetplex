/**
 * /api/workspaces 路由测试 + 技能盘点动态工作区接线
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspacesRouteFactory } from '../../../src/server/routes/workspaces.js';
import { skillsRouteFactory } from '../../../src/server/routes/skills.js';
import { createNodeWorkspacesConfigStore } from '../../../src/server/lib/node-workspaces.js';
import type { WorkspaceConfigStore } from '../../../src/server/lib/node-workspaces.js';
import type { WorkspaceFs } from '../../../src/core/workspaces.js';
import type { SkillWriteFs } from '../../../src/core/skill-write.js';
import type { SkillSources, SkillOverrideStore } from '../../../src/core/skills-inventory.js';

let tempDir = '';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-ws-route-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeFs(files: string[]): WorkspaceFs {
  const fileSet = new Set(files);
  const dirSet = new Set<string>();
  for (const f of files) {
    const dir = f.replace(/\/[^/]+$/, '');
    const parts = dir.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) dirSet.add(parts.slice(0, i).join('/'));
  }
  return {
    exists: (p: string) => dirSet.has(p) || fileSet.has(p),
    isDirectory: (p: string) => dirSet.has(p),
    listDir: (p: string) => {
      const prefix = p.endsWith('/') ? p : `${p}/`;
      const children = new Set<string>();
      for (const d of dirSet) {
        if (d.startsWith(prefix)) children.add(d.slice(prefix.length).split('/')[0] ?? '');
      }
      for (const f of fileSet) {
        if (f.startsWith(prefix)) children.add(f.slice(prefix.length).split('/')[0] ?? '');
      }
      return [...children].filter(Boolean).sort();
    },
  };
}

const STORAGE_JSON = JSON.stringify({
  backupWorkspaces: { folders: [{ folderUri: 'file:///d%3A/trae/ws1' }] },
});

const FS_FILES = ['d:/trae/ws1/.trae/skills/alpha/SKILL.md'];

function buildApp(store: WorkspaceConfigStore): Hono {
  const app = new Hono();
  app.route(
    '/api/workspaces',
    workspacesRouteFactory({
      configStore: store,
      storagePath: join(tempDir, 'storage.json'),
      fs: makeFs(FS_FILES),
    }),
  );
  return app;
}

describe('GET /api/workspaces', () => {
  it('200 返回配置与工作区总览（不泄露内部 workspaceDirs 字段）', async () => {
    writeFileSync(join(tempDir, 'storage.json'), STORAGE_JSON, 'utf-8');
    const store = createNodeWorkspacesConfigStore(join(tempDir, 'workspaces.json'));
    const res = await buildApp(store).request('/api/workspaces');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.autoDiscover).toBe(true);
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0]).toMatchObject({
      path: 'd:/trae/ws1',
      source: 'auto',
      skillCount: 1,
      skillsDirExists: true,
    });
    expect(body.maxWorkspaces).toBe(100);
    expect(body.truncated).toBe(false);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.workspaceDirs).toBeUndefined();
  });
});

describe('PUT /api/workspaces', () => {
  it('200 合并更新并持久化，响应体现新配置', async () => {
    writeFileSync(join(tempDir, 'storage.json'), STORAGE_JSON, 'utf-8');
    const file = join(tempDir, 'workspaces.json');
    const store = createNodeWorkspacesConfigStore(file);
    const res = await buildApp(store).request('/api/workspaces', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoDiscover: false, roots: ['d:/trae/ws1'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config).toEqual({
      autoDiscover: false,
      roots: ['d:/trae/ws1'],
      disabledWorkspaces: [],
    });
    expect(body.workspaces[0].source).toBe('manual');
    expect(createNodeWorkspacesConfigStore(file).load().autoDiscover).toBe(false);
  });

  it('相对路径 400 且不写入', async () => {
    const file = join(tempDir, 'workspaces.json');
    const store = createNodeWorkspacesConfigStore(file);
    const res = await buildApp(store).request('/api/workspaces', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roots: ['relative/path'] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/绝对路径/);
    expect(createNodeWorkspacesConfigStore(file).load().roots).toEqual([]);
  });

  it('非 JSON 请求体 400', async () => {
    const store = createNodeWorkspacesConfigStore(join(tempDir, 'workspaces.json'));
    const res = await buildApp(store).request('/api/workspaces', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'nope',
    });
    expect(res.status).toBe(400);
  });
});

describe('技能盘点动态工作区接线', () => {
  class MemoryWriteFs implements SkillWriteFs {
    constructor(private readonly files: Record<string, string>) {}
    read(p: string): string | null {
      return Object.prototype.hasOwnProperty.call(this.files, p) ? this.files[p] : null;
    }
    listDir(p: string): string[] {
      const names = new Set<string>();
      for (const f of Object.keys(this.files)) {
        if (f.startsWith(p + '/')) names.add(f.slice(p.length + 1).split('/')[0] ?? '');
      }
      return [...names].sort();
    }
    dirMtime(): string | null {
      return null;
    }
    exists(p: string): boolean {
      return Object.prototype.hasOwnProperty.call(this.files, p);
    }
    ensureDir(): void {}
    writeFile(p: string, content: string): void {
      this.files[p] = content;
    }
    removeDir(p: string): void {
      for (const key of Object.keys(this.files)) {
        if (key.startsWith(p + '/')) delete this.files[key];
      }
    }
  }

  class MemoryStore implements SkillOverrideStore {
    load(): Record<string, never> {
      return {};
    }
    save(): void {}
  }

  it('resolveWorkspaceDirs 注入后项目技能出现在盘点结果', async () => {
    const sources: SkillSources = {
      vaultSkillsDir: '/hub/skills',
      userSkillsDir: '/root/.trae-cn/skills',
      builtinRoot: '/root/.trae-cn/builtin',
      builtinSkillsDir: '/root/.trae-cn/builtin_skills',
      pluginsRoot: '/root/.trae-cn/plugins',
      marketplaceSkillsDir: '/root/.codebuddy/skills-marketplace/skills',
      workspaceDirs: [],
    };
    const fs = new MemoryWriteFs({
      'd:/trae/ws1/.trae/skills/alpha/SKILL.md': '---\nname: alpha\ndescription: 项目技能\n---',
    });
    const app = new Hono();
    app.route(
      '/api/skills',
      skillsRouteFactory({
        fs,
        writeFs: fs,
        sources,
        store: new MemoryStore(),
        resolveWorkspaceDirs: () => ['d:/trae/ws1'],
      }),
    );
    const res = await app.request('/api/skills');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.countByProvenance.self).toBe(1);
    expect(body.items[0].workspaceName).toBe('ws1');
  });
});
