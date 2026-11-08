/**
 * 一键整改计划测试（add-asset-governance I1）
 *
 * spec: specs/asset-health-score.spec.md Scenario 7
 * 计划是纯函数：聚合可修复项、不可修复项给原因、单批硬上限 20、估算模型调用次数，零写库。
 */

import { describe, it, expect } from 'vitest';
import {
  buildRemediationPlan,
  REMEDIATION_BATCH_LIMIT,
  type RemediationAssetInput,
} from '../../../src/core/governance-remediation.js';
import type { DiagnosisIssue, DoctorAssetKind } from '../../../src/core/types.js';

function issue(
  overrides: Partial<DiagnosisIssue> & { severity?: DiagnosisIssue['severity']; criterion?: string } = {},
): DiagnosisIssue {
  return {
    severity: overrides.severity ?? 'high',
    criterion: overrides.criterion ?? 'mechanical:description-empty',
    finding: overrides.finding ?? 'description 为空',
    suggestion: overrides.suggestion ?? '补一句什么时候用它',
    fixable: overrides.fixable ?? true,
  };
}

function asset(overrides: Partial<RemediationAssetInput> & { path?: string } = {}): RemediationAssetInput {
  const path = overrides.path ?? 'skills/demo-skill/SKILL.md';
  const kind: DoctorAssetKind = overrides.kind ?? 'skill';
  return {
    kind,
    hubRelativePath: path,
    name: overrides.name ?? path.split('/')[1] ?? 'demo-skill',
    issues: overrides.issues ?? [issue()],
    cached: overrides.cached ?? false,
    ...(overrides.external === undefined ? {} : { external: overrides.external }),
  };
}

describe('buildRemediationPlan — Scenario 7：先出计划', () => {
  it('12 个可修复问题分布在 9 个资产：按资产聚合，逐项给出问题与调用估算', () => {
    const assets: RemediationAssetInput[] = [];
    for (let i = 0; i < 9; i += 1) {
      const issues = i < 3 ? [issue(), issue({ severity: 'medium' })] : [issue()];
      assets.push(asset({ path: `skills/demo-skill-${i}/SKILL.md`, name: `demo-skill-${i}`, issues }));
    }
    const plan = buildRemediationPlan(assets, { now: () => '2026-11-08T00:00:00.000Z' });

    expect(plan.items).toHaveLength(9);
    expect(plan.totalAssets).toBe(9);
    expect(plan.items[0].issueIndexes).toHaveLength(2);
    expect(plan.items[0].issueSummary).toContain('等 2 项');
    expect(plan.items.every((item) => item.estimatedCalls === 1)).toBe(true);
    expect(plan.estimatedCalls).toBe(9);
    expect(plan.batchLimit).toBe(REMEDIATION_BATCH_LIMIT);
    expect(plan.truncated).toBe(false);
    expect(plan.generatedAt).toBe('2026-11-08T00:00:00.000Z');
  });

  it('缓存命中的资产标注不消耗模型调用', () => {
    const plan = buildRemediationPlan([
      asset({ path: 'skills/demo-skill-a/SKILL.md', cached: true }),
      asset({ path: 'skills/demo-skill-b/SKILL.md', cached: false }),
    ]);
    expect(plan.estimatedCalls).toBe(1);
    const cachedItem = plan.items.find((i) => i.hubRelativePath === 'skills/demo-skill-a/SKILL.md');
    expect(cachedItem?.cached).toBe(true);
    expect(cachedItem?.estimatedCalls).toBe(0);
  });

  it('不可修复项必须给原因，不能静默丢弃', () => {
    const plan = buildRemediationPlan([
      asset({
        path: 'skills/demo-skill-a/SKILL.md',
        issues: [issue({ fixable: false, criterion: 'criteria:clarity' })],
      }),
    ]);
    expect(plan.items).toHaveLength(0);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ hubRelativePath: 'skills/demo-skill-a/SKILL.md', reason: '仅建议，需人工判断' }),
    ]);
  });

  it('环境条目（未入库）不进入整改计划', () => {
    const plan = buildRemediationPlan([asset({ path: '../outside/demo.md', external: true })]);
    expect(plan.items).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain('环境条目');
  });

  it('超过 20 个资产：只勾选前 20，其余如实跳过并提示分批', () => {
    const assets: RemediationAssetInput[] = [];
    for (let i = 0; i < 25; i += 1) {
      assets.push(asset({ path: `skills/demo-skill-${String(i).padStart(2, '0')}/SKILL.md`, name: `demo-skill-${i}` }));
    }
    const plan = buildRemediationPlan(assets);
    expect(plan.items).toHaveLength(REMEDIATION_BATCH_LIMIT);
    expect(plan.truncated).toBe(true);
    expect(plan.skipped).toHaveLength(5);
    expect(plan.skipped.every((s) => s.reason.includes('单批上限'))).toBe(true);
  });

  it('maxAssets 可调但硬上限 20', () => {
    const assets = Array.from({ length: 30 }, (_, i) =>
      asset({ path: `skills/demo-skill-${i}/SKILL.md`, name: `demo-skill-${i}` }),
    );
    const plan = buildRemediationPlan(assets, { maxAssets: 50 });
    expect(plan.items).toHaveLength(REMEDIATION_BATCH_LIMIT);
    expect(plan.batchLimit).toBe(REMEDIATION_BATCH_LIMIT);
  });

  it('按维度筛选：完整性只取必填字段类问题', () => {
    const plan = buildRemediationPlan(
      [
        asset({
          path: 'skills/demo-skill-a/SKILL.md',
          issues: [issue({ criterion: 'mechanical:description-empty' }), issue({ criterion: 'criteria:clarity' })],
        }),
      ],
      { dimension: 'completeness' },
    );
    expect(plan.items[0].issueIndexes).toEqual([0]);
  });

  it('分发/唯一性维度没有可修复项：计划为空且不报错', () => {
    const plan = buildRemediationPlan([asset()], { dimension: 'distribution' });
    expect(plan.items).toHaveLength(0);
    expect(plan.estimatedCalls).toBe(0);
  });

  it('按最严重问题排序（high 在 medium 前）', () => {
    const plan = buildRemediationPlan([
      asset({ path: 'skills/demo-skill-a/SKILL.md', name: 'a-skill', issues: [issue({ severity: 'low' })] }),
      asset({ path: 'skills/demo-skill-b/SKILL.md', name: 'b-skill', issues: [issue({ severity: 'high' })] }),
    ]);
    expect(plan.items.map((i) => i.severity)).toEqual(['high', 'low']);
  });
});
