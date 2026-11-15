/**
 * 医生路由测试（add-asset-doctor E5）
 *
 * spec: specs/asset-diagnosis.spec.md Scenario 1/4/5/7/8；api-contract 错误约定
 * （400 请求体非法 / 403 非库内资产 / 404 文件不存在 / 422 模型输出非法）。
 * 全依赖注入：假 fs / listAssets / 准则 / 内存缓存 / mock LLM，不碰真实文件与网络。
 */

import { describe, it, expect } from 'vitest';
import { createDoctorRoutes } from '../../../src/server/routes/doctor.js';
import {
  computeDoctorCacheKey,
  hashRuleSet,
  type DoctorCacheEntry,
  type DoctorCacheStore,
} from '../../../src/core/doctor-cache.js';
import type { AiConfigStore, AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';
import type { DiagnosisRuleSet } from '../../../src/core/types.js';

/** estimate 用：与路由注入同一份规则集，才能算出同一缓存 key */
const DEMO_RULE_SET: DiagnosisRuleSet = {
  version: '1.0.0',
  updatedAt: '2026-01-01',
  rules: [
    {
      id: 'SK-06',
      category: 'skill',
      severity: 'medium',
      mode: 'llm',
      signal: '演示语义信号',
      recommendation: '演示改法',
      source: '演示出处',
    },
  ],
};

const SKILL_CONTENT = '---\nname: demo-skill\ndescription: Use when 用户要导出 CSV。\n---\n正文内容\n';
const validModelOutput = JSON.stringify({
  findings: [
    {
      ruleId: 'SK-06',
      severity: 'low',
      confidence: 'medium',
      finding: '正文含通用解释',
      impact: '',
      suggestion: '删掉',
      evidence: [{ line: 5, snippet: '正文内容' }],
    },
  ],
});

/** 与路由注入同一规则集时的缓存 key（estimate 用例 seed 用） */
function seedKeyFor(content: string): string {
  return computeDoctorCacheKey({
    kind: 'skill',
    content,
    rulesHash: hashRuleSet(DEMO_RULE_SET),
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
  ruleSet?: DiagnosisRuleSet | null;
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
    cache,
    llmClient: llm,
    aiConfigStore,
    ...(opts.ruleSet === undefined ? {} : { ruleSet: opts.ruleSet }),
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
  it('成功诊断返回完整报告（200，静态项+语义增量合并）', async () => {
    const h = harness();
    const res = await h.post(validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall).toBe('needs-attention');
    expect(body.mechanicalOnly).toBe(false);
    expect(body.cached).toBe(false);
    expect(body.model).toBe('demo-model');
    expect((body.findings as Array<{ ruleId: string }>).some((f) => f.ruleId === 'SK-06')).toBe(true);
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

  it('模型输出不可用 → 200 保留静态结论、rejected 计数、不落缓存（下次重试）', async () => {
    const h = harness({ llmOutput: '看起来挺好的' });
    const res = await h.post(validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rejected).toBe(1);
    expect((body.findings as Array<{ source: string }>).every((f) => f.source === 'rule')).toBe(true);
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

// ================= T3: 报告契约扩展 =================

describe('诊断报告新字段（add-diagnosis-rules T3）', () => {
  it('响应含 findings / coverage / rulesVersion / aiEvaluated / rejected，旧 issues 不缺失', async () => {
    const h = harness();
    const body = await (await h.post(validBody)).json();
    const findings = body.findings as Array<{ ruleId: string; evidence: unknown[] }>;
    expect(body.rulesVersion).toBe('1.0.0');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => typeof finding.ruleId === 'string')).toBe(true);
    expect(body.coverage).toEqual({ evaluatedRules: 22, skippedRules: 0, skippedReasons: [] });
    expect(body.aiEvaluated).toBe(true);
    expect(body.rejected).toBe(0);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.mechanicalOnly).toBe(false);
  });

  it('AI 未配置：静态 findings 完整可用，语义规则计入 no-ai-config，机械项仍有值', async () => {
    const h = harness({ config: null, files: { 'skills/demo-skill/SKILL.md': '无 frontmatter 的坏技能\n' } });
    const body = await (await h.post(validBody)).json();
    expect(body.aiEvaluated).toBe(false);
    expect((body.findings as unknown[]).length).toBeGreaterThan(0);
    expect(body.coverage).toEqual({
      evaluatedRules: 15,
      skippedRules: 7,
      skippedReasons: [{ mode: 'llm', reason: 'no-ai-config', count: 7 }],
    });
    const issues = body.issues as Array<{ criterion: string }>;
    expect(issues.some((issue) => issue.criterion === 'mechanical:frontmatter-missing-field')).toBe(true);
  });

  it('注入自定义规则集时版本与覆盖度随响应透出', async () => {
    const custom: DiagnosisRuleSet = { version: '0.0.1-demo', updatedAt: '2026-11-15', rules: [] };
    const h = harness({ ruleSet: custom });
    const body = await (await h.post(validBody)).json();
    expect(body.rulesVersion).toBe('0.0.1-demo');
    expect(body.findings).toEqual([]);
    expect(body.coverage).toEqual({ evaluatedRules: 0, skippedRules: 0, skippedReasons: [] });
  });
});

describe('GET /api/doctor/estimate', () => {  const assets = ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/c/SKILL.md'];
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
      findings: [],
      rejected: 0,
      candidateCount: 1,
      model: 'demo-model',
      rulesVersion: '1.0.0',
      generatedAt: '2026-10-17T00:00:00.000Z',
    };
    const h = harness({
      assets,
      files,
      ruleSet: DEMO_RULE_SET,
      seedEntries: { [seedKeyFor(files[assets[0]])]: seeded },
    });
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
