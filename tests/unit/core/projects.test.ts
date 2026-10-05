/**
 * projects 核心逻辑单元测试
 *
 * spec: specs/projects-page.spec.md
 */
import { describe, it, expect } from 'vitest';
import {
  readTraeWorkspaces,
  mergeProjectRecords,
  detectToolMarkers,
  collectAssetStats,
  readGitInfo,
  listProjects,
  validateOpenRequest,
  OPEN_TARGETS,
  type ProjectFs,
  type ProjectSources,
  type GitRunner,
  type WorkspaceRecord,
} from '../../../src/core/projects.js';

interface Node {
  type: 'dir' | 'file';
  content?: string;
  mtime?: string;
}

/** 以 路径→节点 映射构造内存文件系统 */
function makeFs(nodes: Record<string, Node>): ProjectFs {
  const norm = (p: string): string => p.replace(/\\/g, '/');
  const table = new Map<string, Node>();
  for (const [p, n] of Object.entries(nodes)) table.set(norm(p), n);

  const parentDirs = new Set<string>();
  for (const p of table.keys()) {
    const parts = p.split('/');
    let cur = '';
    for (let i = 1; i < parts.length - 1; i++) {
      cur = parts.slice(0, i + 1).join('/');
      parentDirs.add(cur);
    }
  }

  const isDir = (p: string): boolean => table.get(p)?.type === 'dir' || parentDirs.has(p);

  return {
    read: (p) => {
      const n = table.get(norm(p));
      return n && n.type === 'file' ? (n.content ?? '') : null;
    },
    exists: (p) => table.has(norm(p)),
    isDirectory: (p) => isDir(norm(p)),
    listDir: (p) => {
      const base = norm(p);
      const names = new Set<string>();
      const collect = (key: string): void => {
        if (key.startsWith(base + '/')) {
          const seg = key.slice(base.length + 1).split('/')[0];
          if (seg) names.add(seg);
        }
      };
      for (const key of table.keys()) collect(key);
      for (const key of parentDirs) collect(key);
      return Array.from(names).sort();
    },
    mtime: (p) => table.get(norm(p))?.mtime ?? null,
  };
}

const SOURCES: ProjectSources = {
  workspaceStorageDir: '/appdata/Trae CN/User/workspaceStorage',
  worktreesDir: '/home/u/.trae-cn/worktrees',
};

describe('readTraeWorkspaces 解析 workspaceStorage', () => {
  it('解码 file URI、取 mtime、按真实路径去重保留最新', () => {
    const fs = makeFs({
      [`${SOURCES.workspaceStorageDir}/aaa/workspace.json`]: {
        type: 'file',
        content: JSON.stringify({ folder: 'file:///d%3A/demo/SampleProj' }),
        mtime: '2026-09-01T00:00:00.000Z',
      },
      [`${SOURCES.workspaceStorageDir}/bbb/workspace.json`]: {
        type: 'file',
        content: JSON.stringify({ folder: 'file:///~/projects/Demo%20App' }),
        mtime: '2026-09-10T00:00:00.000Z',
      },
      // 同路径旧记录：去重保留最新 mtime
      [`${SOURCES.workspaceStorageDir}/ccc/workspace.json`]: {
        type: 'file',
        content: JSON.stringify({ folder: 'file:///~/projects/SampleProj' }),
        mtime: '2026-10-01T00:00:00.000Z',
      },
      // 损坏 JSON：跳过
      [`${SOURCES.workspaceStorageDir}/ddd/workspace.json`]: { type: 'file', content: '{bad' },
      // 缺 folder：跳过
      [`${SOURCES.workspaceStorageDir}/eee/workspace.json`]: { type: 'file', content: '{}' },
    });

    const records = readTraeWorkspaces(fs, SOURCES.workspaceStorageDir);
    expect(records).toHaveLength(2);
    const vol = records.find((r) => r.path === '~/projects/SampleProj');
    expect(vol?.lastAccessedAt).toBe('2026-10-01T00:00:00.000Z');
    const douyin = records.find((r) => r.path === '~/projects/Demo App');
    expect(douyin?.name).toBe('Demo App');
  });

  it('目录缺失时返回空数组', () => {
    expect(readTraeWorkspaces(makeFs({}), SOURCES.workspaceStorageDir)).toEqual([]);
  });
});

