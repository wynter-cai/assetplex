/**
 * github-classify：GitHub 候选技能 AI 打标（add-github-skill-source K2）
 *
 * 对 repo@sha 下的候选逐条 fetchRaw SKILL.md → 内容 sha256 命中缓存则复用（不调模型）→
 * 否则调用 LlmClient 按九职能归类并写回同一份内容哈希缓存（与盘点分类共用 store）。
 * 手动触发；未配置 AI 端点：classify 抛 AiConfigIncompleteError、estimate 报 willCall=0，二者均不发请求。
 * 单条失败隔离，只进 CandidateTag.error，不中断批量。core 不 import fs，网络走注入 GithubHttpClient。
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/curation-tagging.spec.md Scenario 1-4/6
 */

import { fetchRaw, type GithubHttpClient } from './github-source.js';
import {
  buildClassifyPrompt,
  parseCategoryOutput,
  AiConfigIncompleteError,
  type LlmClient,
} from './skill-ai-classification.js';
import {
  hashSkillContent,
  getCachedByHash,
  saveCacheEntry,
  type AiClassifyCacheStore,
} from './skill-ai-cache.js';
import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import { parseFrontmatter, type SkillFunction } from './skills-inventory.js';

/** 单条打标结果（成功为九职能之一，失败 function=null 并填 error） */
export interface GithubCandidateTag {
  skillPath: string;
  function: SkillFunction | null;
  /** 命中内容哈希缓存、未实际调模型 */
  cached: boolean;
  error?: string;
}

export interface ClassifyGithubInput {
  repo: string;
  sha: string;
  skillPaths: string[];
}

export interface ClassifyGithubDeps {
  client: GithubHttpClient;
  cache: AiClassifyCacheStore;
  llm: LlmClient;
  config?: AiClassifyConfig;
  now?: () => string;
  concurrency?: number;
}

export interface ClassifyGithubResult {
  tags: GithubCandidateTag[];
  /** 实际调用模型的次数（缓存命中不计） */
  called: number;
}

export interface ClassifyGithubEstimate {
  total: number;
  cacheHits: number;
  willCall: number;
  aiConfigured: boolean;
}

export interface EstimateGithubDeps {
  client: GithubHttpClient;
  cache: AiClassifyCacheStore;
  config?: AiClassifyConfig;
}

function splitRepo(repo: string): { owner: string; name: string } {
  const idx = repo.indexOf('/');
  return { owner: repo.slice(0, idx), name: repo.slice(idx + 1) };
}

/** 简单并发池：worker 永不 reject（内部已捕获），保持结果顺序 */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

/**
 * 对候选逐条打标（部分成功语义）。
 * @throws AiConfigIncompleteError 配置缺失时（不发起任何网络/模型调用）
 */
export async function classifyGithubCandidates(
  input: ClassifyGithubInput,
  deps: ClassifyGithubDeps,
): Promise<ClassifyGithubResult> {
  if (!deps.config || !isAiConfigComplete(deps.config)) {
    throw new AiConfigIncompleteError();
  }
  const { owner, name } = splitRepo(input.repo);
  const { system } = buildClassifyPrompt({ name: '', description: '', rawContent: '' });
  const now = deps.now ?? (() => new Date().toISOString());
  const model = deps.config.model;

  const tags: GithubCandidateTag[] = input.skillPaths.map((p) => ({ skillPath: p, function: null, cached: false }));
  let called = 0;

  await runPool(input.skillPaths.map((skillPath, i) => ({ skillPath, i })), deps.concurrency ?? 4, async ({ skillPath, i }) => {
    try {
      const raw = await fetchRaw(deps.client, owner, name, input.sha, skillPath);
      const hash = hashSkillContent(raw);
      const cached = getCachedByHash(deps.cache, hash);
      if (cached) {
        tags[i] = { skillPath, function: cached.category, cached: true };
        return;
      }
      const fm = parseFrontmatter(raw);
      const { user } = buildClassifyPrompt({
        name: fm.data.name ?? skillPath,
        description: fm.data.description ?? '',
        rawContent: raw,
      });
      const output = await deps.llm.chat({ system, user });
      const category = parseCategoryOutput(output);
      saveCacheEntry(deps.cache, hash, { category, model, classifiedAt: now() });
      called += 1;
      tags[i] = { skillPath, function: category, cached: false };
    } catch (err) {
      tags[i] = { skillPath, function: null, cached: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  return { tags, called };
}

/**
 * 打标预算披露：已配置时逐条 fetchRaw 算内容哈希比对缓存，报 willCall=total-cacheHits；
 * 未配置时 willCall=0 且不发起任何请求（Scenario 2/6）。
 */
export async function estimateGithubClassification(
  input: ClassifyGithubInput,
  deps: EstimateGithubDeps,
): Promise<ClassifyGithubEstimate> {
  const aiConfigured = deps.config !== undefined && isAiConfigComplete(deps.config);
  const total = input.skillPaths.length;
  if (!aiConfigured) {
    return { total, cacheHits: 0, willCall: 0, aiConfigured: false };
  }
  const { owner, name } = splitRepo(input.repo);
  let cacheHits = 0;
  for (const skillPath of input.skillPaths) {
    try {
      const raw = await fetchRaw(deps.client, owner, name, input.sha, skillPath);
      if (getCachedByHash(deps.cache, hashSkillContent(raw))) cacheHits += 1;
    } catch {
      // 单条拉取失败不计入缓存命中，保守按 willCall 处理
    }
  }
  return { total, cacheHits, willCall: total - cacheHits, aiConfigured: true };
}
