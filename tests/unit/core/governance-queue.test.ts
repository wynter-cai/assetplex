/**
 * 待办队列跨维度去重收集（refactor-home-action-panel T2）
 *
 * spec: specs/home-dashboard.spec.md Requirement 2 Scenario 2.5（去重口径）/
 * Scenario 2.1（严重度排序 + 前 N 条，total 为全量）
 *
 * 去重键 = 维度族 + Hub 相对路径 + 检查项 + 发现内容：
 * 规范性维度包含全部机械项，与完整性维度直接相加会重复计数，
 * 因此「待治理」不得等于四维 issueCount 之和。
 */

import { describe, it, expect } from 'vitest';
import {
  collectDimensionIssues,
  collectGovernanceQueue,
  HEALTH_DIMENSION_IDS,
  type GovernanceAssetInput,
  type HealthDuplicateGroup,
} from '../../../src/core/governance-health.js';
import type { DiagnosisIssue } from '../../../src/core/types.js';
import type { AssetDistributionInfo } from '../../../src/core/distribution-status.js';

const EMPTY_DESC: DiagnosisIssue = {
  severity: 'high',
  criterion: 'mechanical:description-empty',
  finding: 'description 为空：触发时机与适用范围是模型选读本资产的第一依据',
  suggestion: '补一句「做什么 + 何时用」的清晰描述',
  fixable: true,
};

const TOO_LONG: DiagnosisIssue = {
  severity: 'medium',
  criterion: 'mechanical:body-over-length',
  finding: '正文 9000 字符，超过该类别 8000 字符阈值',
  suggestion: '精简正文',
  fixable: true,
};

const SEMANTIC: DiagnosisIssue = {
  severity: 'high',
  criterion: 'criteria:clarity',
  finding: '边界描述含糊',
  suggestion: '补一句不适用场景',
  fixable: true,
};

function distribution(
  toolId: string,
  status: AssetDistributionInfo['status'],
): AssetDistributionInfo {
  return { toolId, toolName: `${toolId} 工具`, status };
}

function asset(input: {
  path: string;
  name: string;
  mechanicalIssues?: DiagnosisIssue[];
  semanticIssues?: DiagnosisIssue[];
  distributions?: AssetDistributionInfo[];
}): GovernanceAssetInput {
  return {
    kind: 'skill',
    hubRelativePath: input.path,
    name: input.name,
    mechanicalIssues: input.mechanicalIssues ?? [],
    semanticIssues: input.semanticIssues ?? [],
    semanticEvaluated: (input.semanticIssues ?? []).length > 0,
    distributions: input.distributions ?? [],
  };
}

const ALPHA = asset({
  path: 'skills/alpha/SKILL.md',
  name: 'alpha',
  mechanicalIssues: [EMPTY_DESC, TOO_LONG],
  semanticIssues: [SEMANTIC],
});

const BETA = asset({
  path: 'skills/beta/SKILL.md',
  name: 'beta',
  distributions: [distribution('tool-a', 'pending'), distribution('tool-b', 'conflict')],
});

const GAMMA = asset({ path: 'skills/gamma/SKILL.md', name: 'gamma' });

const DUPLICATE_GROUP: HealthDuplicateGroup = {
  id: 'demo-dup',
  kind: 'near',
  members: [
    { hubRelativePath: 'skills/beta/SKILL.md', name: 'beta', kind: 'skill' },
    { hubRelativePath: 'skills/gamma/SKILL.md', name: 'gamma', kind: 'skill' },
  ],
};

const ASSETS = [ALPHA, BETA, GAMMA];
const GROUPS = [DUPLICATE_GROUP];

describe('collectGovernanceQueue', () => {
  it('同一条机械项只计一次：完整性 ∩ 规范性去重后小于四维之和', () => {
    const sumOfDimensions = HEALTH_DIMENSION_IDS.reduce(
      (sum, dimension) => sum + collectDimensionIssues(ASSETS, GROUPS, dimension).length,
      0,
    );
    const queue = collectGovernanceQueue(ASSETS, GROUPS, 20);

    // 四维：完整性 1 + 规范性 3 + 分发一致性 2 + 唯一性 1 = 7，去重后 6
    expect(sumOfDimensions).toBe(7);
    expect(queue.total).toBe(6);
    expect(queue.items).toHaveLength(6);

    const titles = queue.items.map((item) => item.title);
    expect(titles.filter((title) => title === EMPTY_DESC.finding)).toHaveLength(1);
  });

  it('按 high → medium → low 排序，同级按资产名', () => {
    const queue = collectGovernanceQueue(ASSETS, GROUPS, 20);
    expect(queue.items.map((item) => item.severity)).toEqual([
      'high',
      'high',
      'high',
      'medium',
      'medium',
      'medium',
    ]);
    expect(queue.items.slice(0, 3).map((item) => item.assetName)).toEqual(['alpha', 'alpha', 'beta']);
  });

  it('bySeverity 与去重后的条目一一对应', () => {
    const queue = collectGovernanceQueue(ASSETS, GROUPS, 20);
    expect(queue.bySeverity).toEqual({ high: 3, medium: 3, low: 0 });
  });

  it('截断只影响 items，不改变 total 与 bySeverity', () => {
    const queue = collectGovernanceQueue(ASSETS, GROUPS, 2);
    expect(queue.items).toHaveLength(2);
    expect(queue.total).toBe(6);
    expect(queue.bySeverity).toEqual({ high: 3, medium: 3, low: 0 });
    expect(queue.items[0].severity).toBe('high');
  });

  it('limit=0 时 items 为空，但 total 仍为全量', () => {
    const queue = collectGovernanceQueue(ASSETS, GROUPS, 0);
    expect(queue.items).toEqual([]);
    expect(queue.total).toBe(6);
  });

  it('空集：total=0、bySeverity 全 0、items 为空（不伪造待办）', () => {
    const queue = collectGovernanceQueue([], [], 5);
    expect(queue).toEqual({ total: 0, bySeverity: { high: 0, medium: 0, low: 0 }, items: [] });
  });

  it('dataMissing 资产不参与收集', () => {
    const broken = { ...asset({ path: 'skills/broken/SKILL.md', name: 'broken' }), dataMissing: true };
    const queue = collectGovernanceQueue([broken], [], 5);
    expect(queue.total).toBe(0);
  });
});
