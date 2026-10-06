/**
 * workspaces 单元测试：TRAE 工作区自动发现与手动根展开
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */
import { describe, it, expect } from 'vitest';
import {
  parseTraeStorageJson,
  resolveWorkspaceDirs,
  MAX_WORKSPACES,
  type WorkspaceFs,
} from '../../../src/core/workspaces.js';

/** 以「存在的目录」集合构造内存 fs（自动推导全部父目录）；路径统一 posix 风格 */
function makeFs(existingDirs: string[], realpaths?: Record<string, string>): WorkspaceFs {
  const dirSet = new Set<string>();
  for (const path of existingDirs) {
    const parts = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
    let cur = '';
    for (const seg of parts) {
      cur = cur === '' ? seg : `${cur}/${seg}`;
      dirSet.add(cur);
    }
  }
  const list = (p: string): string[] => {
    const base = p.replace(/\/+$/, '');
    if (!dirSet.has(base)) return [];
    const children = new Set<string>();
    for (const d of dirSet) {
      if (d.startsWith(`${base}/`)) {
        const rest = d.slice(base.length + 1);
        if (rest.includes('/') === false) children.add(rest);
      }
    }
    return [...children].sort();
  };
  return {
    listDir: list,
    isDirectory: (p: string) => dirSet.has(p.replace(/\/+$/, '')),
    realpath: realpaths
      ? (p: string) => {
          const key = p.replace(/\/+$/, '');
          return realpaths[key] ?? key;
        }
      : undefined,
  };
}

describe('parseTraeStorageJson 解析 TRAE 工作区记录', () => {
  it('解析三个区段并解码 URI、去重', () => {
    const content = JSON.stringify({
      backupWorkspaces: {
        folders: [
          { folderUri: 'file:///d%3A/demo/Demo%20App' },
          { folderUri: 'file:///d%3A/demo/Zhihu' },
        ],
      },
      windowsState: {
        lastActiveWindow: { folder: 'file:///d%3A/demo/Agent%E6%AD%A6%E5%99%A8%E5%BA%93' },
        openedWindows: [
          { folder: 'file:///d%3A/demo/Zhihu' },
          { folder: 'file:///d%3A/demo/sample%20workflow' },
        ],
      },
      profileAssociations: {
        workspaces: {
          'file:///d%3A/demo/Super%20Powers': '__default__profile__',
          'file:///d%3A/demo/Zhihu': '__default__profile__',
        },
      },
    });

    expect(parseTraeStorageJson(content).sort()).toEqual([
      '~/projects/my-project',
      '~/projects/Demo App',
      '~/projects/Super Powers',
      '~/projects/Zhihu',
      '~/projects/sample workflow',
    ]);
  });

  it('容忍未编码盘符冒号的 file URI', () => {
    const content = JSON.stringify({
      profileAssociations: { workspaces: { 'file:///~/projects/OpenClaw': 'p' } },
    });
    expect(parseTraeStorageJson(content)).toEqual(['~/projects/OpenClaw']);
  });

  it('POSIX 路径的 file URI 解析为根路径开头', () => {
    const content = JSON.stringify({
      profileAssociations: { workspaces: { 'file:///home/alice/proj': 'p' } },
    });
    expect(parseTraeStorageJson(content)).toEqual(['/home/alice/proj']);
  });

  it('非法 JSON 返回空数组', () => {
    expect(parseTraeStorageJson('{ not json')).toEqual([]);
  });

  it('空对象与区段缺失返回空数组', () => {
    expect(parseTraeStorageJson('{}')).toEqual([]);
    expect(parseTraeStorageJson(JSON.stringify({ windowsState: {} }))).toEqual([]);
  });

  it('忽略非 file URI、非字符串与非法百分号编码', () => {
    const content = JSON.stringify({
      backupWorkspaces: {
        folders: [
          { folderUri: 'vscode-remote://ssh-h/path' },
          { folderUri: 42 },
          { folderUri: 'file:///d%3A/demo/%E4' },
          {},
        ],
      },
    });
    expect(parseTraeStorageJson(content)).toEqual([]);
  });
});