describe('mergeProjectRecords worktrees 历史补充', () => {
  it('同名 worktree 不重复，无对应路径的名称成为历史条目', () => {
    const workspaces: WorkspaceRecord[] = [
      { path: '~/projects/SampleProj', name: 'SampleProj', lastAccessedAt: '2026-10-01T00:00:00.000Z' },
    ];
    const fs = makeFs({
      [`${SOURCES.worktreesDir}/SampleProj`]: { type: 'dir' }, // 与真实项目同名 → 不重复
      [`${SOURCES.worktreesDir}/AI-Native SDLC`]: { type: 'dir' }, // 无真实路径 → 历史
    });

    const merged = mergeProjectRecords(workspaces, fs, SOURCES.worktreesDir);
    expect(merged).toHaveLength(2);
    const real = merged.find((m) => m.name === 'SampleProj');
    expect(real?.path).toBe('~/projects/SampleProj');
    const historical = merged.find((m) => m.name === 'AI-Native SDLC');
    expect(historical?.path).toBe('AI-Native SDLC');
    expect(historical?.historical).toBe(true);
  });
});

describe('detectToolMarkers AI 工具标记', () => {
  it('识别 .trae/.claude/AGENTS.md，忽略 node_modules 内标记', () => {
    const fs = makeFs({
      'd:/proj/.trae': { type: 'dir' },
      'd:/proj/AGENTS.md': { type: 'file' },
      'd:/proj/node_modules/.claude': { type: 'dir' },
    });
    const markers = detectToolMarkers(fs, 'd:/proj');
    const tools = markers.map((m) => m.tool);
    expect(tools).toContain('trae');
    expect(tools).toContain('AGENTS.md');
    expect(tools).not.toContain('claude'); // node_modules 内不算
  });

  it('无标记返回空数组', () => {
    expect(detectToolMarkers(fs2(), 'd:/empty')).toEqual([]);
  });
});

function fs2(): ProjectFs {
  return makeFs({ 'd:/empty/src': { type: 'dir' } });
}

describe('collectAssetStats 资产统计', () => {
  it('统计 rules/skills/docs 且排除依赖目录', () => {
    const fs = makeFs({
      'd:/proj/rules/a.md': { type: 'file' },
      'd:/proj/rules/sub/b.md': { type: 'file' },
      'd:/proj/skills/x/SKILL.md': { type: 'file' },
      'd:/proj/README.md': { type: 'file' },
      'd:/proj/docs/guide.md': { type: 'file' },
      'd:/proj/node_modules/pkg/rules/x.md': { type: 'file' },
      'd:/proj/node_modules/pkg/SKILL.md': { type: 'file' },
      'd:/proj/node_modules/pkg/README.md': { type: 'file' },
    });
    const stats = collectAssetStats(fs, 'd:/proj');
    expect(stats.rules).toBe(2);
    expect(stats.skills).toBe(1);
    expect(stats.docs).toBe(2);
  });
});

describe('readGitInfo', () => {
  it('Git 仓库返回分支与未提交状态', () => {
    const runner: GitRunner = (_cwd, args) => {
      if (args[0] === 'rev-parse') return 'main\n';
      if (args[0] === 'status') return ' M src/a.ts\n';
      return '';
    };
    const info = readGitInfo('d:/proj', runner);
    expect(info).toEqual({ isGitRepo: true, branch: 'main', hasUncommittedChanges: true });
  });

  it('干净仓库 hasUncommittedChanges=false', () => {
    const runner: GitRunner = (_cwd, args) => (args[0] === 'rev-parse' ? 'dev\n' : '');
    const info = readGitInfo('d:/proj', runner);
    expect(info.isGitRepo).toBe(true);
    expect(info.branch).toBe('dev');
    expect(info.hasUncommittedChanges).toBe(false);
  });

  it('非 Git 仓库', () => {
    const runner: GitRunner = () => null;
    expect(readGitInfo('d:/proj', runner)).toEqual({ isGitRepo: false, branch: null, hasUncommittedChanges: false });
  });
});

