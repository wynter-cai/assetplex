/**
 * 技能主副本最近更新时间（refactor-skill-catalog T2）
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1.5）
 * 约束：mtime 只经注入的 SkillFs.dirMtime 读取；读不到返回 null，禁止用当前时间兜底。
 */
import { describe, it, expect } from 'vitest';
import {
  discoverSkillFiles,
  dedupeSkills,
  listSkills,
  type SkillFs,
  type SkillFunction,
  type SkillSources,
  type SkillOverrideStore,
} from '../../../src/core/skills-inventory.js';
import { toApiSkill } from '../../../src/server/lib/skill-api.js';

const SOURCES: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/demo/.trae-cn/skills',
  builtinRoot: '/home/demo/.trae-cn/builtin',
  builtinSkillsDir: '/home/demo/.trae-cn/builtin_skills',
  pluginsRoot: '/home/demo/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/demo/.codebuddy/skills-marketplace/skills',
  workspaceDirs: [],
};

const SKILL = (name: string): string => `---\nname: ${name}\ndescription: 示例技能\n---\n# ${name}\n`;

interface FakeFs extends SkillFs {
  readonly files: Record<string, string>;
  readonly mtimes: Record<string, string>;
}

/** 内存文件系统：目录由文件路径推导，mtime 由调用方显式给出 */
function makeFs(files: Record<string, string>, mtimes: Record<string, string> = {}): FakeFs {
  const dirs = new Set<string>();
  for (const f of Object.keys(files)) {
    const parts = f.split('/');
    let cur = '';
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === '') {
        cur = '/';
        continue;
      }
      cur = cur === '/' ? `/${parts[i]}` : `${cur}/${parts[i]}`;
      dirs.add(cur);
    }
  }
  return {
    files,
    mtimes,
    read: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    listDir: (p) =>
      dirs.has(p)
        ? Array.from(dirs)
            .filter((d) => d.startsWith(`${p}/`) && !d.slice(p.length + 1).includes('/'))
            .map((d) => d.slice(p.length + 1))
            .sort()
        : [],
    dirMtime: (p) => mtimes[p] ?? null,
  };
}

class MemoryStore implements SkillOverrideStore {
  data: Record<string, SkillFunction> = {};
  load(): Record<string, SkillFunction> {
    return { ...this.data };
  }
  save(map: Record<string, SkillFunction>): void {
    this.data = { ...map };
  }
}

describe('SkillInfo.lastModifiedAt（主副本 mtime）', () => {
  it('可读时透传 SkillFs.dirMtime 的 ISO 时间', () => {
    const primary = `${SOURCES.userSkillsDir}/demo-a/SKILL.md`;
    const fs = makeFs({ [primary]: SKILL('demo-a') }, { [primary]: '2026-11-02T03:04:05.000Z' });

    const [skill] = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});

    expect(skill.lastModifiedAt).toBe('2026-11-02T03:04:05.000Z');
  });

  it('读不到时为 null，不伪造当前时间', () => {
    const fs = makeFs({ [`${SOURCES.userSkillsDir}/demo-a/SKILL.md`]: SKILL('demo-a') });

    const [skill] = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});

    expect(skill.lastModifiedAt).toBeNull();
  });

  it('同名多副本取主副本（vault 优先）的 mtime', () => {
    const vaultCopy = `${SOURCES.vaultSkillsDir}/demo-a/SKILL.md`;
    const userCopy = `${SOURCES.userSkillsDir}/demo-a/SKILL.md`;
    const fs = makeFs(
      { [vaultCopy]: SKILL('demo-a'), [userCopy]: SKILL('demo-a') },
      { [vaultCopy]: '2026-11-09T00:00:00.000Z', [userCopy]: '2026-01-01T00:00:00.000Z' },
    );

    const [skill] = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});

    expect(skill.sourcePath).toBe(vaultCopy);
    expect(skill.lastModifiedAt).toBe('2026-11-09T00:00:00.000Z');
  });

  it('来源目录不存在时零条目不报错', () => {
    const fs = makeFs({});
    const result = listSkills({ fs, sources: SOURCES, store: new MemoryStore() });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('API 投影携带 lastModifiedAt（null 保持 null）', () => {
    const fs = makeFs(
      {
        [`${SOURCES.userSkillsDir}/demo-a/SKILL.md`]: SKILL('demo-a'),
        [`${SOURCES.userSkillsDir}/demo-b/SKILL.md`]: SKILL('demo-b'),
      },
      { [`${SOURCES.userSkillsDir}/demo-a/SKILL.md`]: '2026-11-03T00:00:00.000Z' },
    );

    const result = listSkills({ fs, sources: SOURCES, store: new MemoryStore() });
    const api = result.items.map(toApiSkill);

    expect(api.find((s) => s.id === 'demo-a')?.lastModifiedAt).toBe('2026-11-03T00:00:00.000Z');
    expect(api.find((s) => s.id === 'demo-b')?.lastModifiedAt).toBeNull();
  });
});