describe('resolveWorkspaceDirs 工作区组装', () => {
  const fs = makeFs([
    '~/projects/Zhihu/.trae/skills/zhihu',
    '~/projects/Demo App/.trae/skills/douyin',
    '~/projects/Super Powers/.trae/skills/brainstorming',
    '~/projects/plain-proj/src',
  ]);

  it('手动根本身是工作区时直接生效', () => {
    const r = resolveWorkspaceDirs({
      manualRoots: ['~/projects/Zhihu/'],
      autoPaths: [],
      disabled: [],
      fs,
    });
    expect(r.dirs.map((d) => d.path)).toEqual(['~/projects/Zhihu']);
    expect(r.dirs[0]?.source).toBe('manual');
    expect(r.truncated).toBe(false);
    expect(r.skipped).toEqual([]);
  });

  it('手动根是父目录时仅展开一级含 .trae/skills 的子目录（根自身也算）', () => {
    const r = resolveWorkspaceDirs({
      manualRoots: ['~/projects'],
      autoPaths: [],
      disabled: [],
      fs,
    });
    expect(r.dirs.map((d) => d.path).sort()).toEqual([
      '~/projects/Demo App',
      '~/projects/Super Powers',
      '~/projects/Zhihu',
    ]);
  });

  it('自动发现的工作区标记 auto，与手动重复时合并且 manual 优先', () => {
    const r = resolveWorkspaceDirs({
      manualRoots: ['D:\\demo\\Zhihu'],
      autoPaths: ['d:/trae/zhihu/', '~/projects/Demo App'],
      disabled: [],
      fs,
    });
    const zhihu = r.dirs.filter((d) => d.path.toLowerCase() === 'd:/trae/zhihu');
    expect(zhihu).toHaveLength(1);
    expect(zhihu[0]?.source).toBe('manual');
    expect(r.dirs.find((d) => d.path === '~/projects/Demo App')?.source).toBe('auto');
  });

  it('被禁用的自动工作区不参与扫描', () => {
    const r = resolveWorkspaceDirs({
      manualRoots: [],
      autoPaths: ['~/projects/Zhihu', '~/projects/Demo App'],
      disabled: ['D:\\demo\\Zhihu\\'],
      fs,
    });
    expect(r.dirs.map((d) => d.path)).toEqual(['~/projects/Demo App']);
  });

  it('不存在的手动根进入 skipped；自动路径不存在静默丢弃；相对路径拒绝', () => {
    const r = resolveWorkspaceDirs({
      manualRoots: ['~/projects/missing', 'relative/path'],
      autoPaths: ['~/projects/ghost'],
      disabled: [],
      fs,
    });
    expect(r.dirs).toEqual([]);
    expect(r.skipped.sort()).toEqual(['~/projects/missing', 'relative/path']);
  });

  it('输出稳定排序：手动在前按路径、自动在后按路径', () => {
    const r = resolveWorkspaceDirs({
      manualRoots: ['~/projects/Super Powers', '~/projects/Zhihu'],
      autoPaths: ['~/projects/Demo App'],
      disabled: [],
      fs,
    });
    expect(r.dirs.map((d) => d.path)).toEqual([
      '~/projects/Super Powers',
      '~/projects/Zhihu',
      '~/projects/Demo App',
    ]);
  });

  it('超上限截断：手动优先保留，truncated 标记', () => {
    const dirs: string[] = [];
    for (let i = 0; i < 5; i++) {
      dirs.push(`d:/auto/p${i}/.trae/skills/s`);
      dirs.push(`d:/man/p${i}/.trae/skills/s`);
    }
    const bigFs = makeFs(dirs);
    const r = resolveWorkspaceDirs({
      manualRoots: ['d:/man/p0', 'd:/man/p1'],
      autoPaths: ['d:/auto/p0', 'd:/auto/p1', 'd:/auto/p2', 'd:/auto/p3', 'd:/auto/p4'],
      disabled: [],
      fs: bigFs,
      maxWorkspaces: 3,
    });
    expect(r.truncated).toBe(true);
    expect(r.dirs.map((d) => d.path)).toEqual(['d:/man/p0', 'd:/man/p1', 'd:/auto/p0']);
  });

  it('realpath 归一：junction 别名合并为同一条', () => {
    const linkFs = makeFs(
      ['c:/real/proj/.trae/skills/s', 'd:/link/proj/.trae/skills/s'],
      { 'd:/link/proj': 'c:/real/proj' },
    );
    const r = resolveWorkspaceDirs({
      manualRoots: ['d:/link/proj'],
      autoPaths: ['c:/real/proj'],
      disabled: [],
      fs: linkFs,
    });
    expect(r.dirs).toHaveLength(1);
    expect(r.dirs[0]?.source).toBe('manual');
  });

  it('默认上限常量为 100', () => {
    expect(MAX_WORKSPACES).toBe(100);
  });
});
