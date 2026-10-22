/**
 * GitHub REST 拉取客户端（纯逻辑，HTTP 经依赖注入，单测不碰网络）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md
 * 决策：D1 REST + 锁 commit SHA（raw 按 SHA 取，防上游移动）；D2 匿名限额、进程内缓存不落盘。
 * Node 具体 fetch 实现见 src/server/lib/github-http-client.ts（core 只依赖 GithubHttpClient 接口）。
 */

/** 单次 GET 的原始响应（core 层不解析 status，交由本模块分类） */
export interface GithubRawResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

/** HTTP 客户端抽象（Node 实现走 global fetch；测试注入 fake） */
export interface GithubHttpClient {
  request(url: string): Promise<GithubRawResponse>;
}

const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

/** 仓库不存在 / 私有不可公开访问（404/401，不区分私有原因，Scenario 5） */
export class GithubNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GithubNotFoundError';
  }
}

/** 匿名限额命中（403/429，Scenario 6） */
export class GithubRateLimitError extends Error {
  readonly retryAfterMinutes: number;
  constructor(retryAfterMinutes: number) {
    super('GitHub 匿名请求限额已用完');
    this.name = 'GithubRateLimitError';
    this.retryAfterMinutes = retryAfterMinutes;
  }
}

/** 网络层失败（Scenario 5），不重试以外无后台行为 */
export class GithubNetworkError extends Error {
  constructor(message: string) {
    super(`无法连接 GitHub：${message}`);
    this.name = 'GithubNetworkError';
  }
}

function header(headers: Record<string, string>, key: string): string | undefined {
  return headers[key] ?? headers[key.toLowerCase()];
}

/** 从限流头估算重试分钟数：优先 retry-after（秒），否则按 remaining=0 给保守 15 分钟 */
function estimateRetryMinutes(headers: Record<string, string>): number {
  const retryAfter = header(headers, 'retry-after');
  if (retryAfter) {
    const secs = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(secs) && secs > 0) return Math.max(1, Math.ceil(secs / 60));
  }
  return 15;
}

/** 发请求并把底层异常归一为 GithubNetworkError */
async function safeRequest(client: GithubHttpClient, url: string): Promise<GithubRawResponse> {
  try {
    return await client.request(url);
  } catch (err) {
    throw new GithubNetworkError(err instanceof Error ? err.message : String(err));
  }
}

/** 状态码 → 错误分类；2xx 返回响应本身 */
function classify(res: GithubRawResponse, what: string): GithubRawResponse {
  if (res.status >= 200 && res.status < 300) return res;
  if (res.status === 403 || res.status === 429) {
    throw new GithubRateLimitError(estimateRetryMinutes(res.headers));
  }
  if (res.status === 404 || res.status === 401) {
    throw new GithubNotFoundError(`${what}：仓库不存在或不可公开访问`);
  }
  throw new GithubNetworkError(`${what}：GitHub 返回 ${res.status}`);
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** ref（分支/tag/短 SHA/undefined=HEAD）→ 具体 commit SHA（Scenario 3，锁版依据） */
export async function resolveSha(
  client: GithubHttpClient,
  owner: string,
  repo: string,
  ref: string | undefined,
): Promise<string> {
  const url = `${API_BASE}/repos/${owner}/${repo}/commits/${ref ?? 'HEAD'}`;
  const res = classify(await safeRequest(client, url), '解析版本');
  const sha = res.text ? parseJson(res.text).sha : undefined;
  if (typeof sha !== 'string' || sha === '') {
    throw new GithubNetworkError('解析版本：响应缺少 commit SHA');
  }
  return sha;
}

export interface GithubTreeEntry {
  path: string;
  type: string; // blob | tree
  size?: number;
}

export interface GithubTreeResult {
  tree: GithubTreeEntry[];
  /** 超大仓库 recursive 树被 GitHub 截断（Scenario 7 / 风险预留） */
  truncated: boolean;
}

/** 按锁定 SHA 一次递归取树（Scenario 7：免逐目录遍历烧配额） */
export async function fetchTree(
  client: GithubHttpClient,
  owner: string,
  repo: string,
  sha: string,
): Promise<GithubTreeResult> {
  const url = `${API_BASE}/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
  const res = classify(await safeRequest(client, url), '读取目录树');
  const data = parseJson(res.text);
  const rawTree = Array.isArray(data.tree) ? data.tree : [];
  const tree: GithubTreeEntry[] = rawTree
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map((e) => ({
      path: typeof e.path === 'string' ? e.path : '',
      type: typeof e.type === 'string' ? e.type : 'blob',
      size: typeof e.size === 'number' ? e.size : undefined,
    }))
    .filter((e) => e.path !== '');
  return { tree, truncated: data.truncated === true };
}

/** 按锁定 SHA 取 raw 文本内容（红线 2：URL 用 SHA 不用分支名） */
export async function fetchRaw(
  client: GithubHttpClient,
  owner: string,
  repo: string,
  sha: string,
  path: string,
): Promise<string> {
  const url = `${RAW_BASE}/${owner}/${repo}/${sha}/${path}`;
  const res = classify(await safeRequest(client, url), '读取文件');
  return res.text;
}
