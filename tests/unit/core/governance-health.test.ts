/**
 * 真实健康分测试（add-asset-governance H1）
 *
 * spec: 设计文档/changes/add-asset-governance/specs/asset-health-score.spec.md
 * Scenario 1（分数与资产数量无关，完整性扣分最多）/ 2（全部达标给高置信正反馈）/
 * 4（维度缺失不扣分、权重归一化）＋ 边界（零资产不显示 0 分、数据缺失降级）。
 * 纯函数测试：全部输入手工构造，不碰文件系统、不调模型。
 */

import { describe, it, expect } from 'vitest';
import {
  computeGovernanceHealth,
  type GovernanceAssetInput,
  type HealthDuplicateGroup,
} from '../../../src/core/governance-health.js';
import type { AssetDistributionInfo } from '../../../src/core/distribution-status.js';
import type { DiagnosisIssue, DiagnosisSeverity, DoctorAssetKind } from '../../../src/core/types.js';

function issue(severity: DiagnosisSeverity, criterion: string, fixable = true): DiagnosisIssue {
  return { severity, criterion, finding: `${criterion} 的发现`, suggestion: '按建议改', fixable };
}

function dist(status: AssetDistributionInfo['status'], toolId = 'demo-tool'): AssetDistributionInfo {
  return { toolId, toolName: 'Demo Tool', status };
}

interface AssetOverrides {
  kind?: DoctorAssetKind;
  hubRelativePath?: string;
  name?: string;
  mechanicalIssues?: DiagnosisIssue[];
  semanticIssues?: DiagnosisIssue[];
  semanticEvaluated?: boolean;
  distributions?: AssetDistributionInfo[];
  dataMissing?: boolean;
}

function asset(overrides: AssetOverrides = {}): GovernanceAssetInput {
  const kind = overrides.kind ?? 'skill';
  const path = overrides.hubRelativePath ?? `skills/demo-${kind}/SKILL.md`;
  return {
    kind,
    hubRelativePath: path,
    name: overrides.name ?? `demo-${kind}`,
    mechanicalIssues: overrides.mechanicalIssues ?? [],
    semanticIssues: overrides.semanticIssues ?? [],
    semanticEvaluated: overrides.semanticEvaluated ?? true,
    distributions: overrides.distributions ?? [],
    dataMissing: overrides.dataMissing ?? false,
  };
}

/** 合格技能：无问题、已同步、已评估 */
function goodSkill(index: number, distributions: AssetDistributionInfo[] = []): GovernanceAssetInput {
  return asset({
    hubRelativePath: `skills/demo-skill-${index}/SKILL.md`,
    name: `demo-skill-${index}`,
    distributions,
  });
}

function exactGroup(id: string, paths: Array<{ path: string; name: string }>): HealthDuplicateGroup[] {
  return [
    {
      id,
      kind: 'exact',
      members: paths.map((p) => ({ hubRelativePath: p.path, name: p.name, kind: 'skill' as const })),
    },
  ];
}

describe('computeGovernanceHealth — Scenario 1：分数与资产数量无关', () => {
  /** 30 个技能，20 个 description 为空；库内没有身份资产；未接入任何工具 */
  function scenarioOneAssets(): GovernanceAssetInput[] {
    const list: GovernanceAssetInput[] = [];
    for (let i = 0; i < 30; i += 1) {
      const failing = i < 20;
      list.push(
        asset({
          hubRelativePath: `skills/demo-skill-${i}/SKILL.md`,
          name: `demo-skill-${i}`,
          mechanicalIssues: failing ? [issue('high', 'mechanical:description-empty')] : [],
        }),
      );
    }
    return list;
  }

  it('健康分 ≤ 60，且「完整性」是扣分最多的维度', () => {
    const health = computeGovernanceHealth({
      assets: scenarioOneAssets(),
      aiConfigured: false,
      now: () => '2026-11-08T00:00:00.000Z',
    });

    expect(health.totalAssets).toBe(30);
    expect(health.score).toBeLessThanOrEqual(60);
    expect(health.grade).toBe('at-risk');

    const applicable = health.dimensions.filter((d) => d.applicability === 'applicable');
    const completeness = health.dimensions.find((d) => d.id === 'completeness');
    expect(completeness?.score).not.toBeNull();
    const lowest = Math.min(...applicable.map((d) => d.score ?? 100));
    expect(completeness?.score).toBe(lowest);
    expect(completeness?.issueCount).toBeGreaterThan(0);
  });

  it('再新增 10 个同样不合格的资产，分数不上升', () => {
    const base = computeGovernanceHealth({ assets: scenarioOneAssets(), aiConfigured: false });
    const more = scenarioOneAssets();
    for (let i = 30; i < 40; i += 1) {
      more.push(
        asset({
          hubRelativePath: `skills/demo-skill-${i}/SKILL.md`,
          name: `demo-skill-${i}`,
          mechanicalIssues: [issue('high', 'mechanical:description-empty')],
        }),
      );
    }
    const grown = computeGovernanceHealth({ assets: more, aiConfigured: false });
    expect(grown.score).toBeLessThanOrEqual(base.score);
  });

  it('AI 未配置时 qualityMode=mechanical-only', () => {
    const health = computeGovernanceHealth({ assets: scenarioOneAssets(), aiConfigured: false });
    expect(health.qualityMode).toBe('mechanical-only');
  });
});

