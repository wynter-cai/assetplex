/**
 * POST /api/governance/diagnose/estimate 测试（refactor-governance-center T4）
 *
 * spec: specs/governance-center.spec.md Requirement 3 / Scenario 3.1–3.2 / 8.2；
 * api-contract: BatchDiagnoseEstimate；错误约定 400 / 422 / 503。
 * 全依赖注入：假 Hub 文件、内存诊断缓存、显式规则集；断言不发起任何模型调用。
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createGovernanceRoutes, type GovernanceRouteDeps } from '../../../src/server/routes/governance.js';
import { loadRuleRegistryFromFile, DEFAULT_RULES_RELATIVE_PATH } from '../../../src/core/diagnosis-rules.js';
import { computeDoctorCacheKey, hashRuleSet, type DoctorCacheEntry } from '../../../src/core/doctor-cache.js';
import type { AiConfigStore } from '../../../src/core/ai-config.js';

const RULE_SET = loadRuleRegistryFromFile(resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH)).ruleSet;
const GOOD = '---\nname: demo-a\ndescription: Use when 用户要导出 CSV。\n---\n正文\n';
const BAD_DESC = '---\nname: demo-b\ndescription: ""\n---\n正文\n';

interface HarnessOptions {
  files?: Record<string, string | null>;
  aiConfigured?: boolean;
  cacheEntries?: Record<string, DoctorCacheEntry>;
  ruleSet?: unknown;
}

function harness(opts: HarnessOptions = {}) {
  const files = opts.files ?? {};
  const aiConfigured = opts.aiConfigured ?? false;
  const store: AiConfigStore = {
    load: () => ({ baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model' }),
    save: () => undefined,
  };
  const deps: GovernanceRouteDeps = {
    listAssets: () => Object.keys(files),
    read: (path) => files[path] ?? null,
    distributions: () => [],
    aiConfigured: () => aiConfigured,
    aiConfigStore: store,
    duplicateGroups: () => [],
    libraryCount: () => Object.keys(files).length,
    now: () => '2026-11-15T00:00:00.000Z',
    doctorCache: { load: () => ({ ...(opts.cacheEntries ?? {}) }), save: () => undefined },
    ...(opts.ruleSet === undefined ? {} : { ruleSet: opts.ruleSet as never }),
    remediation: { recordActivity: () => {} },
    duplicates: { recordActivity: () => {} },
  };
  const routes = createGovernanceRoutes(deps);
  const post = async (body: unknown) => {
    const response = await routes.request('/diagnose/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { post };
}

function cachedEntry(): DoctorCacheEntry {
  return {
    findings: [],
    rejected: 0,
    candidateCount: 7,
    model: 'demo-model',
    rulesVersion: RULE_SET.version,
    generatedAt: '2026-11-14T00:00:00.000Z',
  };
}

const CACHED_KEY = computeDoctorCacheKey({
  kind: 'skill',
  content: GOOD,
  rulesHash: hashRuleSet(RULE_SET),
  model: 'demo-model',
});

describe('POST /api/governance/diagnose/estimate', () => {
  it('混合圈选：可诊断总数、缓存命中、需调用拆分，不可读资产单列原因', async () => {
    const { post } = harness({
      files: { 'skills/a/SKILL.md': GOOD, 'skills/b/SKILL.md': BAD_DESC, 'skills/c/SKILL.md': null },
      aiConfigured: true,
      cacheEntries: { [CACHED_KEY]: cachedEntry() },
    });
    const { status, body } = await post({ kinds: ['skill'] });

    expect(status).toBe(200);
    expect(body.totalAssets).toBe(2);
    expect(body.cacheHits).toBe(1);
    expect(body.willCall).toBe(1);
    expect(body.unDiagnosable).toEqual([{ hubRelativePath: 'skills/c/SKILL.md', kind: 'skill', reason: 'unreadable' }]);
    expect(body.rulesVersion).toBe(RULE_SET.version);
  });

  it('AI 未配置：willCall=0、cacheHits=0、语义跳过计数非零（Scenario 8.2）', async () => {
    const { post } = harness({ files: { 'skills/a/SKILL.md': GOOD } });
    const { status, body } = await post({ kinds: ['skill'] });

    expect(status).toBe(200);
    expect(body.willCall).toBe(0);
    expect(body.cacheHits).toBe(0);
    expect(body.semanticSkipped).toBeGreaterThan(0);
  });

  it('规则编号圈选只留命中资产（SK-03 = description 缺触发子句）', async () => {
    const { post } = harness({ files: { 'skills/a/SKILL.md': GOOD, 'skills/b/SKILL.md': BAD_DESC } });
    const { body } = await post({ kinds: ['skill'], ruleIds: ['SK-03'] });

    expect(body.totalAssets).toBe(1);
    expect(body.unDiagnosable).toEqual([]);
  });

  it('未知类别 / 非数组 → 400', async () => {
    const { post } = harness();
    expect((await post({ kinds: ['mcp'] })).status).toBe(400);
    expect((await post({ kinds: 'skill' })).status).toBe(400);
  });

  it('规则集未加载 → 503（如实报错，不返回假预估）', async () => {
    const { post } = harness({ ruleSet: null });
    expect((await post({})).status).toBe(503);
  });

  it('规则集校验失败 → 422', async () => {
    const { post } = harness({ ruleSet: { version: '', rules: [{ id: 'bad' }] } });
    expect((await post({})).status).toBe(422);
  });
});
