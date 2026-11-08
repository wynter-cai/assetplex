/**
 * 治理建议合成测试（add-asset-governance L1）
 *
 * spec: specs/proactive-guidance.spec.md Scenario 2/3/7
 */

import { describe, it, expect } from 'vitest';
import { buildGovernanceSuggestions, type GovernanceSuggestionInput } from '../../../src/core/governance-suggestions.js';
import type { GovernanceHealth } from '../../../src/core/governance-health.js';

function healthOf(issueCounts: Record<string, number>, totalAssets = 20): GovernanceHealth {
  const dimensions = [
    { id: 'completeness' as const, weight: 0.3 },
    { id: 'quality' as const, weight: 0.3 },
    { id: 'distribution' as const, weight: 0.25 },
    { id: 'uniqueness' as const, weight: 0.15 },
  ].map(({ id, weight }) => ({
    id,
    weight,
    score: issueCounts[id] === 0 ? 100 : 60,
    evaluatedAssets: totalAssets,
    issueCount: issueCounts[id] ?? 0,
    topIssues: [],
  }));
  return {
    score: 80,
    grade: 'B',
    totalAssets,
    dimensions,
    qualityMode: 'mechanical-only',
    computedAt: '2026-11-08T00:00:00.000Z',
    cached: false,
  };
}

function inputOf(overrides: Partial<GovernanceSuggestionInput> = {}): GovernanceSuggestionInput {
  return {
    health: healthOf({ completeness: 12, quality: 6, distribution: 9, uniqueness: 0 }),
    duplicates: { mergeableGroupCount: 3, mergeableAssetCount: 4, grayGroupCount: 1 },
    aiConfigured: false,
    scanned: true,
    coverage: null,
    ...overrides,
  };
}

describe('buildGovernanceSuggestions', () => {
  it('最多 3 条可执行建议，按影响面降序，同类合并（Scenario 2）', () => {
    const result = buildGovernanceSuggestions(inputOf());
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions.map((item) => item.impact)).toEqual([12, 9, 6]);
    expect(result.suggestions.map((item) => item.id)).toEqual(['completeness', 'distribution', 'quality']);
    expect(result.suggestions.every((item) => item.executable)).toBe(true);
    expect(result.suggestions.every((item) => item.action.route !== '')).toBe(true);
  });

  it('灰区组不计入可执行建议；AI 未配置时给出说明口径且信息项最多 1 条（Scenario 7）', () => {
    const grayOnly = buildGovernanceSuggestions(
      inputOf({
        duplicates: { mergeableGroupCount: 0, mergeableAssetCount: 0, grayGroupCount: 4 },
        health: healthOf({}),
        coverage: { managedKindCount: 4, totalKindCount: 7 },
      }),
    );
    expect(grayOnly.suggestions.some((item) => item.id === 'duplicates')).toBe(false);
    expect(grayOnly.info).toHaveLength(1);
    expect(grayOnly.info[0]?.text).toContain('配置 AI');
  });

  it('无可做之事不硬凑（Scenario 3）', () => {
    const result = buildGovernanceSuggestions(
      inputOf({
        health: healthOf({}, 6),
        duplicates: { mergeableGroupCount: 0, mergeableAssetCount: 0, grayGroupCount: 0 },
        aiConfigured: true,
      }),
    );
    expect(result.suggestions).toEqual([]);
    expect(result.info).toEqual([]);
    expect(result.emptyMessage).toBe('状态良好，暂无需要处理的事项');
  });

  it('首屏结论式引导：有重复时主 CTA 去重复治理', () => {
    const result = buildGovernanceSuggestions(inputOf());
    expect(result.firstRun?.headline).toContain('扫到 20 个资产');
    expect(result.firstRun?.headline).toContain('6 个重复/近重复');
    expect(result.firstRun?.primary).toMatchObject({ label: '帮我收拾', route: '/duplicates' });
    expect(result.firstRun?.secondary.label).toBe('先看看');
  });

  it('家底干净时给高价值动作而非硬凑建议', () => {
    const result = buildGovernanceSuggestions(
      inputOf({
        health: healthOf({}, 6),
        duplicates: { mergeableGroupCount: 0, mergeableAssetCount: 0, grayGroupCount: 0 },
        aiConfigured: true,
      }),
    );
    expect(result.firstRun?.clean).toBe(true);
    expect(result.firstRun?.primary.route).toBe('/connections');
  });

  it('存在灰区组时首屏不说家底干净', () => {
    const result = buildGovernanceSuggestions(
      inputOf({
        health: healthOf({}, 6),
        duplicates: {
          mergeableGroupCount: 0,
          mergeableAssetCount: 0,
          grayGroupCount: 1,
          grayAssetCount: 2,
        },
        aiConfigured: true,
      }),
    );
    expect(result.firstRun?.clean).toBe(false);
    expect(result.firstRun?.headline).toContain('2 个重复/近重复');
  });
});