describe('computeGovernanceHealth — Scenario 2：全部达标', () => {
  it('分数 ≥ 90、grade=excellent、无任何问题项', () => {
    const health = computeGovernanceHealth({
      assets: [
        asset({ kind: 'identity', hubRelativePath: 'identity/profile.md', name: 'profile' }),
        goodSkill(1, [dist('synced')]),
        goodSkill(2, [dist('synced')]),
      ],
      aiConfigured: true,
      now: () => '2026-11-08T00:00:00.000Z',
    });

    expect(health.score).toBeGreaterThanOrEqual(90);
    expect(health.grade).toBe('excellent');
    expect(health.dimensions.every((d) => d.issueCount === 0)).toBe(true);
    expect(health.qualityMode).toBe('mechanical+ai');
    expect(health.cached).toBe(false);
    expect(health.computedAt).toBe('2026-11-08T00:00:00.000Z');
  });
});

describe('computeGovernanceHealth — Scenario 4：维度缺失不扣分', () => {
  const assets = [
    asset({ kind: 'identity', hubRelativePath: 'identity/profile.md', name: 'profile' }),
    goodSkill(1),
    goodSkill(2),
  ];

  it('无任何工具接入：分发一致性标「不适用」，权重剔除且总分不被压低', () => {
    const health = computeGovernanceHealth({ assets, aiConfigured: true });
    const distribution = health.dimensions.find((d) => d.id === 'distribution');

    expect(distribution?.applicability).toBe('not-applicable');
    expect(distribution?.score).toBeNull();
    expect(distribution?.effectiveWeight).toBe(0);
    expect(health.score).toBe(100);

    const effectiveTotal = health.dimensions.reduce((sum, d) => sum + d.effectiveWeight, 0);
    expect(effectiveTotal).toBe(75); // 30 + 30 + 15，声明权重仍保留
    expect(health.dimensions.find((d) => d.id === 'completeness')?.weight).toBe(30);
  });

  it('工具已接入但资产不接收该类资产时同样判「不适用」，不伪造 0 分', () => {
    const health = computeGovernanceHealth({
      assets: [goodSkill(1, [dist('not_enabled')]), goodSkill(2, [dist('not_installed')])],
      aiConfigured: true,
    });
    const distribution = health.dimensions.find((d) => d.id === 'distribution');
    expect(distribution?.applicability).toBe('not-applicable');
    expect(distribution?.score).toBeNull();
  });
});

