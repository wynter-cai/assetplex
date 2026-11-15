/**
 * GET /api/diagnosis/rules 规则清单（add-diagnosis-rules T7）
 *
 * spec: specs/diagnosis-rules.spec.md Scenario 1.3（规则集版本可见）/
 * 「定义与数据口径」统计口径（cross 不计入七类）。
 * 计数必须与 YAML 同源：不允许路由层另写一套数字。
 */

import { describe, it, expect } from 'vitest';
import { createDiagnosisRoutes } from '../../../src/server/routes/diagnosis.js';
import {
  loadRuleRegistryFromFile,
  resolveRuleSetFile,
} from '../../../src/core/diagnosis-rules.js';
import {
  RULE_ASSET_CATEGORIES,
  type DiagnosisRuleSet,
} from '../../../src/core/types.js';

const SAMPLE: DiagnosisRuleSet = {
  version: '9.9.9',
  updatedAt: '2026-01-01',
  rules: [
    {
      id: 'SK-01',
      category: 'skill',
      severity: 'high',
      mode: 'static',
      signal: '演示信号',
      recommendation: '演示改法',
      source: '演示出处',
    },
    {
      id: 'SK-02',
      category: 'skill',
      severity: 'medium',
      mode: 'llm',
      signal: '演示信号',
      recommendation: '演示改法',
      source: '演示出处',
    },
    {
      id: 'SEC-01',
      category: 'cross',
      appliesTo: ['skill', 'rule'],
      severity: 'high',
      mode: 'static',
      signal: '演示信号',
      recommendation: '演示改法',
      source: '演示出处',
    },
  ],
};

function harness(ruleSet: DiagnosisRuleSet | null) {
  const routes = createDiagnosisRoutes({ ruleSet });
  return async (path: string) => {
    const response = await routes.request(path);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
}

describe('GET /api/diagnosis/rules', () => {
  it('返回规则集原文、版本与模式计数', async () => {
    const get = harness(SAMPLE);
    const { status, body } = await get('/rules');

    expect(status).toBe(200);
    expect(body['version']).toBe('9.9.9');
    expect(body['updatedAt']).toBe('2026-01-01');
    expect(body['rules']).toHaveLength(3);
    expect(body['modeCounts']).toEqual({ static: 2, llm: 1 });
  });

  it('cross 单列计数，不重复计入七类', async () => {
    const get = harness(SAMPLE);
    const { body } = await get('/rules');
    const counts = body['counts'] as Record<string, number>;

    expect(counts['skill']).toBe(2);
    expect(counts['cross']).toBe(1);
    for (const kind of RULE_ASSET_CATEGORIES) {
      if (kind === 'skill') continue;
      expect(counts[kind]).toBe(0);
    }
    const sevenSum = RULE_ASSET_CATEGORIES.reduce((sum, kind) => sum + counts[kind], 0);
    expect(sevenSum).toBe(2);
  });

  it('规则集不可用返回 422，不返回空清单冒充成功', async () => {
    const get = harness(null);
    const { status, body } = await get('/rules');

    expect(status).toBe(422);
    expect(typeof body['error']).toBe('string');
  });

  it('真实规则集计数与 YAML 一致（71 / 45 / 26）', async () => {
    const file = resolveRuleSetFile();
    expect(file).not.toBeNull();
    const { ruleSet } = loadRuleRegistryFromFile(file as string);

    const get = harness(ruleSet);
    const { status, body } = await get('/rules');
    expect(status).toBe(200);

    const rules = body['rules'] as Array<{ category: string; mode: string }>;
    expect(rules).toHaveLength(71);
    expect(body['version']).toBe('1.0.0');
    expect(body['modeCounts']).toEqual({ static: 45, llm: 26 });

    const counts = body['counts'] as Record<string, number>;
    expect(counts['cross']).toBe(rules.filter((rule) => rule.category === 'cross').length);
    const sevenSum = RULE_ASSET_CATEGORIES.reduce((sum, kind) => sum + counts[kind], 0);
    expect(sevenSum).toBe(71 - counts['cross']);
  });
});
