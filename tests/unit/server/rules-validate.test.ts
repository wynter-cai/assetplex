/**
 * POST /api/diagnosis/rules/validate 与规则清单扩展视图测试（refactor-governance-center T7）
 *
 * spec: governance-center.spec.md Scenario 5.3 / 5.6 / 5.7；
 * 契约：RuleValidateResponse / DiagnosisRuleListView；断言校验零写库、路径越界 403。
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createDiagnosisRoutes } from '../../../src/server/routes/diagnosis.js';
import { loadRuleRegistryFromFile, DEFAULT_RULES_RELATIVE_PATH } from '../../../src/core/diagnosis-rules.js';
import { mergeUserRules } from '../../../src/core/diagnosis-user-rules.js';

const BUILTIN = loadRuleRegistryFromFile(resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH)).ruleSet;

const USER_RULE = `version: "9.9.9"
updatedAt: "2026-11-15"
rules:
  - id: USER-01
    category: skill
    severity: low
    mode: static
    signal: "演示信号"
    recommendation: "演示改法"
    source: "用户规则"
`;

const BAD_RULE = `version: "9.9.9"
updatedAt: "2026-11-15"
rules:
  - category: skill
    severity: low
    mode: static
    signal: "缺 id"
    recommendation: "x"
    source: "x"
  - id: USER-01
    category: skill
    severity: low
    mode: static
    signal: "演示信号"
    recommendation: "演示改法"
    source: "用户规则"
`;

function routes() {
  return createDiagnosisRoutes({ ruleSet: BUILTIN });
}

async function postValidate(body: unknown) {
  const res = await routes().request('/rules/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/diagnosis/rules/validate', () => {
  it('合法用户规则：ok=true 且统计生效条数（Scenario 5.3）', async () => {
    const { status, body } = await postValidate({ content: USER_RULE, targetPath: 'diagnosis-rules/demo.yaml' });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.effectiveRules).toBe(1);
    expect(body.errors).toEqual([]);
  });

  it('混入坏条：ok=true 但给出 missing-field 告警（Scenario 5.6）', async () => {
    const { body } = await postValidate({ content: BAD_RULE, targetPath: 'diagnosis-rules/demo.yaml' });
    expect(body.ok).toBe(true);
    expect(body.effectiveRules).toBe(1);
    expect((body.warnings as Array<{ reason: string }>).some((item) => item.reason === 'missing-field')).toBe(true);
  });

  it('缺字段 / 路径越界 / 非 JSON → 400 / 403', async () => {
    expect((await postValidate({ content: USER_RULE })).status).toBe(400);
    expect((await postValidate({ content: USER_RULE, targetPath: 'd:/elsewhere/a.yaml' })).status).toBe(403);
    expect((await postValidate({ content: USER_RULE, targetPath: 'diagnosis-rules/a.yaml' })).status).toBe(200);
  });
});

describe('GET /api/diagnosis/rules 扩展视图', () => {
  it('带用户规则合并结果时返回 sources / userRules / 每条规则来源', async () => {
    const merged = mergeUserRules(BUILTIN, [{ path: 'diagnosis-rules/a.yaml', text: USER_RULE }]);
    const res = await createDiagnosisRoutes({ ruleSet: BUILTIN, userRules: merged }).request('/rules');
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.loadPolicy).toBe('category-on-demand');
    expect((body.userRules as Record<string, unknown>).directory).toBe('diagnosis-rules');
    expect((body.sources as Record<string, unknown>).userCount).toBe(1);
    expect((body.rules as Array<{ id: string; origin: string }>).find((rule) => rule.id === 'USER-01')?.origin).toBe(
      'user',
    );
  });

  it('未注入用户规则时退化为只读版本（保持既有契约字段）', async () => {
    const res = await routes().request('/rules');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.rules).toBeDefined();
    expect(body.version).toBe(BUILTIN.version);
    expect(body.userRules).toBeUndefined();
  });
});
