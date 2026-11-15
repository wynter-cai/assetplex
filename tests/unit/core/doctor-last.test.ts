/**
 * 上次诊断记录测试（refactor-asset-pipeline T1）
 *
 * spec: specs/asset-pipeline.spec.md Scenario 2.2/2.3/8.5；
 * api-contract: DoctorLastRunRecord / DoctorLastRunSummary / GET /api/doctor/summary。
 * 全 DI：假 fs / 准则 / 内存缓存 / 内存 lastRunStore，不碰真实文件与网络。
 */

import { describe, it, expect } from 'vitest';
import { diagnoseAsset } from '../../../src/core/doctor.js';
import {
  diffLastRunInputs,
  doctorLastRunKey,
  hashDoctorContent,
  sanitizeDoctorLastRuns,
  type DoctorLastRunRecord,
} from '../../../src/core/doctor-cache.js';
import type { CriterionAsset } from '../../../src/core/criteria.js';
import type { DoctorCacheStore } from '../../../src/core/doctor-cache.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';
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

const otherCriterion: CriterionAsset = { ...demoCriterion, slug: 'rule-topic', name: '规则单主题' };
const SKILL_PATH = 'skills/demo-skill/SKILL.md';
const DEMO_CONTENT = '---\nname: demo-skill\ndescription: 演示\n---\n正文内容\n';
const validOutput = JSON.stringify({
  overall: 'needs-attention',
  issues: [
    {
      severity: 'medium',
      criterion: 'token-economy',
      finding: '正文重复陈述模型已知的通用知识',
      suggestion: '删除基础概念解释段',
      fixable: true,
    },
  ],
});

function fullConfig(overrides: Partial<AiClassifyConfig> = {}): AiClassifyConfig {
  return { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model', ...overrides };
}

interface LastRunStore {
  load(): unknown;
  save(records: Record<string, DoctorLastRunRecord>): void;
}

/** 内存记录存储：load 返回深拷贝，模拟 JSON 往返 */
function memoryStore(): LastRunStore & { raw(): Record<string, DoctorLastRunRecord> } {
  let data: Record<string, DoctorLastRunRecord> = {};
  return {
    load: () => JSON.parse(JSON.stringify(data)) as unknown,
    save: (records) => {
      data = JSON.parse(JSON.stringify(records)) as Record<string, DoctorLastRunRecord>;
    },
    raw: () => data,
  };
}

function memoryCache(): DoctorCacheStore {
  let data: Record<string, never> = {};
  return {
    load: () => ({ ...data }) as Record<string, never>,
    save: (entries) => {
      data = { ...entries } as Record<string, never>;
    },
  };
}

interface HarnessOptions {
  config?: Partial<AiClassifyConfig> | null;
  content?: string;
  criteria?: CriterionAsset[];
  lastRunStore?: LastRunStore;
  cache?: DoctorCacheStore;
  now?: string;
}

function harness(opts: HarnessOptions = {}) {
  const calls: unknown[] = [];
  const content = opts.content ?? DEMO_CONTENT;
  const config = opts.config === null ? null : fullConfig(opts.config ?? {});
  const llm: LlmClient = {
    chat: async () => {
      calls.push(content);
      return validOutput;
    },
  };
  return {
    calls,
    deps: {
      fs: { read: () => content },
      getCriteria: () => opts.criteria ?? [demoCriterion],
      cache: opts.cache ?? memoryCache(),
      llm,
      ...(config === null ? { config: null } : { config }),
      ...(opts.lastRunStore === undefined ? {} : { lastRunStore: opts.lastRunStore }),
      now: () => opts.now ?? '2026-11-14T12:00:00.000Z',
    },
  };
}

describe('diagnoseAsset 写入上次运行记录（T1）', () => {
  it('首次诊断成功写入一条记录：摘要字段对齐报告，指纹三要素齐全', async () => {
    const store = memoryStore();
    const h = harness({ lastRunStore: store });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, h.deps);
    const entry = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    expect(entry).toBeDefined();
    expect(entry.kind).toBe('skill');
    expect(entry.hubRelativePath).toBe(SKILL_PATH);
    expect(entry.overall).toBe(report.overall);
    expect(entry.issueCount).toBe(report.issues.length);
    expect(entry.mechanicalOnly).toBe(false);
    expect(entry.model).toBe('demo-model');
    expect(entry.generatedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(entry.inputs.contentHash).toBe(hashDoctorContent(DEMO_CONTENT));
    expect(entry.inputs.model).toBe('demo-model');
    expect(entry.inputs.criteriaHash).not.toBe('');
    expect(Object.keys(store.raw())).toHaveLength(1);
  });

  it('同内容再诊断覆盖 generatedAt，且仍只有一条记录', async () => {
    const store = memoryStore();
    const cache = memoryCache();
    const first = harness({ lastRunStore: store, cache, now: '2026-11-14T12:00:00.000Z' });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, first.deps);
    const second = harness({ lastRunStore: store, cache, now: '2026-11-15T09:30:00.000Z' });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, second.deps);
    const entry = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    expect(entry.generatedAt).toBe('2026-11-15T09:30:00.000Z');
    expect(Object.keys(store.raw())).toHaveLength(1);
  });

  it('正文变更 → diffLastRunInputs 返回 [content]', async () => {
    const store = memoryStore();
    const first = harness({ lastRunStore: store });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, first.deps);
    const before = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    const second = harness({ lastRunStore: store, content: `${DEMO_CONTENT}追加一行\n` });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, second.deps);
    const after = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    expect(diffLastRunInputs(before.inputs, after.inputs)).toEqual(['content']);
  });

  it('准则集变更 → diffLastRunInputs 返回 [criteria]', async () => {
    const store = memoryStore();
    const first = harness({ lastRunStore: store });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, first.deps);
    const before = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    const second = harness({ lastRunStore: store, criteria: [otherCriterion] });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, second.deps);
    const after = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    expect(diffLastRunInputs(before.inputs, after.inputs)).toEqual(['criteria']);
  });

  it('模型变更 → diffLastRunInputs 返回 [model]', async () => {
    const store = memoryStore();
    const first = harness({ lastRunStore: store });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, first.deps);
    const before = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    const second = harness({ lastRunStore: store, config: { model: 'demo-model-2' } });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, second.deps);
    const after = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    expect(diffLastRunInputs(before.inputs, after.inputs)).toEqual(['model']);
  });

  it('mechanicalOnly 分支也写入：mechanicalOnly=true、model 为空串', async () => {
    const store = memoryStore();
    const h = harness({ config: null, content: '无 frontmatter 的技能正文\n', lastRunStore: store });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, h.deps);
    const entry = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    expect(report.mechanicalOnly).toBe(true);
    expect(entry.mechanicalOnly).toBe(true);
    expect(entry.model).toBe('');
    expect(entry.inputs.model).toBe('');
    expect(entry.issueCount).toBe(report.issues.length);
    expect(h.calls).toHaveLength(0);
  });

  it('不注入 lastRunStore 时不写任何记录（既有行为零改动）', async () => {
    const h = harness();
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, h.deps);
    expect(report.overall).toBe('needs-attention');
    expect(h.calls).toHaveLength(1);
  });

  it('序列化后的记录不含正文片段（只存摘要与指纹）', async () => {
    const marker = 'UNIQUE-BODY-MARKER-3f9c';
    const store = memoryStore();
    const h = harness({ lastRunStore: store, content: `---\nname: demo-skill\ndescription: 演示\n---\n${marker}\n` });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, h.deps);
    const serialized = JSON.stringify(store.raw());
    expect(serialized.includes(marker)).toBe(false);
  });
});

