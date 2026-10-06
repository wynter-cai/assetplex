/**
 * node-workspaces 测试：workspaces.json 存储、TRAE storage.json 读取、工作区总览组装
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkspaceFs } from '../../../src/core/workspaces.js';
import type { WorkspacesConfig } from '../../../src/core/workspaces-config.js';
import {
  createNodeWorkspacesConfigStore,
  readAutoWorkspacePaths,
  buildWorkspacesOverview,
  traeStorageCandidates,
} from '../../../src/server/lib/node-workspaces.js';

let tempDir = '';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-ws-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** 内存 fs：目录集合自动推导父级，文件集合单独登记（用于 SKILL.md 存在性） */
function makeFs(files: string[]): WorkspaceFs {
  const fileSet = new Set(files);
  const dirSet = new Set<string>();
  const addParents = (p: string): void => {
    const parts = p.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) dirSet.add(parts.slice(0, i).join('/'));
  };
  for (const f of files) addParents(f.replace(/\/[^/]+$/, ''));

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
  backupWorkspaces: {
    folders: [{ folderUri: 'file:///d%3A/trae/auto1' }],
  },
  windowsState: {
    lastActiveWindow: { folder: 'file:///d%3A/trae/ghost' },
    openedWindows: [{ folder: 'file:///d%3A/trae/auto1' }],
  },
  profileAssociations: {
    workspaces: {
      'file:///d%3A/trae/disabled': {},
    },
  },
});

function writeStorage(content = STORAGE_JSON): string {
  const p = join(tempDir, 'storage.json');
  writeFileSync(p, content, 'utf-8');
  return p;
}

const FS_FILES = [
  'd:/trae/auto1/.trae/skills/skill-a/SKILL.md',
  'd:/trae/auto1/.trae/skills/skill-b/SKILL.md',
  'd:/trae/auto1/.trae/skills/not-skill/readme.txt',
  'd:/trae/manual1/.trae/skills/only/SKILL.md',
  'd:/trae/disabled/.trae/skills/x/SKILL.md',
  'd:/trae/ghost/notes.txt',
];

describe('workspaces.json 配置存储', () => {
  it('文件缺失时返回默认配置', () => {
    const store = createNodeWorkspacesConfigStore(join(tempDir, 'workspaces.json'));
    expect(store.load()).toEqual({ autoDiscover: true, roots: [], disabledWorkspaces: [] });
  });

  it('保存后可读取（往返）', () => {
    const file = join(tempDir, 'workspaces.json');
    const store = createNodeWorkspacesConfigStore(file);
    const config: WorkspacesConfig = {
      autoDiscover: false,
      roots: ['d:/trae/manual1'],
      disabledWorkspaces: ['d:/trae/disabled'],
    };
    store.save(config);
    expect(createNodeWorkspacesConfigStore(file).load()).toEqual(config);
  });

  it('文件损坏时宽容回默认，不抛错', () => {
    const file = join(tempDir, 'workspaces.json');
    writeFileSync(file, '{ broken', 'utf-8');
    expect(createNodeWorkspacesConfigStore(file).load()).toEqual({
      autoDiscover: true,
      roots: [],
      disabledWorkspaces: [],
    });
  });
});

