/**
 * GithubHttpClient 的 Node fetch 实现（add-github-skill-source K1）
 *
 * 只读 GET，匿名访问（不带 token，不产生任何磁盘写入）。进程内 memo：
 * 相同 URL 在 TTL 内复用响应，避免 discover/preview/classify/curate 对同一
 * repo@sha 的 raw 反复请求撞匿名限额。网络层失败抛 GithubNetworkError（路由映 500）。
 */

import { GithubNetworkError, type GithubHttpClient, type GithubRawResponse } from '../../core/github-source.js';

/** 默认响应缓存 TTL（10 分钟，与发现缓存对齐） */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
/** 默认单次请求超时 */
const DEFAULT_TIMEOUT_MS = 20_000;

export interface GithubHttpClientOptions {
  /** 可注入 fetch（测试用）；缺省用全局 fetch */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  /** memo TTL */
  ttlMs?: number;
  /** 时间来源（测试可注入） */
  now?: () => number;
  /** 单次请求超时 */
  timeoutMs?: number;
}

export interface GithubHttpClientWithMemo extends GithubHttpClient {
  /** 清空进程内 memo（「重新发现」等强制刷新场景可选调用） */
  clearMemo(): void;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export function createGithubHttpClient(options: GithubHttpClientOptions = {}): GithubHttpClientWithMemo {
  const doFetch = options.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  const memo = new Map<string, { res: GithubRawResponse; at: number }>();

  return {
    clearMemo(): void {
      memo.clear();
    },
    async request(url: string): Promise<GithubRawResponse> {
      const hit = memo.get(url);
      if (hit !== undefined && now() - hit.at <= ttlMs) return hit.res;

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'assetplex', Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new GithubNetworkError(err instanceof Error ? err.message : String(err));
      }

      const text = await res.text().catch(() => '');
      const out: GithubRawResponse = { status: res.status, headers: headersToRecord(res.headers), text };
      // 仅缓存成功响应：错误（404/403/429/5xx）不缓存，保证重试与限额提示如实
      if (res.ok) memo.set(url, { res: out, at: now() });
      return out;
    },
  };
}