describe('listProjects 聚合', () => {
  const fs = makeFs({
    [`${SOURCES.workspaceStorageDir}/a/workspace.json`]: {
      type: 'file',
      content: JSON.stringify({ folder: 'file:///d:/proj/alive' }),
      mtime: '2026-10-01T00:00:00.000Z',
    },
    [`${SOURCES.workspaceStorageDir}/b/workspace.json`]: {
      type: 'file',
      content: JSON.stringify({ folder: 'file:///d:/proj/gone' }),
      mtime: '2026-09-01T00:00:00.000Z',
    },
    'd:/proj/alive': { type: 'dir' },
    'd:/proj/alive/.trae': { type: 'dir' },
    'd:/proj/alive/README.md': { type: 'file' },
  });
  const gitRunner: GitRunner = (_cwd, args) => (args[0] === 'rev-parse' ? 'main\n' : '');

  it('按最近访问倒序，富化存在性/标记/统计/git，输出 total/existingCount', () => {
    const result = listProjects({ fs, sources: SOURCES, gitRunner });
    expect(result.total).toBe(2);
    expect(result.existingCount).toBe(1);
    expect(result.items[0].path).toBe('d:/proj/alive'); // 10-01 在前
    const alive = result.items[0];
    expect(alive.exists).toBe(true);
    expect(alive.tools.map((t) => t.tool)).toContain('trae');
    expect(alive.assetStats.docs).toBe(1);
    expect(alive.git.branch).toBe('main');
    expect(result.items[1].exists).toBe(false);
  });

  it('existingOnly 与 search 筛选', () => {
    const onlyExisting = listProjects({ fs, sources: SOURCES, gitRunner, params: { existingOnly: 'true' } });
    expect(onlyExisting.items).toHaveLength(1);
    const searched = listProjects({ fs, sources: SOURCES, gitRunner, params: { search: 'gone' } });
    expect(searched.items[0].path).toBe('d:/proj/gone');
  });
});

describe('项目 ID 生成（非 ASCII 路径）', () => {
  it('纯中文项目名也能生成非空、可用于白名单校验的稳定 ID', () => {
    const fs = makeFs({
      [`${SOURCES.workspaceStorageDir}/a/workspace.json`]: {
        type: 'file',
        content: JSON.stringify({ folder: 'file:///~/projects/sample-docs' }),
        mtime: '2026-10-01T00:00:00.000Z',
      },
      '~/projects/sample-docs': { type: 'dir' },
    });
    const result = listProjects({ fs, sources: SOURCES, gitRunner: () => null });
    const project = result.items[0];
    expect(project.id).not.toBe('');
    expect(project.id).toContain('sample-docs');
    // ID 必须可回查到原项目（真实冒烟中纯中文名曾生成空 ID）
    const decision = validateOpenRequest(project.id, 'explorer', result.items);
    expect(decision.path).toBe('~/projects/sample-docs');
  });
});

describe('validateOpenRequest 安全白名单', () => {
  const fs = makeFs({
    [`${SOURCES.workspaceStorageDir}/a/workspace.json`]: {
      type: 'file',
      content: JSON.stringify({ folder: 'file:///d:/proj/alive' }),
      mtime: '2026-10-01T00:00:00.000Z',
    },
    [`${SOURCES.workspaceStorageDir}/b/workspace.json`]: {
      type: 'file',
      content: JSON.stringify({ folder: 'file:///d:/proj/gone' }),
      mtime: '2026-09-01T00:00:00.000Z',
    },
    'd:/proj/alive': { type: 'dir' },
  });

  it('合法请求返回项目路径', () => {
    const result = listProjects({ fs, sources: SOURCES, gitRunner: () => null });
    const alive = result.items.find((p) => p.path === 'd:/proj/alive');
    const decision = validateOpenRequest(alive!.id, 'explorer', result.items);
    expect(decision.path).toBe('d:/proj/alive');
    expect(OPEN_TARGETS).toEqual(['explorer', 'terminal', 'ide']);
  });

  it('未知 id / 非法 target / 已删除路径均被拒绝', () => {
    const result = listProjects({ fs, sources: SOURCES, gitRunner: () => null });
    expect(() => validateOpenRequest('nope', 'explorer', result.items)).toThrow(/不存在/);
    const alive = result.items.find((p) => p.path === 'd:/proj/alive')!;
    expect(() => validateOpenRequest(alive.id, 'virus' as 'explorer', result.items)).toThrow(/target/);
    const gone = result.items.find((p) => p.path === 'd:/proj/gone')!;
    expect(() => validateOpenRequest(gone.id, 'explorer', result.items)).toThrow(/不存在|已删除|位置/);
  });
});