describe('readAutoWorkspacePaths', () => {
  it('从 storage.json 三段提取去重路径', () => {
    const result = readAutoWorkspacePaths(writeStorage());
    expect(result.error).toBeUndefined();
    expect(result.paths.sort()).toEqual(['d:/trae/auto1', 'd:/trae/disabled', 'd:/trae/ghost']);
  });

  it('文件缺失时返回错误与空列表', () => {
    const result = readAutoWorkspacePaths(join(tempDir, 'nope.json'));
    expect(result.paths).toEqual([]);
    expect(result.error).toMatch(/无法读取|nope\.json/);
  });

  it('内容非法时返回错误与空列表', () => {
    const result = readAutoWorkspacePaths(writeStorage('not json'));
    expect(result.paths).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('候选路径包含 APPDATA 下的 TRAE CN 标准位置', () => {
    const candidates = traeStorageCandidates({
      APPDATA: 'C:/Users/tester/AppData/Roaming',
      HOME: 'C:/Users/tester',
    });
    const normalized = candidates.map((c) => c.replaceAll('\\', '/')).join('|');
    expect(normalized).toContain('Trae CN/User/globalStorage/storage.json');
  });
});

describe('buildWorkspacesOverview', () => {
  const config: WorkspacesConfig = {
    autoDiscover: true,
    roots: ['d:/trae/manual1'],
    disabledWorkspaces: ['d:/trae/disabled'],
  };

  it('手动优先排序、技能计数正确、禁用项单独展示且不进入扫描目录', () => {
    const store = createNodeWorkspacesConfigStore(join(tempDir, 'workspaces.json'));
    store.save(config);
    const overview = buildWorkspacesOverview({
      configStore: store,
      storagePath: writeStorage(),
      fs: makeFs(FS_FILES),
    });

    const active = overview.workspaces.filter((w) => !w.disabled);
    expect(active.map((w) => w.path)).toEqual(['d:/trae/manual1', 'd:/trae/auto1']);
    expect(active[0]).toMatchObject({ source: 'manual', skillCount: 1, skillsDirExists: true });
    expect(active[1]).toMatchObject({ source: 'auto', skillCount: 2, skillsDirExists: true });
    expect(active.every((w) => w.name.length > 0)).toBe(true);

    const disabled = overview.workspaces.find((w) => w.disabled);
    expect(disabled).toMatchObject({
      path: 'd:/trae/disabled',
      source: 'auto',
      disabled: true,
      skillCount: 1,
    });

    expect(overview.workspaceDirs.sort()).toEqual(['d:/trae/auto1', 'd:/trae/manual1']);
    expect(overview.truncated).toBe(false);
    expect(overview.maxWorkspaces).toBe(100);
    expect(overview.errors).toEqual([]);
  });

  it('无技能目录的自动工作区静默剔除，不报错', () => {
    const store = createNodeWorkspacesConfigStore(join(tempDir, 'workspaces.json'));
    store.save({ autoDiscover: true, roots: [], disabledWorkspaces: [] });
    const overview = buildWorkspacesOverview({
      configStore: store,
      storagePath: writeStorage(),
      fs: makeFs(FS_FILES),
    });
    expect(overview.workspaces.some((w) => w.path === 'd:/trae/ghost')).toBe(false);
    expect(overview.errors).toEqual([]);
  });

  it('关闭自动发现后只剩手动工作区；不可访问手动根进入 errors', () => {
    const store = createNodeWorkspacesConfigStore(join(tempDir, 'workspaces.json'));
    store.save({
      autoDiscover: false,
      roots: ['d:/trae/manual1', 'd:/missing/root'],
      disabledWorkspaces: [],
    });
    const overview = buildWorkspacesOverview({
      configStore: store,
      storagePath: writeStorage(),
      fs: makeFs(FS_FILES),
    });
    expect(overview.workspaces.map((w) => w.path)).toEqual(['d:/trae/manual1']);
    expect(overview.errors).toHaveLength(1);
    expect(overview.errors[0]).toContain('d:/missing/root');
  });

  it('storage.json 缺失时保留手动工作区并给出错误提示', () => {
    const store = createNodeWorkspacesConfigStore(join(tempDir, 'workspaces.json'));
    store.save(config);
    const overview = buildWorkspacesOverview({
      configStore: store,
      storagePath: join(tempDir, 'nope.json'),
      fs: makeFs(FS_FILES),
    });
    expect(overview.workspaces.some((w) => w.path === 'd:/trae/manual1')).toBe(true);
    expect(overview.workspaces.some((w) => w.path === 'd:/trae/auto1')).toBe(false);
    expect(overview.errors).toHaveLength(1);
  });
});
