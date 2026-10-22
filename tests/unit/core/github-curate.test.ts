/**
 * github-curate 确认入库链路单元测试（add-github-skill-source J1/J2）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/preview-curate.spec.md Scenario 2-5/8/9
 * 纯逻辑：内存 SkillWriteFs + fake GithubHttpClient 注入；断言零工具目录写入、覆盖备份、部分成功。
 */
import { describe, it, expect } from 'vitest';
import { curateGithubSkills, previewGithubSkill } from '../../../src/core/github-curate.js';
import { listSkills } from '../../../src/core/skills-inventory.js';
import type { SkillWriteFs } from '../../../src/core/skill-write.js';
import type { SkillSources, SkillOverrideStore, SkillFunction } from '../../../src/core/skills-inventory.js';
import type { GithubHttpClient, GithubRawResponse } from '../../../src/core/github-source.js';

class MemoryWriteFs implements SkillWriteFs {
  files = new Map<string, string>();
  read(p: string): string | null {
    return this.files.get(p) ?? null;
  }
  listDir(p: string): string[] {
    const base = p.replace(/\/+$/, '');
    const names = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(`${base}/`)) {
        const seg = key.slice(base.length + 1).split('/')[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  }
  dirMtime(): string | null {
    return null;
  }
  exists(p: string): boolean {
    return this.files.has(p);
  }
  ensureDir(): void {}
  writeFile(p: string, c: string): void {
    this.files.set(p, c);
  }
  removeDir(p: string): void {
    const prefix = `${p.replace(/\/+$/, '')}/`;
    for (const k of [...this.files.keys()]) if (k.startsWith(prefix)) this.files.delete(k);
  }
}

class MemoryStore implements SkillOverrideStore {
  data: Record<string, SkillFunction> = {};
  load(): Record<string, SkillFunction> {
    return { ...this.data };
  }
  save(m: Record<string, SkillFunction>): void {
    this.data = { ...m };
  }
}

const SOURCES: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/u/.trae-cn/skills',
  builtinRoot: '/home/u/.trae-cn/builtin',
  builtinSkillsDir: '/home/u/.trae-cn/builtin_skills',
  pluginsRoot: '/home/u/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/u/.codebuddy/skills-marketplace/skills',
  workspaceDirs: [],
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const REPO = 'acme/skills';
const SHA = 'deadbeefcafe';
const TREE = `${API}/repos/acme/skills/git/trees/${SHA}?recursive=1`;

function rawUrl(path: string): string {
  return `${RAW}/acme/skills/${SHA}/${path}`;
}

function makeClient(
  tree: unknown,
  contents: Record<string, string>,
): { client: GithubHttpClient; requested: string[] } {
  const requested: string[] = [];
  const routes: Record<string, GithubRawResponse> = {
    [TREE]: { status: 200, headers: {}, text: JSON.stringify(tree) },
  };
  for (const [p, c] of Object.entries(contents)) routes[rawUrl(p)] = { status: 200, headers: {}, text: c };
  const client: GithubHttpClient = {
    async request(url) {
      requested.push(url);
      return routes[url] ?? { status: 404, headers: {}, text: '{}' };
    },
  };
  return { client, requested };
}

const treeFoo = {
  tree: [
    { path: 'skills', type: 'tree' },
    { path: 'skills/foo/SKILL.md', type: 'blob', size: 120 },
    { path: 'skills/foo/references/a.md', type: 'blob', size: 30 },
    { path: 'skills/foo/logo.png', type: 'blob', size: 9999 },
  ],
  truncated: false,
};
const fooMd = '---\nname: foo\ndescription: Foo 技能\n---\n\n这是正文内容';

function deps(fs: MemoryWriteFs, client: GithubHttpClient, backup: (abs: string) => string = () => 'bk-1') {
  return { fs, sources: SOURCES, store: new MemoryStore(), client, backup };
}

describe('curateGithubSkills 新建入库（Scenario 4）', () => {
  it('写整目录：SKILL.md 溯源串 + 附属文本文件，二进制跳过，不碰工具目录', async () => {
    const fs = new MemoryWriteFs();
    const { client } = makeClient(treeFoo, {
      'skills/foo/SKILL.md': fooMd,
      'skills/foo/references/a.md': '参考资料 A',
      'skills/foo/logo.png': '‰PNG‰binary',
    });
    const r = await curateGithubSkills(
      { repo: REPO, sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md' }] },
      deps(fs, client),
    );
    expect(r.created.map((s) => s.id)).toEqual(['foo']);
    expect(r.skipped).toHaveLength(0);
    expect(r.failed).toHaveLength(0);
    expect(r.suggestDoctor).toBe(true);
    const skillMd = fs.files.get('/hub/skills/foo/SKILL.md') ?? '';
    expect(skillMd).toContain('name: foo');
    expect(skillMd).toContain('source: github:acme/skills@deadbeefcafe:skills/foo/SKILL.md');
    expect(skillMd).toContain('这是正文内容');
    expect(fs.files.get('/hub/skills/foo/references/a.md')).toBe('参考资料 A');
    expect(fs.files.has('/hub/skills/foo/logo.png')).toBe(false); // 二进制跳过
  });

  it('盘点归属：origin=vault、provenance 由 source 推导为 github（Scenario 7）', async () => {
    const fs = new MemoryWriteFs();
    const { client } = makeClient(treeFoo, { 'skills/foo/SKILL.md': fooMd, 'skills/foo/references/a.md': 'A' });
    await curateGithubSkills({ repo: REPO, sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md' }] }, deps(fs, client));
    const inv = listSkills({ fs, sources: SOURCES, store: new MemoryStore() });
    const foo = inv.items.find((s) => s.id === 'foo');
    expect(foo?.origin).toBe('vault');
    expect(foo?.source).toBe('github:acme/skills@deadbeefcafe:skills/foo/SKILL.md');
  });

  it('items 为空 → 抛 400', async () => {
    const fs = new MemoryWriteFs();
    const { client } = makeClient(treeFoo, {});
    await expect(curateGithubSkills({ repo: REPO, sha: SHA, items: [] }, deps(fs, client))).rejects.toThrow(/不能为空/);
  });
});

describe('同名冲突：默认跳过 / 可覆盖 / 非库冲突（Scenario 3）', () => {
  function seedVault(fs: MemoryWriteFs, name: string, body: string): void {
    fs.files.set(`/hub/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: 旧版\n---\n\n${body}`);
  }

  it('库内同名默认 skip，不写不改', async () => {
    const fs = new MemoryWriteFs();
    seedVault(fs, 'foo', '旧内容');
    const { client, requested } = makeClient(treeFoo, { 'skills/foo/SKILL.md': fooMd });
    const r = await curateGithubSkills({ repo: REPO, sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md' }] }, deps(fs, client));
    expect(r.skipped).toEqual([{ skillPath: 'skills/foo/SKILL.md', name: 'foo' }]);
    expect(r.created).toHaveLength(0);
    expect(fs.files.get('/hub/skills/foo/SKILL.md')).toContain('旧内容');
    expect(requested.some((u) => u.startsWith(RAW))).toBe(false); // skip 不拉内容
  });

  it('overwrite：先备份旧 SKILL.md 再覆盖，回报 backupRef', async () => {
    const fs = new MemoryWriteFs();
    seedVault(fs, 'foo', '旧内容');
    const backups: string[] = [];
    const { client } = makeClient(treeFoo, { 'skills/foo/SKILL.md': fooMd });
    const r = await curateGithubSkills(
      { repo: REPO, sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md', action: 'overwrite' }] },
      deps(fs, client, (abs) => {
        backups.push(abs);
        return 'bk-42';
      }),
    );
    expect(r.created.map((s) => s.id)).toEqual(['foo']);
    expect(r.backupRefs).toEqual(['bk-42']);
    expect(backups).toEqual(['/hub/skills/foo/SKILL.md']);
    expect(fs.files.get('/hub/skills/foo/SKILL.md')).toContain('这是正文内容');
  });

  it('非库同名（如工具技能）冲突 → failed 请改名', async () => {
    const fs = new MemoryWriteFs();
    fs.files.set('/home/u/.trae-cn/skills/foo/SKILL.md', '---\nname: foo\ndescription: 个人\n---\n正文');
    const { client } = makeClient(treeFoo, { 'skills/foo/SKILL.md': fooMd });
    const r = await curateGithubSkills({ repo: REPO, sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md' }] }, deps(fs, client));
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]?.error).toContain('请改名');
  });

  it('改名入库（Scenario 9）：目标名生效，source 仍记原 skillPath', async () => {
    const fs = new MemoryWriteFs();
    const { client } = makeClient(treeFoo, { 'skills/foo/SKILL.md': fooMd });
    const r = await curateGithubSkills(
      { repo: REPO, sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md', name: 'renamed-foo' }] },
      deps(fs, client),
    );
    expect(r.created.map((s) => s.id)).toEqual(['renamed-foo']);
    expect(fs.files.get('/hub/skills/renamed-foo/SKILL.md')).toContain('source: github:acme/skills@deadbeefcafe:skills/foo/SKILL.md');
  });
});

describe('批量部分成功（Scenario 5）', () => {
  it('一条成功一条候选不存在，成功不回滚', async () => {
    const fs = new MemoryWriteFs();
    const { client } = makeClient(treeFoo, { 'skills/foo/SKILL.md': fooMd });
    const r = await curateGithubSkills(
      { repo: REPO, sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md' }, { skillPath: 'skills/ghost/SKILL.md' }] },
      deps(fs, client),
    );
    expect(r.created.map((s) => s.id)).toEqual(['foo']);
    expect(r.failed.map((f) => f.skillPath)).toEqual(['skills/ghost/SKILL.md']);
  });
});

describe('previewGithubSkill 全文预览零落盘（Scenario 1）', () => {
  it('返回正文+附属清单，binary 标注，且不写 fs', async () => {
    const fs = new MemoryWriteFs();
    const { client } = makeClient(treeFoo, {
      'skills/foo/SKILL.md': fooMd,
      'skills/foo/references/a.md': 'A',
      'skills/foo/logo.png': 'x',
    });
    const p = await previewGithubSkill({ repo: REPO, sha: SHA, skillPath: 'skills/foo/SKILL.md' }, { fs, sources: SOURCES, store: new MemoryStore(), client });
    expect(p.content).toContain('这是正文内容');
    expect(p.name).toBe('foo');
    expect(p.supportingFiles.find((f) => f.path === 'skills/foo/logo.png')?.binary).toBe(true);
    expect(fs.files.size).toBe(0); // 预览零写入
  });
});