describe('computeGovernanceHealth — 边界与降级', () => {
  it('零资产：score=0、grade=empty、所有维度不适用（不在前端展示 0 分）', () => {
    const health = computeGovernanceHealth({ assets: [], aiConfigured: false });
    expect(health.totalAssets).toBe(0);
    expect(health.score).toBe(0);
    expect(health.grade).toBe('empty');
    for (const dimension of health.dimensions) {
      expect(dimension.applicability).toBe('not-applicable');
      expect(dimension.score).toBeNull();
    }
  });

  it('某维度数据缺失：标 data-missing、score=null，其余维度权重归一化', () => {
    const health = computeGovernanceHealth({
      assets: [
        asset({ kind: 'identity', hubRelativePath: 'identity/profile.md', name: 'profile' }),
        goodSkill(1, [dist('synced')]),
      ],
      aiConfigured: true,
      dataMissingDimensions: ['quality'],
    });
    const quality = health.dimensions.find((d) => d.id === 'quality');
    expect(quality?.applicability).toBe('data-missing');
    expect(quality?.score).toBeNull();
    expect(health.score).toBe(100);
    expect(health.dimensions.reduce((sum, d) => sum + d.effectiveWeight, 0)).toBe(70); // 30+25+15
  });

  it('重复条目按唯一性扣分（完全重复权重高于近重复）', () => {
    const assets = [
      asset({ kind: 'identity', hubRelativePath: 'identity/profile.md', name: 'profile' }),
      goodSkill(1),
      goodSkill(2),
      goodSkill(3),
      goodSkill(4),
    ];
    const exact = computeGovernanceHealth({
      assets,
      duplicateGroups: exactGroup('dup-1', [
        { path: 'skills/demo-skill-1/SKILL.md', name: 'demo-skill-1' },
        { path: 'skills/demo-skill-2/SKILL.md', name: 'demo-skill-2' },
      ]),
      aiConfigured: true,
    });
    const near = computeGovernanceHealth({
      assets,
      duplicateGroups: [{ ...exactGroup('dup-near', [
        { path: 'skills/demo-skill-1/SKILL.md', name: 'demo-skill-1' },
        { path: 'skills/demo-skill-2/SKILL.md', name: 'demo-skill-2' },
      ])[0], kind: 'near' }],
      aiConfigured: true,
    });

    const exactDim = exact.dimensions.find((d) => d.id === 'uniqueness');
    const nearDim = near.dimensions.find((d) => d.id === 'uniqueness');
    expect(exactDim?.score ?? 0).toBeLessThan(nearDim?.score ?? 0);
    expect(exactDim?.issueCount).toBeGreaterThan(0);
  });

  it('topIssues 最多 5 条、按 high → medium → low 排序', () => {
    const many = [
      issue('low', 'mechanical:shouting-rules'),
      issue('high', 'mechanical:description-empty'),
      issue('medium', 'mechanical:body-over-length'),
      issue('low', 'criteria:demo-low'),
      issue('medium', 'criteria:demo-medium'),
      issue('high', 'criteria:demo-high', false),
    ];
    const health = computeGovernanceHealth({
      assets: [asset({ mechanicalIssues: many })],
      aiConfigured: true,
    });
    const quality = health.dimensions.find((d) => d.id === 'quality');
    expect(quality?.issueCount).toBe(6);
    expect(quality?.topIssues).toHaveLength(5);
    const ranks = quality?.topIssues.map((i) => ({ high: 0, medium: 1, low: 2 })[i.severity]) ?? [];
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('问题项带上资产定位信息，供下钻跳转', () => {
    const health = computeGovernanceHealth({
      assets: [
        asset({
          hubRelativePath: 'skills/demo-skill-a/SKILL.md',
          name: 'demo-skill-a',
          mechanicalIssues: [issue('high', 'mechanical:description-empty')],
        }),
      ],
      aiConfigured: true,
    });
    const completeness = health.dimensions.find((d) => d.id === 'completeness');
    expect(completeness?.topIssues[0]).toMatchObject({
      kind: 'skill',
      assetName: 'demo-skill-a',
      hubRelativePath: 'skills/demo-skill-a/SKILL.md',
      fixable: true,
      severity: 'high',
    });
    expect(completeness?.topIssues[0].id.length).toBeGreaterThan(0);
  });

  it('数据缺失的资产不参与计分，但计入总数', () => {
    const health = computeGovernanceHealth({
      assets: [
        asset({ kind: 'identity', hubRelativePath: 'identity/profile.md', name: 'profile' }),
        goodSkill(1),
        asset({ hubRelativePath: 'skills/demo-broken/SKILL.md', dataMissing: true }),
      ],
      aiConfigured: true,
    });
    expect(health.totalAssets).toBe(3);
    expect(health.score).toBe(100);
    expect(health.dimensions.find((d) => d.id === 'completeness')?.evaluatedAssets).toBe(2);
  });
});
