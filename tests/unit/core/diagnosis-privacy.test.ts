/**
 * 隐私与降级专项（add-diagnosis-rules T9）
 *
 * spec: specs/diagnosis-rules.spec.md Scenario 5.1（默认零上传）/ 5.4（忽略不外传）/
 * 7.1（无模型静态完整）/ 7.2（超时或超预算降级，不返回假健康）。
 */

import { describe, it, expect } from 'vitest';
import { diagnoseAsset, type DiagnoseDeps } from '../../../src/core/doctor.js';
import { buildCoverage } from '../../../src/core/diagnosis-report.js';
import type { DoctorCacheStore } from '../../../src/core/doctor-cache.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';
import type { DiagnosisRuleSet } from '../../../src/core/types.js';

const CONTENT = '---\nname: Demo_Skill\ndescription: Use when 用户要导出 CSV。\n---\n正文\n';

const RULE_SET: DiagnosisRuleSet = {
  version: '1.0.0',
  updatedAt: '2026-01-01',
  rules: [
    {
      id: 'SK-02',
      category: 'skill',
      severity: 'medium',
      mode: 'static',
      signal: '演示信号',
      recommendation: '演示改法',
      source: '演示出处',
    },
    {
      id: 'SK-09',
      category: 'skill',
      severity: 'medium',
      mode: 'llm',
      signal: '演示语义信号',
      recommendation: '演示语义改法',
      source: '演示出处',
    },
  ],
};

const CONFIG: AiClassifyConfig = { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model' };

function memoryCache(): DoctorCacheStore & { size(): number } {
  let data: Record<string, never> = {};
  return {
    load: () => ({ ...data }) as Record<string, never>,
    save: (entries) => {
      data = { ...entries } as Record<string, never>;
    },
    size: () => Object.keys(data).length,
  };
}

interface CapturedRequest {
  system: string;
  user: string;
}

function harness(options: { config?: AiClassifyConfig | null; failWith?: Error } = {}) {
  const calls: CapturedRequest[] = [];
  const cache = memoryCache();
  const config = options.config === undefined ? CONFIG : options.config;
  const llm: LlmClient = {
    chat: async (input) => {
      calls.push(input);
      if (options.failWith !== undefined) throw options.failWith;
      return JSON.stringify({ findings: [] });
    },
  };
  const deps: DiagnoseDeps = {
    fs: { read: (path) => (path === 'skills/demo/SKILL.md' ? CONTENT : null) },
    cache,
    llm,
    config,
    ruleSet: RULE_SET,
    now: () => '2026-11-15T12:00:00.000Z',
  };
  return { calls, cache, deps };
}

describe('隐私边界（Scenario 5.1 / 5.4）', () => {
  it('未配置 AI：零网络调用，静态结论完整', async () => {
    const h = harness({ config: null });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo/SKILL.md' }, h.deps);

    expect(h.calls).toHaveLength(0);
    expect(h.cache.size()).toBe(0);
    expect(report.mechanicalOnly).toBe(true);
    expect(report.aiEvaluated).toBe(false);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.coverage.skippedReasons).toEqual([{ mode: 'llm', reason: 'no-ai-config', count: 1 }]);
  });

  it('发送层只含 system / user 两个字段，不带绝对路径、其他资产与忽略清单', async () => {
    const h = harness();
    const deps: DiagnoseDeps = {
      ...h.deps,
      ignores: [
        {
          ruleId: 'SK-02',
          hubRelativePath: 'skills/demo/SKILL.md',
          contentHash: 'demo-hash',
          ignoredAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    };
    await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo/SKILL.md' }, deps);

    expect(h.calls).toHaveLength(1);
    const payload = h.calls[0] as CapturedRequest;
    expect(Object.keys(payload).sort()).toEqual(['system', 'user']);
    const raw = JSON.stringify(payload);
    expect(raw).not.toMatch(/[A-Za-z]:\\\\/);
    expect(raw).not.toContain('/Users/');
    expect(raw).not.toContain('/home/');
    expect(raw).not.toContain('skills/other/SKILL.md');
    expect(raw).not.toContain('2026-11-01T00:00:00.000Z');
    expect(raw).not.toContain('demo-hash');
  });
});

describe('降级（Scenario 7.1 / 7.2）', () => {
  it('AI 超时：保留静态结论，标注语义未完成，不落缓存', async () => {
    const h = harness({ failWith: new Error('request timeout') });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo/SKILL.md' }, h.deps);

    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.aiEvaluated).toBe(false);
    expect(report.mechanicalOnly).toBe(false);
    expect(report.overall).not.toBe('healthy');
    expect(report.coverage.skippedReasons).toEqual([{ mode: 'llm', reason: 'timeout', count: 1 }]);
    expect(h.cache.size()).toBe(0);
  });

  it('覆盖度可按预算降级披露，不把未评估项算作通过', () => {
    const coverage = buildCoverage(RULE_SET, 'skill', 1, false, 'budget');
    expect(coverage.evaluatedRules).toBe(1);
    expect(coverage.skippedReasons).toEqual([{ mode: 'llm', reason: 'budget', count: 1 }]);
  });
});
