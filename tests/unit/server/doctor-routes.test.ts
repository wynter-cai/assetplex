/**
 * 医生路由测试（add-asset-doctor E5）
 *
 * spec: specs/asset-diagnosis.spec.md Scenario 1/4/5/7/8；api-contract 错误约定
 * （400 请求体非法 / 403 非库内资产 / 404 文件不存在 / 422 模型输出非法）。
 * 全依赖注入：假 fs / listAssets / 准则 / 内存缓存 / mock LLM，不碰真实文件与网络。
 */

import { describe, it, expect } from 'vitest';
import { createDoctorRoutes } from '../../../src/server/routes/doctor.js';
import { computeDoctorCacheKey, type DoctorCacheEntry, type DoctorCacheStore } from '../../../src/core/doctor-cache.js';
import { hashCriteria, type CriterionAsset } from '../../../src/core/criteria.js';
import type { AiConfigStore, AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';

const demoCriterion: CriterionAsset = {
  slug: 'token-economy',
  relativePath: 'criteria/token-economy.md',
  name: 'Token 效率',
  description: '',
  priority: 5,
  enabled: true,
  appliesTo: ['all'],
  body: '只写模型不知道的',
};

const SKILL_CONTENT = '---\nname: demo-skill\ndescription: 演示\n---\n正文内容\n';
const validModelOutput = JSON.stringify({ overall: 'needs-attention', issues: [] });

/** 与路由默认注入相同准则集/模型时的缓存 key（estimate 用例 seed 用） */
function seedKeyFor(content: string): string {
  return computeDoctorCacheKey({
    kind: 'skill',
    content,
    criteriaHash: hashCriteria([demoCriterion]),
    model: 'demo-model',
  });
}

interface Harness {
  readonly calls: number;
  post: (body: unknown) => Promise<{ status: number; json: () => Promise<Record<string, unknown>> }>;
  get: (path: string) => Promise<{ status: number; json: () => Promise<Record<string, unknown>> }>;
  cache: DoctorCacheStore;
}

function harness(opts: {
  config?: Partial<AiClassifyConfig> | null;
  files?: Record<string, string>;
  assets?: string[];
  llmOutput?: string;
  seedEntries?: Record<string, DoctorCacheEntry>;
} = {}): Harness {
  let calls = 0;
  const files = opts.files ?? { 'skills/demo-skill/SKILL.md': SKILL_CONTENT };
  let data: Record<string, DoctorCacheEntry> = { ...opts.seedEntries };
  const storeData: Partial<AiClassifyConfig> =
    opts.config === null ? {} : { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model', ...opts.config };
  const aiConfigStore: AiConfigStore = {
    load: () => ({ ...storeData }),
    save: () => undefined,
  };
  const cache: DoctorCacheStore = {
    load: () => ({ ...data }),
    save: (entries) => {
      data = { ...entries };
    },
  };
  const llm: LlmClient = {
    chat: async (input) => {
      calls += 1;
      void input;
      return opts.llmOutput ?? validModelOutput;
    },
  };
  const routes = createDoctorRoutes({
    fs: { read: (p: string) => files[p] ?? null },
    listAssets: () => opts.assets ?? Object.keys(files),
    getCriteria: () => [demoCriterion],
    cache,
    llmClient: llm,
    aiConfigStore,
    now: () => '2026-10-18T00:00:00.000Z',
  });
  const post = async (body: unknown) => {
    const res = await routes.fetch(
      new Request('http://local/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: () => res.json() as Promise<Record<string, unknown>> };
  };
  const get = async (path: string) => {
    const res = await routes.fetch(new Request(`http://local${path}`));
    return { status: res.status, json: () => res.json() as Promise<Record<string, unknown>> };
  };
  return {
    get calls() {
      return calls;
    },
    post,
    get,
    cache,
  };
}

const validBody = { kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' };

describe('POST /api/doctor/diagnose', () => {
  it('成功诊断返回完整报告（200，模型项+机械项合并、准则披露）', async () => {
    const h = harness();
    const res = await h.post(validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall).toBe('needs-attention');
    expect(body.mechanicalOnly).toBe(false);
    expect(body.cached).toBe(false);
    expect(body.model).toBe('demo-model');
    expect(body.criteriaUsed).toEqual(['token-economy']);
  });

  it('kind 不在医生类别闭集 → 400 且不调模型', async () => {
    const h = harness();
    const res = await h.post({ kind: 'mcp', hubRelativePath: 'mcp/demo.json' });
    expect(res.status).toBe(400);
    expect(h.calls).toBe(0);
  });

  it('hubRelativePath 绝对路径（工具侧/环境条目）→ 403 不提供医生服务', async () => {
    const h = harness();
    const res = await h.post({ kind: 'skill', hubRelativePath: 'd:/elsewhere/demo/SKILL.md' });
    expect(res.status).toBe(403);
    expect(h.calls).toBe(0);
  });

  it('hubRelativePath 越出 Hub 根（../escape）→ 403', async () => {
    const h = harness();
    const res = await h.post({ kind: 'skill', hubRelativePath: '../escape/SKILL.md' });
    expect(res.status).toBe(403);
  });

  it('库内文件不存在 → 404', async () => {
    const h = harness();
    const res = await h.post({ kind: 'skill', hubRelativePath: 'skills/gone/SKILL.md' });
    expect(res.status).toBe(404);
  });

  it('AI 未配置 → 200 机械降级报告 mechanicalOnly=true，不发请求（Scenario 7）', async () => {
    const h = harness({ config: null, files: { 'skills/demo-skill/SKILL.md': '无 frontmatter 的坏技能\n' } });
    const res = await h.post(validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mechanicalOnly).toBe(true);
    expect(h.calls).toBe(0);
    const issues = body.issues as { criterion: string }[];
    expect(issues.some((i) => i.criterion === 'mechanical:frontmatter-missing-field')).toBe(true);
  });

  it('模型输出非法 → 422「诊断失败」，不落缓存（Scenario 8）', async () => {
    const h = harness({ llmOutput: '看起来挺好的' });
    const res = await h.post(validBody);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(String(body.error)).toContain('诊断失败');
    expect(Object.keys(h.cache.load())).toHaveLength(0);
  });

  it('同内容二次诊断命中缓存：cached=true 且第二次不调模型（Scenario 4）', async () => {
    const h = harness();
    await h.post(validBody);
    const res = await h.post(validBody);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(h.calls).toBe(1);
  });
});

describe('GET /api/doctor/estimate', () => {
  const assets = ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/c/SKILL.md'];
  const files: Record<string, string> = {};
  // 内容必须互异：缓存 key 按内容哈希，同内容共享同一条目
  assets.forEach((p, i) => {
    files[p] = `---\nname: x${i}\ndescription: y\n---\nbody\n`;
  });

  it('category 非法 → 400', async () => {
    const h = harness();
    const res = await h.get('/estimate?category=mcp');
    expect(res.status).toBe(400);
  });

  it('3 个库内技能、1 个已缓存 → total=3 cacheHits=1 willCall=2（Scenario 5 预算护栏数据面）', async () => {
    const seeded: DoctorCacheEntry = {
      overall: 'healthy',
      issues: [],
      model: 'demo-model',
      criteriaUsed: [],
      criteriaSkipped: 0,
      generatedAt: '2026-10-17T00:00:00.000Z',
    };
    const h = harness({ assets, files, seedEntries: { [seedKeyFor(files[assets[0]])]: seeded } });
    const res = await h.get('/estimate?category=skill');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ category: 'skill', total: 3, cacheHits: 1, willCall: 2 });
  });

  it('AI 未配置 → willCall=0（批量只跑机械项不消耗调用）', async () => {
    const h = harness({ config: null });
    const res = await h.get('/estimate?category=skill');
    expect(await res.json()).toEqual({ category: 'skill', total: 1, cacheHits: 0, willCall: 0 });
  });
});
