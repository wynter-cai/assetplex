/**
 * github-classify 候选打标单元测试（add-github-skill-source K2）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/curation-tagging.spec.md Scenario 1-4/6
 * 纯逻辑：fake GithubHttpClient + fake LlmClient + 内存 AiClassifyCacheStore 注入，单测不碰网络。
 */
import { describe, it, expect } from 'vitest';
import {
  classifyGithubCandidates,
  estimateGithubClassification,
} from '../../../src/core/github-classify.js';
import { AiConfigIncompleteError } from '../../../src/core/skill-ai-classification.js';
import { hashSkillContent, type AiClassifyCacheStore, type AiClassifyCacheEntry } from '../../../src/core/skill-ai-cache.js';
import type { GithubHttpClient, GithubRawResponse } from '../../../src/core/github-source.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';

const RAW = 'https://raw.githubusercontent.com';
const CFG: AiClassifyConfig = { baseUrl: 'https://llm.test/v1', apiKey: 'k', model: 'm' };

class MemoryCache implements AiClassifyCacheStore {
  data: Record<string, AiClassifyCacheEntry> = {};
  load(): Record<string, AiClassifyCacheEntry> {
    return { ...this.data };
  }
  save(entries: Record<string, AiClassifyCacheEntry>): void {
    this.data = { ...entries };
  }
}

const SKILL_A = '---\nname: a\ndescription: 写代码相关\n---\n\nfunction main(){}';
const SKILL_B = '---\nname: b\ndescription: 部署上线流程\n---\n\nkubectl apply';

function clientFor(contents: Record<string, string>): { client: GithubHttpClient; urls: string[] } {
  const urls: string[] = [];
  const routes: Record<string, GithubRawResponse> = {};
  for (const [p, c] of Object.entries(contents)) routes[`${RAW}/acme/skills/dead/${p}`] = { status: 200, headers: {}, text: c };
  return {
    client: {
      async request(url) {
        urls.push(url);
        return routes[url] ?? { status: 404, headers: {}, text: '' };
      },
    },
    urls,
  };
}

function makeLlm(outputs: Record<string, string>) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    chat: async ({ user }: { system: string; user: string }) => {
      calls += 1;
      const nameLine = /^技能名：(.*)$/m.exec(user)?.[1]?.trim() ?? '';
      const out = outputs[nameLine];
      if (out === undefined) throw new Error('no output');
      return out;
    },
  };
}

void 0;

describe('classifyGithubCandidates（Scenario 1/3/4）', () => {
  it('逐条打标并写内容缓存；成功九职能闭集', async () => {
    const cache = new MemoryCache();
    const { client } = clientFor({ 'skills/a/SKILL.md': SKILL_A, 'skills/b/SKILL.md': SKILL_B });
    const llm = makeLlm({ a: '{"category":"coding"}', b: '{"category":"devops"}' });
    const r = await classifyGithubCandidates(
      { repo: 'acme/skills', sha: 'dead', skillPaths: ['skills/a/SKILL.md', 'skills/b/SKILL.md'] },
      { client, cache, llm, config: CFG, now: () => '2026-01-01T00:00:00Z' },
    );
    expect(r.called).toBe(2);
    expect(llm.calls).toBe(2);
    expect(r.tags.find((t) => t.skillPath === 'skills/a/SKILL.md')?.function).toBe('coding');
    expect(r.tags.find((t) => t.skillPath === 'skills/b/SKILL.md')?.function).toBe('devops');
    expect(cache.data[hashSkillContent(SKILL_A)]?.category).toBe('coding');
    expect(cache.data[hashSkillContent(SKILL_B)]?.category).toBe('devops');
  });

  it('内容哈希命中缓存：不调 LLM，cached=true（Scenario 4）', async () => {
    const cache = new MemoryCache();
    cache.data[hashSkillContent(SKILL_A)] = { category: 'coding', model: 'm', classifiedAt: 'x' };
    const { client } = clientFor({ 'skills/a/SKILL.md': SKILL_A });
    const llm = makeLlm({});
    const r = await classifyGithubCandidates(
      { repo: 'acme/skills', sha: 'dead', skillPaths: ['skills/a/SKILL.md'] },
      { client, cache, llm, config: CFG },
    );
    expect(r.tags[0]?.cached).toBe(true);
    expect(r.tags[0]?.function).toBe('coding');
    expect(r.called).toBe(0);
    expect(llm.calls).toBe(0);
  });

  it('单条失败隔离：非法输出进 error，不影响其他（Scenario 3）', async () => {
    const cache = new MemoryCache();
    const { client } = clientFor({ 'skills/a/SKILL.md': SKILL_A, 'skills/b/SKILL.md': SKILL_B });
    const llm = makeLlm({ a: 'garbage-not-json', b: '{"category":"devops"}' });
    const r = await classifyGithubCandidates(
      { repo: 'acme/skills', sha: 'dead', skillPaths: ['skills/a/SKILL.md', 'skills/b/SKILL.md'] },
      { client, cache, llm, config: CFG },
    );
    const a = r.tags.find((t) => t.skillPath === 'skills/a/SKILL.md');
    expect(a?.function).toBeNull();
    expect(a?.error).toBeTruthy();
    expect(r.tags.find((t) => t.skillPath === 'skills/b/SKILL.md')?.function).toBe('devops');
  });

  it('未配置 AI：抛 AiConfigIncompleteError，不发任何请求（Scenario 2）', async () => {
    const cache = new MemoryCache();
    const { client, urls } = clientFor({ 'skills/a/SKILL.md': SKILL_A });
    const llm = makeLlm({});
    await expect(
      classifyGithubCandidates(
        { repo: 'acme/skills', sha: 'dead', skillPaths: ['skills/a/SKILL.md'] },
        { client, cache, llm, config: undefined },
      ),
    ).rejects.toBeInstanceOf(AiConfigIncompleteError);
    expect(urls).toHaveLength(0);
  });
});

describe('estimateGithubClassification（Scenario 1/6/2）', () => {
  it('已配置：报 total/cacheHits/willCall（命中缓存不计入 willCall）', async () => {
    const cache = new MemoryCache();
    cache.data[hashSkillContent(SKILL_A)] = { category: 'coding', model: 'm', classifiedAt: 'x' };
    const { client } = clientFor({ 'skills/a/SKILL.md': SKILL_A, 'skills/b/SKILL.md': SKILL_B });
    const e = await estimateGithubClassification(
      { repo: 'acme/skills', sha: 'dead', skillPaths: ['skills/a/SKILL.md', 'skills/b/SKILL.md'] },
      { client, cache, config: CFG },
    );
    expect(e).toEqual({ total: 2, cacheHits: 1, willCall: 1, aiConfigured: true });
  });

  it('未配置：willCall=0 且不发请求', async () => {
    const cache = new MemoryCache();
    const { client, urls } = clientFor({ 'skills/a/SKILL.md': SKILL_A });
    const e = await estimateGithubClassification(
      { repo: 'acme/skills', sha: 'dead', skillPaths: ['skills/a/SKILL.md'] },
      { client, cache, config: undefined },
    );
    expect(e).toEqual({ total: 1, cacheHits: 0, willCall: 0, aiConfigured: false });
    expect(urls).toHaveLength(0);
  });
});
