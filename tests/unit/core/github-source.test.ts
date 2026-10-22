/**
 * github-source REST 客户端单元测试（add-github-skill-source I1）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md
 * HTTP 一律注入 fake client，单测不碰网络。覆盖：ref→SHA、取树、raw 按 SHA、错误分类。
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSha,
  fetchTree,
  fetchRaw,
  GithubNotFoundError,
  GithubRateLimitError,
  GithubNetworkError,
  type GithubHttpClient,
  type GithubRawResponse,
} from '../../../src/core/github-source.js';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** 按 URL 前缀路由的 fake client；记录被请求的 URL 序列 */
function fakeClient(
  routes: Record<string, Partial<GithubRawResponse> | (() => GithubRawResponse)>,
): { client: GithubHttpClient; urls: string[] } {
  const urls: string[] = [];
  const client: GithubHttpClient = {
    async request(url: string): Promise<GithubRawResponse> {
      urls.push(url);
      const hit = routes[url] ?? { status: 404, text: '{"message":"Not Found"}' };
      const resolved = typeof hit === 'function' ? hit() : hit;
      return { status: resolved.status ?? 200, headers: resolved.headers ?? {}, text: resolved.text ?? '' };
    },
  };
  return { client, urls };
}

const json = (obj: unknown): string => JSON.stringify(obj);

describe('resolveSha ref → commit SHA', () => {
  it('显式 ref（分支/tag）走 commits/{ref}', async () => {
    const { client, urls } = fakeClient({
      [`${API}/repos/acme/skills/commits/v1.2.0`]: { status: 200, text: json({ sha: 'deadbeef' }) },
    });
    await expect(resolveSha(client, 'acme', 'skills', 'v1.2.0')).resolves.toBe('deadbeef');
    expect(urls).toEqual([`${API}/repos/acme/skills/commits/v1.2.0`]);
  });

  it('ref 缺省用 HEAD（默认分支，单请求省配额）', async () => {
    const { client, urls } = fakeClient({
      [`${API}/repos/acme/skills/commits/HEAD`]: { status: 200, text: json({ sha: 'cafe0000' }) },
    });
    await expect(resolveSha(client, 'acme', 'skills', undefined)).resolves.toBe('cafe0000');
    expect(urls[0]).toContain('/commits/HEAD');
  });

  it('仓库不存在（404）→ GithubNotFoundError', async () => {
    const { client } = fakeClient({});
    await expect(resolveSha(client, 'acme', 'nope', 'main')).rejects.toBeInstanceOf(GithubNotFoundError);
  });

  it('私有/401 → GithubNotFoundError（不区分私有原因）', async () => {
    const { client } = fakeClient({
      [`${API}/repos/acme/priv/commits/main`]: { status: 401, text: '{}' },
    });
    await expect(resolveSha(client, 'acme', 'priv', 'main')).rejects.toBeInstanceOf(GithubNotFoundError);
  });
});

describe('fetchTree 一次递归取树', () => {
  it('按锁定 SHA 请求 recursive 树', async () => {
    const { client, urls } = fakeClient({
      [`${API}/repos/acme/skills/git/trees/deadbeef?recursive=1`]: {
        status: 200,
        text: json({ tree: [{ path: 'skills/foo/SKILL.md', type: 'blob', size: 120 }], truncated: false }),
      },
    });
    const result = await fetchTree(client, 'acme', 'skills', 'deadbeef');
    expect(result.truncated).toBe(false);
    expect(result.tree).toHaveLength(1);
    expect(urls[0]).toContain('/git/trees/deadbeef?recursive=1');
  });
});

describe('fetchRaw 按 SHA 锁版取内容（红线 2）', () => {
  it('raw URL 含 commit SHA（不用分支名，防上游移动）', async () => {
    const { client, urls } = fakeClient({
      [`${RAW}/acme/skills/deadbeef/skills/foo/SKILL.md`]: { status: 200, text: '# foo skill' },
    });
    await expect(fetchRaw(client, 'acme', 'skills', 'deadbeef', 'skills/foo/SKILL.md')).resolves.toBe('# foo skill');
    expect(urls).toEqual([`${RAW}/acme/skills/deadbeef/skills/foo/SKILL.md`]);
  });
});

describe('限额与网络错误分类（Scenario 6 / 5）', () => {
  it('403 rate limit + retry-after 头 → GithubRateLimitError 含分钟数', async () => {
    const { client } = fakeClient({
      [`${API}/repos/acme/skills/commits/main`]: {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'retry-after': '120' },
        text: '{"message":"rate limit"}',
      },
    });
    let err: unknown;
    try {
      await resolveSha(client, 'acme', 'skills', 'main');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(GithubRateLimitError);
    if (err instanceof GithubRateLimitError) expect(err.retryAfterMinutes).toBe(2);
  });

  it('429 → GithubRateLimitError', async () => {
    const { client } = fakeClient({
      [`${API}/repos/acme/skills/commits/main`]: { status: 429, headers: {}, text: '' },
    });
    await expect(resolveSha(client, 'acme', 'skills', 'main')).rejects.toBeInstanceOf(GithubRateLimitError);
  });

  it('底层请求抛错（网络层）→ GithubNetworkError', async () => {
    const client: GithubHttpClient = {
      async request(): Promise<GithubRawResponse> {
        throw new Error('ECONNREFUSED');
      },
    };
    await expect(resolveSha(client, 'acme', 'skills', 'main')).rejects.toBeInstanceOf(GithubNetworkError);
  });
});
