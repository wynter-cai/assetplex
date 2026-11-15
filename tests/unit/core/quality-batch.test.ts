/**
 * 跨类别批量诊断预估纯函数测试（refactor-governance-center T4）
 *
 * spec: specs/governance-center.spec.md Requirement 3 / Scenario 3.1–3.2、8.2；
 * api-contract: BatchDiagnoseEstimate。
 * 零模型零 IO：规则集读仓库定义，资产内容与缓存命中全由测试注入。
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadRuleRegistryFromFile, DEFAULT_RULES_RELATIVE_PATH } from '../../../src/core/diagnosis-rules.js';
import {
  BATCH_CONFIRM_ABOVE_CALLS,
  BATCH_HARD_MAX_CALLS,
  BATCH_MAX_ASSETS,
  estimateBatchDiagnosis,
  filterCandidatesByRuleIds,
  ruleCoverageByKind,
  type BatchDiagnoseCandidate,
} from '../../../src/core/quality-batch.js';

const RULE_SET = loadRuleRegistryFromFile(resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH)).ruleSet;

const GOOD = '---\nname: demo-a\ndescription: Use when 用户要导出 CSV。\n---\n正文\n';
const BAD_DESC = '---\nname: demo-b\ndescription: ""\n---\n正文\n';

function candidate(path: string, content: string | null, kind: BatchDiagnoseCandidate['kind'] = 'skill'): BatchDiagnoseCandidate {
  return { kind, hubRelativePath: path, content, hubInternal: true };
}

describe('filterCandidatesByRuleIds', () => {
  const candidates = [candidate('skills/a/SKILL.md', GOOD), candidate('skills/b/SKILL.md', BAD_DESC)];

  it('只留命中指定规则的资产（SK-03 = description 缺失触发子句）', () => {
    const selected = filterCandidatesByRuleIds(RULE_SET, ['SK-03'], candidates);
    expect(selected.map((item) => item.hubRelativePath)).toEqual(['skills/b/SKILL.md']);
  });

  it('空 ruleIds = 不按规则过滤；未知规则编号 = 空集（不放大范围）', () => {
    expect(filterCandidatesByRuleIds(RULE_SET, [], candidates)).toHaveLength(2);
    expect(filterCandidatesByRuleIds(RULE_SET, ['NOPE-99'], candidates)).toHaveLength(0);
  });

  it('不可读资产不参与规则圈选', () => {
    const withGhost = [...candidates, candidate('skills/c/SKILL.md', null)];
    expect(filterCandidatesByRuleIds(RULE_SET, ['SK-03'], withGhost)).toHaveLength(1);
  });
});

describe('estimateBatchDiagnosis', () => {
  it('混合选择：可诊断计数、缓存命中、需调用与不可诊断明细分开报', () => {
    const estimate = estimateBatchDiagnosis({
      ruleSet: RULE_SET,
      candidates: [
        candidate('skills/a/SKILL.md', GOOD),
        candidate('skills/b/SKILL.md', BAD_DESC),
        candidate('skills/ghost/SKILL.md', null),
        { kind: 'skill', hubRelativePath: 'd:/elsewhere/SKILL.md', content: null, hubInternal: false },
      ],
      aiConfigured: true,
      isCached: ({ content }) => content === GOOD,
      now: () => '2026-11-15T00:00:00.000Z',
    });

    expect(estimate.totalAssets).toBe(2);
    expect(estimate.cacheHits).toBe(1);
    expect(estimate.willCall).toBe(1);
    expect(estimate.unDiagnosable).toEqual([
      { hubRelativePath: 'skills/ghost/SKILL.md', kind: 'skill', reason: 'unreadable' },
      { hubRelativePath: 'd:/elsewhere/SKILL.md', kind: 'skill', reason: 'env-asset' },
    ]);
    expect(estimate.estimatedAt).toBe('2026-11-15T00:00:00.000Z');
    expect(estimate.limits).toEqual({
      maxAssets: BATCH_MAX_ASSETS,
      confirmAboveCalls: BATCH_CONFIRM_ABOVE_CALLS,
      hardMaxCalls: BATCH_HARD_MAX_CALLS,
    });
  });

  it('AI 未配置：willCall=0、cacheHits=0，语义规则计入 semanticSkipped（Scenario 3.2 / 8.2）', () => {
    const estimate = estimateBatchDiagnosis({
      ruleSet: RULE_SET,
      candidates: [candidate('skills/a/SKILL.md', GOOD)],
      aiConfigured: false,
      isCached: () => true,
    });

    expect(estimate.willCall).toBe(0);
    expect(estimate.cacheHits).toBe(0);
    expect(estimate.semanticSkipped).toBeGreaterThan(0);
    // 静态规则仍会跑：覆盖度里 evaluated 不为 0
    expect(estimate.ruleCoverage[0]?.evaluatedRules).toBeGreaterThan(0);
    expect(estimate.rulesVersion).toBe(RULE_SET.version);
  });

  it('零资产：覆盖度为空数组，不编造类别（Scenario 2.4）', () => {
    const estimate = estimateBatchDiagnosis({ ruleSet: RULE_SET, candidates: [], aiConfigured: true, isCached: () => false });
    expect(estimate.totalAssets).toBe(0);
    expect(estimate.ruleCoverage).toEqual([]);
  });
});

describe('ruleCoverageByKind', () => {
  it('按类别只计适用规则；语义规则在未配置 AI 时计入跳过', () => {
    const withAi = ruleCoverageByKind(RULE_SET, ['skill'], true);
    const withoutAi = ruleCoverageByKind(RULE_SET, ['skill'], false);
    const evaluatedWithAi = withAi[0]?.evaluatedRules ?? 0;
    const evaluatedWithoutAi = withoutAi[0]?.evaluatedRules ?? 0;
    // 技能类：静止规则 8 条 + 通用规则；语义规则 7 条在无 AI 时转成跳过
    expect(evaluatedWithoutAi).toBeGreaterThan(0);
    expect(withoutAi[0]?.skippedRules).toBe(evaluatedWithAi - evaluatedWithoutAi);
    expect(withoutAi[0]?.skippedRules).toBeGreaterThan(0);
  });
});
