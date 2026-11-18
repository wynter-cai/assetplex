/**
 * GET /api/doctor/summary 测试（refactor-asset-pipeline T2；add-diagnosis-rules 起指纹用规则集）
 *
 * spec: specs/asset-pipeline.spec.md Requirement 2 / Scenario 6.2 / 6.7；
 * api-contract: DoctorSummaryResponse；错误约定 400 / 403 / 200+available=false。
 * 全依赖注入：假 fs / 规则集 / 内存缓存 / 内存记录存储；llm 一旦被调用即抛错（零模型调用断言）。
 */

import { describe, it, expect } from 'vitest';
import { createDoctorRoutes } from '../../../src/server/routes/doctor.js';
import {
  computeDoctorCacheKey,
  doctorLastRunKey,
  hashDoctorContent,
  hashRuleSet,
  type DoctorCacheEntry,
  type DoctorCacheStore,
  type DoctorLastRunRecord,
} from '../../../src/core/doctor-cache.js';
import type { AiConfigStore, AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';
import type { DiagnosisRuleSet } from '../../../src/core/types.js';

const RULE_SET: DiagnosisRuleSet = {
  version: '1.0.0',
  updatedAt: '2026-01-01',
  rules: [
    {
      id: 'SK-09',
      category: 'skill',
      severity: 'medium',
      mode: 'llm',
      signal: '演示语义信号',
      recommendation: '演示改法',
      source: '演示出处',
    },
  ],
};

const SKILL_PATH = 'skills/demo-skill/SKILL.md';
const SKILL_CONTENT = '---\nname: demo-skill\ndescription: 演示\n---\n正文内容\n';
const MODEL = 'demo-model';
const KEY = doctorLastRunKey('skill', SKILL_PATH);

function record(overrides: Partial<DoctorLastRunRecord> = {}): DoctorLastRunRecord {
  return {
    kind: 'skill',
    hubRelativePath: SKILL_PATH,
    overall: 'needs-attention',
    issueCount: 4,
    highSeverityCount: 1,
    fixableCount: 2,
    ignoredCount: 0,
    mechanicalOnly: false,
    rulesVersion: '1.0.0',
    model: MODEL,
    generatedAt: '2026-11-14T12:00:00.000Z',
    inputs: {
      contentHash: hashDoctorContent(SKILL_CONTENT),
      rulesHash: hashRuleSet(RULE_SET),
      model: MODEL,
    },
    ...overrides,
  };
}

function cachedEntry(): DoctorCacheEntry {
  return {
    findings: [],
    rejected: 0,
    candidateCount: 1,
    model: MODEL,
    rulesVersion: '1.0.0',
    generatedAt: '2026-11-14T12:00:00.000Z',
  };
}

interface HarnessOptions {
  config?: Partial<AiClassifyConfig> | null;
  files?: Record<string, string>;
  records?: Record<string, unknown>;
  cacheEntries?: Record<string, DoctorCacheEntry>;
  ruleSet?: DiagnosisRuleSet;
}

function harness(opts: HarnessOptions = {}) {
  let llmCalls = 0;
  const files = opts.files ?? { [SKILL_PATH]: SKILL_CONTENT };
  const storeData: Partial<AiClassifyConfig> =
    opts.config === null ? {} : { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: MODEL, ...opts.config };
  const aiConfigStore: AiConfigStore = { load: () => ({ ...storeData }), save: () => undefined };
  let cacheData: Record<string, DoctorCacheEntry> = { ...opts.cacheEntries };
  const cache: DoctorCacheStore = {
    load: () => ({ ...cacheData }),
    save: (entries) => {
      cacheData = { ...entries };
    },
  };
  let lastRunData: Record<string, unknown> = { ...opts.records };
  const lastRunStore = {
    load: (): unknown => lastRunData,
    save: (records: Record<string, DoctorLastRunRecord>): void => {
      lastRunData = { ...records };
    },
  };
  const llm: LlmClient = {
    chat: async () => {
      llmCalls += 1;
      throw new Error('summary 不得调用模型');
    },
  };
  const routes = createDoctorRoutes({
    fs: { read: (p: string) => files[p] ?? null },
    listAssets: () => Object.keys(files),
    ruleSet: opts.ruleSet ?? RULE_SET,
    cache,
    llmClient: llm,
    aiConfigStore,
    lastRunStore,
    now: () => '2026-11-15T00:00:00.000Z',
  });
  const get = async (path: string) => {
    const res = await routes.fetch(new Request(`http://local${path}`));
    return { status: res.status, json: () => res.json() as Promise<Record<string, unknown>> };
  };
  return {
    get,
    get llmCalls() {
      return llmCalls;
    },
  };
}

const SUMMARY = `/summary?kind=skill&hubRelativePath=${encodeURIComponent(SKILL_PATH)}`;

describe('GET /api/doctor/summary', () => {
  it('无记录 → 200 available=true / state=never（没有记录不等于读取失败），AI 已配置时提示将调用一次模型（Scenario 6.2）', async () => {
    const h = harness();
    const res = await h.get(SUMMARY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      kind: 'skill',
      hubRelativePath: SKILL_PATH,
      available: true,
      state: 'never',
      lastRun: null,
      staleReasons: [],
      aiConfigured: true,
      willCallModel: true,
    });
    expect(h.llmCalls).toBe(0);
  });

  it('三要素一致且缓存命中 → state=valid、willCallModel=false，lastRun 照常返回', async () => {
    const key = computeDoctorCacheKey({
      kind: 'skill',
      content: SKILL_CONTENT,
      rulesHash: hashRuleSet(RULE_SET),
      model: MODEL,
    });
    const h = harness({ records: { [KEY]: record() }, cacheEntries: { [key]: cachedEntry() } });
    const body = await (await h.get(SUMMARY)).json();
    expect(body.state).toBe('valid');
    expect(body.available).toBe(true);
    expect(body.willCallModel).toBe(false);
    expect(body.staleReasons).toEqual([]);
    expect(body.lastRun).toEqual({
      overall: 'needs-attention',
      issueCount: 4,
      highSeverityCount: 1,
      fixableCount: 2,
      ignoredCount: 0,
      mechanicalOnly: false,
      rulesVersion: '1.0.0',
      model: MODEL,
      generatedAt: '2026-11-14T12:00:00.000Z',
    });
    expect((body.lastRun as Record<string, unknown>).inputs).toBeUndefined();
    expect(h.llmCalls).toBe(0);
  });

  it('正文已变 → state=stale + staleReasons=[content]，lastRun 仍返回、将调用模型', async () => {
    const stale = record({
      inputs: { contentHash: hashDoctorContent('旧正文'), rulesHash: hashRuleSet(RULE_SET), model: MODEL },
    });
    const h = harness({ records: { [KEY]: stale } });
    const body = await (await h.get(SUMMARY)).json();
    expect(body.state).toBe('stale');
    expect(body.staleReasons).toEqual(['content']);
    expect(body.available).toBe(true);
    expect(body.willCallModel).toBe(true);
    expect(body.lastRun).not.toBeNull();
    expect(h.llmCalls).toBe(0);
  });

  it('规则集已更新 → state=stale + staleReasons=[rules]', async () => {
    const stale = record({
      inputs: {
        contentHash: hashDoctorContent(SKILL_CONTENT),
        rulesHash: hashRuleSet({ ...RULE_SET, version: '0.9.0' }),
        model: MODEL,
      },
    });
    const h = harness({ records: { [KEY]: stale } });
    const body = await (await h.get(SUMMARY)).json();
    expect(body.state).toBe('stale');
    expect(body.staleReasons).toEqual(['rules']);
    expect(h.llmCalls).toBe(0);
  });

  it('模型已更换 → state=stale + staleReasons=[model]', async () => {
    const stale = record({
      inputs: { contentHash: hashDoctorContent(SKILL_CONTENT), rulesHash: hashRuleSet(RULE_SET), model: 'demo-model-old' },
    });
    const h = harness({ records: { [KEY]: stale } });
    const body = await (await h.get(SUMMARY)).json();
    expect(body.state).toBe('stale');
    expect(body.staleReasons).toEqual(['model']);
    expect(h.llmCalls).toBe(0);
  });

  it('未配置 AI → aiConfigured=false 且 willCallModel 恒 false（Scenario 2.4）', async () => {
    const mechanical = record({
      mechanicalOnly: true,
      model: '',
      inputs: { contentHash: hashDoctorContent(SKILL_CONTENT), rulesHash: hashRuleSet(RULE_SET), model: '' },
    });
    const h = harness({ config: null, records: { [KEY]: mechanical } });
    const body = await (await h.get(SUMMARY)).json();
    expect(body.aiConfigured).toBe(false);
    expect(body.willCallModel).toBe(false);
    expect(body.available).toBe(true);
    expect(body.state).toBe('valid');
    expect(h.llmCalls).toBe(0);
  });

  it('未配置 AI 且无记录 → state=never 且 willCallModel=false', async () => {
    const h = harness({ config: null });
    const body = await (await h.get(SUMMARY)).json();
    expect(body.state).toBe('never');
    expect(body.aiConfigured).toBe(false);
    expect(body.willCallModel).toBe(false);
    expect(h.llmCalls).toBe(0);
  });

  it('kind 不在闭集 / hubRelativePath 缺失或为空 → 400', async () => {
    const h = harness();
    expect((await h.get('/summary?kind=mcp&hubRelativePath=skills%2Fa.md')).status).toBe(400);
    expect((await h.get('/summary?hubRelativePath=skills%2Fa.md')).status).toBe(400);
    expect((await h.get('/summary?kind=skill&hubRelativePath=%20')).status).toBe(400);
    expect(h.llmCalls).toBe(0);
  });

  it('非库内路径（绝对路径 / 越界）→ 403', async () => {
    const h = harness();
    expect((await h.get('/summary?kind=skill&hubRelativePath=d%3A%2Felsewhere%2FSKILL.md')).status).toBe(403);
    expect((await h.get('/summary?kind=skill&hubRelativePath=..%2Fescape%2FSKILL.md')).status).toBe(403);
    expect(h.llmCalls).toBe(0);
  });

  it('有记录但正文读不到 → 200 available=false / state=never（不 500，Scenario 6.7）', async () => {
    const h = harness({ records: { [KEY]: record() }, files: {} });
    const res = await h.get(SUMMARY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.state).toBe('never');
    expect(body.lastRun).toBeNull();
    expect(h.llmCalls).toBe(0);
  });

  it('记录损坏 → 200 available=false / state=never（脏数据不拖垮详情）', async () => {
    const h = harness({ records: { [KEY]: { overall: '不合法', kind: 'skill', hubRelativePath: SKILL_PATH } } });
    const res = await h.get(SUMMARY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.state).toBe('never');
    expect(body.lastRun).toBeNull();
    expect(h.llmCalls).toBe(0);
  });
});
