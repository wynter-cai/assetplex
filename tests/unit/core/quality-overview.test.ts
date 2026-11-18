/**
 * 质量中心概览聚类测试（refactor-governance-center T2）
 *
 * 纯函数：同一问题在多资产上合并成一条「问题类型」，
 * 影响面排序可解释，待处理总数与首页待办同源。
 */

import { describe, it, expect } from 'vitest';
import { buildQualityOverview, type QualityOverviewInput } from '../../../src/core/quality-overview.js';
import type { GovernanceHealth, HealthIssueRef } from '../../../src/core/governance-health.js';

function issue(overrides: Partial<HealthIssueRef> = {}): HealthIssueRef {
  return {
    id: 'quality:skills/demo-a/SKILL.md:mechanical:description-empty:0',
    severity: 'medium',
    title: 'description 为空',
    kind: 'skill',
    hubRelativePath: 'skills/demo-a/SKILL.md',
    assetName: 'demo-a',
    fixable: true,
    source: 'rule',
    ...overrides,
  };
}

function health(overrides: Partial<GovernanceHealth> = {}): GovernanceHealth {
  return {
    score: 72,
    grade: 'needs-attention',
    totalAssets: 18,
    dimensions: [],
    qualityMode: 'mechanical-only',
    computedAt: '2026-11-15T00:00:00.000Z',
    cached: false,
    ...overrides,
  };
}

function input(items: HealthIssueRef[], total = items.length): QualityOverviewInput {
  return {
    health: health(),
    queue: { total, bySeverity: { high: 0, medium: total, low: 0 }, items },
    coverage: {
      rulesVersion: 'v1',
      evaluatedRules: 71,
      skippedRules: 0,
      skippedReasons: [],
      noChannelRules: 11,
      ignoredCount: 0,
      aiConfigured: false,
      semanticEvaluated: false,
    },
    now: () => '2026-11-15T01:00:00.000Z',
  };
}

describe('buildQualityOverview', () => {
  it('同一问题标题跨资产合并：assetCount 去重、hitCount 计次、样例最多 3 条', () => {
    const items = [
      issue({ hubRelativePath: 'skills/demo-a/SKILL.md', assetName: 'demo-a' }),
      issue({
        id: 'quality:skills/demo-b/SKILL.md:mechanical:description-empty:0',
        hubRelativePath: 'skills/demo-b/SKILL.md',
        assetName: 'demo-b',
      }),
      issue({
        id: 'quality:skills/demo-c/SKILL.md:mechanical:description-empty:0',
        hubRelativePath: 'skills/demo-c/SKILL.md',
        assetName: 'demo-c',
      }),
      issue({
        id: 'quality:skills/demo-d/SKILL.md:mechanical:description-empty:0',
        hubRelativePath: 'skills/demo-d/SKILL.md',
        assetName: 'demo-d',
      }),
    ];
    const overview = buildQualityOverview(input(items));
    expect(overview.clusters).toHaveLength(1);
    const cluster = overview.clusters[0];
    expect(cluster.assetCount).toBe(4);
    expect(cluster.hitCount).toBe(4);
    expect(cluster.samples).toHaveLength(3);
    expect(cluster.keySource).toBe('title');
    expect(cluster.ruleId).toBeNull();
  });

  it('跨类别通用问题标 cross；影响面分按最高严重度加权', () => {
    const items = [
      issue({ severity: 'high', kind: 'identity', hubRelativePath: 'identity/a.md', assetName: 'a' }),
      issue({
        id: 'quality:rules/b.md:x:0',
        severity: 'low',
        kind: 'rule',
        hubRelativePath: 'rules/b.md',
        assetName: 'b',
      }),
    ];
    const cluster = buildQualityOverview(input(items)).clusters[0];
    expect(cluster.category).toBe('cross');
    expect(cluster.severity).toBe('high');
    expect(cluster.impactScore).toBe(6); // 2 个资产 × high 权重 3
    expect(cluster.severityDistribution).toEqual({ high: 1, medium: 0, low: 1 });
  });

  it('同分按标题稳定排序，结果不随输入顺序抖动', () => {
    const a = issue({ id: 'quality:x:a:0', title: 'B 问题', hubRelativePath: 'a.md', assetName: 'a' });
    const b = issue({ id: 'quality:y:b:0', title: 'A 问题', hubRelativePath: 'b.md', assetName: 'b' });
    const first = buildQualityOverview(input([a, b])).clusters.map((c) => c.title);
    const second = buildQualityOverview(input([b, a])).clusters.map((c) => c.title);
    expect(first).toEqual(['A 问题', 'B 问题']);
    expect(second).toEqual(first);
  });

  it('待处理总数取首页同源总数，不由聚类相加得出', () => {
    const overview = buildQualityOverview(input([issue()], 37));
    expect(overview.pendingTotal).toBe(37);
    expect(overview.sortRule).toBe('impact-desc-calls-asc');
  });

  it('深链带库内相对路径并编码；不可映射类别回退 /vault', () => {
    const overview = buildQualityOverview(
      input([
        issue({ hubRelativePath: 'rules/含 空格.md', kind: 'rule', title: '规则缺触发描述' }),
        issue({
          id: 'quality:c.md:x:0',
          kind: 'command',
          hubRelativePath: 'commands/c.md',
          assetName: 'c',
          title: '命令缺示例',
        }),
      ]),
    );
    const links = overview.clusters.map((cluster) => cluster.samples[0].deepLink);
    expect(links).toContain(`/vault/rule?asset=${encodeURIComponent('rules/含 空格.md')}`);
    expect(links).toContain('/vault');
  });

  it('空库存：不造聚类，覆盖度照实披露', () => {
    const overview = buildQualityOverview(input([], 0));
    expect(overview.clusters).toEqual([]);
    expect(overview.pendingTotal).toBe(0);
    expect(overview.coverage.rulesVersion).toBe('v1');
    expect(overview.cached).toBe(false);
  });
});
