/**
 * GitHub 发现编排 + 进程内缓存（add-github-skill-source I2/I4）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md Scenario 1/2/8/9/10
 * 串联 解析源串 → 锁 SHA → 取树 → 识别布局 → 逐候选补 name/description。
 * 决策 D2：进程内缓存 TTL 10 分钟、**不落盘**（发现阶段零磁盘写入）；force 绕过。
 */

import { parseGithubSource } from './github-ref.js';
import { resolveSha, fetchTree, fetchRaw, type GithubHttpClient } from './github-source.js';
import { identifyGithubSkills } from './github-discovery.js';
import { parseFrontmatter } from './skills-inventory.js';

export type { GithubHttpClient, GithubRawResponse } from './github-source.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** 候选技能（内存对象，未确认入库前不落盘、不进盘点） */
export interface GithubCandidate {
  name: string;
  description: string;
  skillPath: string;
  dirPath: string;
  sizeBytes: number;
  supportingFileCount: number;
  skippedReason?: string;
}

export interface DiscoverResult {
  repo: string;
  sha: string;
  shortSha: string;
  candidates: GithubCandidate[];
  notes: string[];
  cached: boolean;
}

export interface GithubCache {
  getResult(key: string): DiscoverResult | undefined;
  setResult(key: string, value: DiscoverResult): void;
  getSha(key: string): string | undefined;
  setSha(key: string, sha: string): void;
}

interface Timed<T> {
  expires: number;
  value: T;
}

/** 进程内 TTL 缓存（不落盘；now 可注入便于测试） */
export function createGithubCache(opts: { now?: () => number; ttlMs?: number } = {}): GithubCache {
  const now = opts.now ?? ((): number => Date.now());
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const results = new Map<string, Timed<DiscoverResult>>();
  const shas = new Map<string, Timed<string>>();
  return {
    getResult(key) {
      const hit = results.get(key);
      if (hit && hit.expires > now()) return hit.value;
      results.delete(key);
      return undefined;
    },
    setResult(key, value) {
      results.set(key, { expires: now() + ttlMs, value });
    },
    getSha(key) {
      const hit = shas.get(key);
      if (hit && hit.expires > now()) return hit.value;
      shas.delete(key);
      return undefined;
    },
    setSha(key, sha) {
      shas.set(key, { expires: now() + ttlMs, value: sha });
    },
  };
}

function dirBasename(dirPath: string): string {
  const parts = dirPath.split('/');
  return parts[parts.length - 1] ?? '';
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export interface DiscoverDeps {
  client: GithubHttpClient;
  cache?: GithubCache;
  /** 重新发现：绕过 ref 解析与结果缓存（Scenario 8） */
  force?: boolean;
}

/**
 * 发现一个 GitHub 源的候选技能集合。
 * @throws GithubRefError 源串非法 / GithubNotFoundError / GithubRateLimitError / GithubNetworkError
 */
export async function discoverGithub(source: string, deps: DiscoverDeps): Promise<DiscoverResult> {
  const { client, cache, force } = deps;
  const spec = parseGithubSource(source);
  const repo = `${spec.owner}/${spec.repo}`;
  const shaKey = `${repo}@${spec.ref ?? ''}`;

  let sha: string | undefined;
  if (cache && !force) sha = cache.getSha(shaKey);
  if (!sha) {
    sha = await resolveSha(client, spec.owner, spec.repo, spec.ref);
    cache?.setSha(shaKey, sha);
  }

  const resultKey = `${repo}@${sha}`;
  if (cache && !force) {
    const hit = cache.getResult(resultKey);
    if (hit) return { ...hit, cached: true };
  }

  const treeResult = await fetchTree(client, spec.owner, spec.repo, sha);
  const identified = identifyGithubSkills({ tree: treeResult.tree, root: spec.subpath ?? '', truncated: treeResult.truncated });

  const candidates: GithubCandidate[] = [];
  for (const located of identified.candidates) {
    let name = dirBasename(located.dirPath);
    let description = '';
    if (!located.skippedReason) {
      const raw = await fetchRaw(client, spec.owner, spec.repo, sha, located.skillPath);
      const { data } = parseFrontmatter(raw);
      name = asString(data.name) || name;
      description = asString(data.description);
    }
    const candidate: GithubCandidate = {
      name: name || 'root',
      description,
      skillPath: located.skillPath,
      dirPath: located.dirPath,
      sizeBytes: located.skillSize,
      supportingFileCount: located.supporting.length,
    };
    if (located.skippedReason) candidate.skippedReason = located.skippedReason;
    candidates.push(candidate);
  }

  const notes = [...identified.notes];
  if (candidates.length === 0) {
    notes.push('未发现符合约定的技能（支持 skills/<name>/SKILL.md 或根 SKILL.md 布局）');
  }

  const result: DiscoverResult = {
    repo,
    sha,
    shortSha: sha.slice(0, 6),
    candidates,
    notes,
    cached: false,
  };
  cache?.setResult(resultKey, result);
  return result;
}
