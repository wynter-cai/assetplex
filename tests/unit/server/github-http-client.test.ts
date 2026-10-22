/**
 * GithubHttpClient Node 实现单元测试（add-github-skill-source K1）
 *
 * 注入 fake fetch：断言 GET 只读、响应 memo 去重省限额、错误不缓存、网络失败抛 GithubNetworkError。
 */
import { describe, it, expect } from 'vitest';
import { createGithubHttpClient } from '../../../src/server/lib/github-http-client.js';
import { GithubNetworkError } from '../../../src/core/github-source.js';

function fakeResponse(status: number, text: string, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: async () => text,
  } as unknown as Response;
}

describe('createGithubHttpClient', () => {
  it('透传 status/headers/text，header key 归一小写', async () => {
    const calls: string[] = [];
    const client = createGithubHttpClient({
      fetchImpl: async (url) => {
        calls.push(url);
        return fakeResponse(200, 'hello', { 'Retry-After': '30', 'Content-Type': 'text/plain' });
      },
    });
    const r = await client.request('https://api.github.com/x');
    expect(calls).toEqual(['https://api.github.com/x']);
    expect(r.status).toBe(200);
    expect(r.text).toBe('hello');
    expect(r.headers['retry-after']).toBe('30');
  });

  it('成功响应 memo 去重：TTL 内二次请求不再打网络', async () => {
    let count = 0;
    let clock = 1000;
    const client = createGithubHttpClient({
      fetchImpl: async () => {
        count += 1;
        return fakeResponse(200, 'v');
      },
      now: () => clock,
      ttlMs: 500,
    });
    await client.request('https://raw/y');
    await client.request('https://raw/y');
    expect(count).toBe(1);
    clock = 2000; // 超过 TTL
    await client.request('https://raw/y');
    expect(count).toBe(2);
  });

  it('错误响应不缓存：每次都重试（限额/未找到需如实透传）', async () => {
    let count = 0;
    const client = createGithubHttpClient({
      fetchImpl: async () => {
        count += 1;
        return fakeResponse(403, 'rate limited');
      },
    });
    await client.request('https://api/z');
    await client.request('https://api/z');
    expect(count).toBe(2);
  });

  it('fetch 抛错 → GithubNetworkError', async () => {
    const client = createGithubHttpClient({
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(client.request('https://api/w')).rejects.toBeInstanceOf(GithubNetworkError);
  });

  it('clearMemo 后强制重新请求', async () => {
    let count = 0;
    const client = createGithubHttpClient({
      fetchImpl: async () => {
        count += 1;
        return fakeResponse(200, 'v');
      },
    });
    await client.request('https://raw/c');
    client.clearMemo();
    await client.request('https://raw/c');
    expect(count).toBe(2);
  });
});
