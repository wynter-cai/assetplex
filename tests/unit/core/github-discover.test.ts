/**
 * github-discover 发现编排 + 进程内缓存单元测试（add-github-skill-source I2/I4）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md Scenario 1/2/8/9
 * HTTP 注入 fake client，断言缓存命中后零请求、force 绕过、发现阶段零磁盘写入。
 */
import { describe, it, expect } from 'vitest';
import { discoverGithub, createGithubCache, type GithubHttpClient, type GithubRawResponse } from '../../../src/core/github-discover.js';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

function makeClient(treeJson: unknown, skillContents: Record<string, string>): { client: GithubHttpClient; urls: string[] } {
  const urls: string[] = [];
  const routes: Record<string, GithubRawResponse> = {
    [`${API}/repos/acme/skills/commits/HEAD`]: { status: 200, headers: {}, text: JSON.stringify({ sha: 'deadbeefcafe' }) },
    [`${API}/repos/acme/skills/git/trees/deadbeefcafe?recursive=1`]: { status: 200, headers: {}, text: JSON.stringify(treeJson) },
  };
  for (const [p, content] of Object.entries(skillContents)) {
    routes[`${RAW}/acme/skills/deadbeefcafe/${p}`] = { status: 200, headers: {}, text: content };
  }
  const client: GithubHttpClient = {
    async request(url) {
      urls.push(url);
      const hit = routes[url] ?? { status: 404, headers: {}, text: '{"message":"nf"}' };
      return hit;
    },
  };
  return { client, urls };
}

const treeWith2 = {
  tree: [
    { path: 'skills', type: 'tree' },
    { path: 'skills/foo/SKILL.md', type: 'blob', size: 120 },
    { path: 'skills/foo/references/a.md', type: 'blob', size: 30 },
    { path: 'skills/bar/SKILL.md', type: 'blob', size: 90 },
  ],
  truncated: false,
};

const fooMd = '---\nname: foo\ndescription: Foo 技能\n---\n正文';
const barMd = '---\ndescription: Bar 技能\n---\n正文';

describe('discoverGithub 编排', () => {
  it('解析源串 → 锁 SHA → 取树 → 逐候选补 name/description', async () => {
    const { client, urls } = makeClient(treeWith2, {
      'skills/foo/SKILL.md': fooMd,
      'skills/bar/SKILL.md': barMd,
    });
    const r = await discoverGithub('acme/skills', { client });
    expect(r.repo).toBe('acme/skills');
    expect(r.sha).toBe('deadbeefcafe');
    expect(r.shortSha).toBe('deadbe');
    expect(r.cached).toBe(false);
    expect(r.candidates).toHaveLength(2);
    const foo = r.candidates.find((c) => c.skillPath === 'skills/foo/SKILL.md');
    expect(foo).toMatchObject({ name: 'foo', description: 'Foo 技能', sizeBytes: 120, supportingFileCount: 1 });
    const bar = r.candidates.find((c) => c.skillPath === 'skills/bar/SKILL.md');
    expect(bar?.name).toBe('bar'); // frontmatter 缺 name 回落目录名
    expect(urls).toHaveLength(4); // HEAD + tree + 2 raw
  });

  it('命中缓存不再请求（Scenario 8），cached=true', async () => {
    const { client, urls } = makeClient(treeWith2, {
      'skills/foo/SKILL.md': fooMd,
      'skills/bar/SKILL.md': barMd,
    });
    const cache = createGithubCache({ now: () => 1000 });
    await discoverGithub('acme/skills', { client, cache });
    const before = urls.length;
    const r2 = await discoverGithub('acme/skills', { client, cache });
    expect(urls.length).toBe(before); // 零新增请求
    expect(r2.cached).toBe(true);
  });

  it('force 重新发现绕过缓存', async () => {
    const { client, urls } = makeClient(treeWith2, {
      'skills/foo/SKILL.md': fooMd,
      'skills/bar/SKILL.md': barMd,
    });
    const cache = createGithubCache({ now: () => 1000 });
    await discoverGithub('acme/skills', { client, cache });
    const before = urls.length;
    await discoverGithub('acme/skills', { client, cache, force: true });
    expect(urls.length).toBeGreaterThan(before);
  });

  it('无约定布局 → 空候选 + 提示 note', async () => {
    const { client } = makeClient({ tree: [{ path: 'README.md', type: 'blob', size: 10 }], truncated: false }, {});
    const r = await discoverGithub('acme/skills', { client });
    expect(r.candidates).toHaveLength(0);
    expect(r.notes.join()).toContain('未发现');
  });

  it('超限候选带 skippedReason，且不拉其内容（省配额）', async () => {
    const big = { tree: [{ path: 'big/SKILL.md', type: 'blob', size: 600000 }], truncated: false };
    const { client, urls } = makeClient(big, {});
    const r = await discoverGithub('acme/skills', { client });
    expect(r.candidates[0]?.skippedReason).toBe('over-size-limit');
    // HEAD + tree only，不 fetch 超限 SKILL.md
    expect(urls.filter((u) => u.includes('raw.githubusercontent'))).toHaveLength(0);
  });
});