describe('sanitizeDoctorLastRuns（脏数据丢弃不抛错）', () => {
  const valid: DoctorLastRunRecord = {
    kind: 'skill',
    hubRelativePath: 'skills/demo-skill/SKILL.md',
    overall: 'needs-attention',
    issueCount: 3,
    highSeverityCount: 1,
    fixableCount: 2,
    ignoredCount: 0,
    mechanicalOnly: false,
    rulesVersion: '1.0.0',
    model: 'demo-model',
    generatedAt: '2026-11-14T12:00:00.000Z',
    inputs: { contentHash: 'abc', criteriaHash: 'def', model: 'demo-model' },
  };

  it('合法条目保留，缺字段 / overall 非法 / kind 非法 / 路径空 / 指纹空全部丢弃', () => {
    const raw: Record<string, unknown> = {
      [doctorLastRunKey('skill', valid.hubRelativePath)]: valid,
      'broken/missing-overall': { ...valid, overall: undefined },
      'broken/invalid-overall': { ...valid, overall: '很好' },
      'broken/invalid-kind': { ...valid, kind: 'mcp' },
      'broken/empty-path': { ...valid, hubRelativePath: '   ' },
      'broken/empty-content-hash': { ...valid, inputs: { ...valid.inputs, contentHash: '' } },
      'broken/missing-inputs': { ...valid, inputs: undefined },
    };
    const out = sanitizeDoctorLastRuns(raw);
    expect(Object.keys(out)).toEqual([doctorLastRunKey('skill', valid.hubRelativePath)]);
    expect(out[doctorLastRunKey('skill', valid.hubRelativePath)]).toEqual(valid);
  });

  it('非对象输入返回空表，不抛错', () => {
    expect(sanitizeDoctorLastRuns(null)).toEqual({});
    expect(sanitizeDoctorLastRuns('坏数据')).toEqual({});
    expect(sanitizeDoctorLastRuns([valid])).toEqual({});
  });
});
