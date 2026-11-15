/**
 * 上次诊断记录测试（refactor-asset-pipeline T1；add-diagnosis-rules 起指纹改用规则集）
 *
 * spec: specs/asset-pipeline.spec.md Scenario 2.2/2.3/8.5；
 * api-contract: DoctorLastRunRecord / DoctorLastRunSummary / GET /api/doctor/summary。
 * 全 DI：假 fs / 规则集 / 内存缓存 / 内存 lastRunStore，不碰真实文件与网络。
 */

import { describe, it, expect } from 'vitest';
import { diagnoseAsset, type DiagnoseDeps } from '../../../src/core/doctor.js';
import {
  diffLastRunInputs,
  doctorLastRunKey,
  hashDoctorContent,
  sanitizeDoctorLastRuns,
  type DoctorLastRunRecord,
} from '../../../src/core/doctor-cache.js';
import type { DoctorCacheStore } from '../../../src/core/doctor-cache.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';
import type { DiagnosisRuleSet } from '../../../src/core/types.js';

const RULE_SET: DiagnosisRuleSet = {
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

const SKILL_PATH = 'skills/demo-skill/SKILL.md';
const DEMO_CONTENT = '---\nname: demo-skill\ndescription: 演示\n---\n正文内容\n';
/** 证据片段必须能在正文定位（第 5 行），否则整条被丢弃 */
const validOutput = JSON.stringify({
  findings: [
    {
      ruleId: 'SK-06',
      severity: 'medium',
      confidence: 'high',
      finding: '正文重复陈述模型已知的通用知识',
      impact: '浪费 token',
      suggestion: '删除基础概念解释段',
      evidence: [{ line: 5, snippet: '正文内容' }],
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
  ruleSet?: DiagnosisRuleSet;
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
  const deps: DiagnoseDeps = {
    fs: { read: () => content },
    cache: opts.cache ?? memoryCache(),
    llm,
    config,
    ruleSet: opts.ruleSet ?? RULE_SET,
    ...(opts.lastRunStore === undefined ? {} : { lastRunStore: opts.lastRunStore }),
    now: () => opts.now ?? '2026-11-14T12:00:00.000Z',
  };
  return { calls, deps };
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
    expect(entry.inputs.rulesHash).not.toBe('');
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

  it('规则集变更 → diffLastRunInputs 返回 [rules]', async () => {
    const store = memoryStore();
    const first = harness({ lastRunStore: store });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, first.deps);
    const before = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    const upgraded: DiagnosisRuleSet = { ...RULE_SET, version: '1.1.0' };
    const second = harness({ lastRunStore: store, ruleSet: upgraded });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: SKILL_PATH }, second.deps);
    const after = store.raw()[doctorLastRunKey('skill', SKILL_PATH)];
    expect(diffLastRunInputs(before.inputs, after.inputs)).toEqual(['rules']);
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
    expect(entry.issueCount).toBeGreaterThan(0);
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
    inputs: { contentHash: 'abc', rulesHash: 'def', model: 'demo-model' },
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
