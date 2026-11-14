import { describe, it, expect } from 'vitest';
import { countBySeverity, groupHealthIssues } from './issue-groups';
import type { IssueWithDimension } from './issue-groups';

function issue(overrides: Partial<IssueWithDimension> = {}): IssueWithDimension {
  return {
    id: 'issue-1',
    severity: 'high',
    title: 'frontmatter 缺失必填字段：name',
    kind: 'skill',
    hubRelativePath: 'skills/demo/SKILL.md',
    assetName: 'demo',
    fixable: false,
    dimensionLabel: '规范性',
    ...overrides,
  };
}

describe('体检问题分组', () => {
  it('同类问题聚合成一组，保留全部资产与最高严重度', () => {
    const groups = groupHealthIssues([
      issue({ id: 'a', assetName: 'research', severity: 'medium' }),
      issue({ id: 'b', assetName: 'research-deep', severity: 'high' }),
      issue({ id: 'c', title: '规则过长', kind: 'rule', assetName: 'global' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe('frontmatter 缺失必填字段：name');
    expect(groups[0].severity).toBe('high');
    expect(groups[0].assets.map((a) => a.assetName)).toEqual(['research', 'research-deep']);
    expect(groups[0].key).toBe('skill:frontmatter 缺失必填字段：name');
  });

  it('按严重度排序，同级别按影响资产数排序', () => {
    const groups = groupHealthIssues([
      issue({ id: 'low', severity: 'low', title: '低优问题' }),
      issue({ id: 'high1', severity: 'high', title: '高危 A' }),
      issue({ id: 'high2', severity: 'high', title: '高危 B' }),
      issue({ id: 'high3', severity: 'high', title: '高危 B' }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['高危 B', '高危 A', '低优问题']);
  });

  it('统计严重度分布', () => {
    const counts = countBySeverity([
      issue({ severity: 'high' }),
      issue({ severity: 'high' }),
      issue({ severity: 'low' }),
    ]);
    expect(counts).toEqual({ high: 2, medium: 0, low: 1 });
  });
});
