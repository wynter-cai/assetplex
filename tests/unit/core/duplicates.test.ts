/**
 * 重复分组测试（add-asset-governance K1）
 *
 * spec: specs/duplicate-governance.spec.md Scenario 1/2/6/7/8
 * 夹具使用中性示例名（example-skill-a/b），不照搬真实资产。
 */

import { describe, it, expect } from 'vitest';
import {
  groupDuplicates,
  normalizeContent,
  contentSimilarity,
  DEFAULT_NEAR_THRESHOLD,
  type DuplicateAssetInput,
} from '../../../src/core/duplicates.js';

function asset(
  name: string,
  content: string,
  overrides: Partial<DuplicateAssetInput> = {},
): DuplicateAssetInput {
  return {
    kind: 'skill',
    hubRelativePath: `skills/${name}/SKILL.md`,
    name,
    description: `${name} 的说明`,
    content,
    lastModified: '2026-11-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('重复分组', () => {
  it('内容归一化折叠空行与首尾空白', () => {
    expect(normalizeContent('  # demo\n\n\n\n正文  \n')).toBe('# demo\n\n正文');
  });

  it('完全重复：同内容正文聚为一组，并给出保留建议与理由', () => {
    const result = groupDuplicates([
      asset('example-skill-a', '# 技能\n\n做一件事\n'),
      asset('example-skill-b', '# 技能\n\n\n\n做一件事\n'),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.kind).toBe('exact');
    expect(result.groups[0]?.members).toHaveLength(2);
    expect(result.groups[0]?.suggestedKeepPath).toBeTruthy();
    expect(result.groups[0]?.keepReason.length).toBeGreaterThan(0);
    expect(result.mergeableGroupCount).toBe(1);
    expect(result.estimatedReduction).toBe(1);
  });

  it('精确重复按 name + description 归一化识别（正文不同也算）', () => {
    const result = groupDuplicates([
      asset('same-name', '# A\n'),
      asset('same-name', '# B\n'),
    ]);
    expect(result.groups[0]?.kind).toBe('exact');
  });

  it('近重复：token 相似度达到阈值进入 near；灰区进入 gray 且需 AI', () => {
    const base = Array.from({ length: 20 }, (_, i) => `步骤${i}: 执行子任务 ${i}`).join('\n');
    const near = `${base}\n补充：额外一条`;
    const result = groupDuplicates([
      asset('skill-near-1', base),
      asset('skill-near-2', near),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.kind).toBe('near');
    expect(result.groups[0]?.similarity).toBeGreaterThanOrEqual(DEFAULT_NEAR_THRESHOLD);
    expect(result.needsAiJudgement).toBe(false);

    const grayA = '部署流程 第一步 第二步 第三步 第四步 第五步';
    const grayB = '回滚流程 第一步 第二步 第三步 第四步 第六步';
    const gray = groupDuplicates([asset('deploy-flow', grayA), asset('deploy-flow-v2', grayB)], { threshold: 0.9, grayThreshold: 0.2 });
    expect(gray.groups[0]?.kind).toBe('gray');
    expect(gray.needsAiJudgement).toBe(true);
    expect(gray.estimatedAiCalls).toBe(1);
    expect(gray.mergeableGroupCount).toBe(0);
  });

  it('跨类别永不合并（技能 vs 规则）', () => {
    const result = groupDuplicates([
      asset('same', '# X\n', { kind: 'skill' }),
      asset('same', '# X\n', { kind: 'rule', hubRelativePath: 'rules/same.md' }),
    ]);
    expect(result.groups).toHaveLength(0);
  });

  it('无重复时返回空结果，不生成空组（Scenario 6）', () => {
    const result = groupDuplicates([asset('only-one', '# 唯一\n')]);
    expect(result.groups).toEqual([]);
    expect(result.groupCount).toBe(0);
    expect(result.estimatedReduction).toBe(0);
  });

  it('规模护栏：分组数超过上限时分页标记 hasMore（Scenario 8）', () => {
    const assets: DuplicateAssetInput[] = [];
    for (let i = 0; i < 60; i++) {
      const content = `# 组 ${i}\n\n唯一内容 ${i}\n`;
      assets.push(asset(`dup-${i}-a`, content, { hubRelativePath: `skills/dup-${i}-a/SKILL.md` }));
      assets.push(asset(`dup-${i}-b`, content, { hubRelativePath: `skills/dup-${i}-b/SKILL.md` }));
    }
    const result = groupDuplicates(assets, { maxGroups: 50 });
    expect(result.totalGroups).toBe(60);
    expect(result.groups).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  it('token 相似度对空正文安全返回 0，不抛错', () => {
    expect(contentSimilarity('', '')).toBe(0);
    expect(contentSimilarity('a b', '')).toBe(0);
  });
});
