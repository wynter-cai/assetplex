/**
 * 盘点洞察测试（add-zero-config-onboarding T4）
 *
 * spec Requirement 3：重复维护 / 版本不一致 / 覆盖不全全部来自真实扫描数据。
 * 哈希由注入的 readHash 提供（undefined = 无法比对，不计入版本判定但仍计副本）。
 */

import { describe, it, expect } from 'vitest';
import { buildOnboardingInsights } from '../../../src/core/onboarding-insights.js';
import type { ToolInventory, DiscoveredItem } from '../../../src/core/types.js';

function item(overrides: Partial<DiscoveredItem> & { tool: string; hubTargetPath: string }): DiscoveredItem {
  return {
    absolutePath: `C:/fake/${overrides.tool}/${overrides.hubTargetPath}`,
    relativePath: overrides.hubTargetPath,
    size: 100,
    modified: '2026-11-14T00:00:00.000Z',
    category: 'rule',
    conflict: 'none',
    binary: false,
    ...overrides,
  } as DiscoveredItem;
}

function inventory(
  toolName: string,
  items: DiscoveredItem[],
  overrides: Partial<ToolInventory> = {},
): ToolInventory {
  return {
    toolName,
    displayName: toolName,
    installed: true,
    configDir: `C:/fake/${toolName}`,
    items,
    ...overrides,
  };
}

/** 按绝对路径返回预设哈希 */
function hashTable(table: Record<string, string>) {
  return (absPath: string): string | undefined => table[absPath];
}

describe('buildOnboardingInsights（spec 3.1/3.2）', () => {
  it('跨工具同名 → 重复维护，tools 按扫描顺序', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'rules/always/commit.md' })]),
      inventory('claude-code', [item({ tool: 'claude-code', hubTargetPath: 'rules/always/commit.md' })]),
    ];
    const insights = buildOnboardingInsights(inventories, hashTable({}));

    expect(insights.duplicateGroups).toHaveLength(1);
    expect(insights.duplicateGroups[0].tools).toEqual(['trae-cn', 'claude-code']);
    expect(insights.duplicateGroups[0].hubTargetPath).toBe('rules/always/commit.md');
  });

  it('无哈希可比对时不判「内容不一致」，distinctVersions=0', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'rules/always/commit.md' })]),
      inventory('claude-code', [item({ tool: 'claude-code', hubTargetPath: 'rules/always/commit.md' })]),
    ];
    const insights = buildOnboardingInsights(inventories, () => undefined);

    expect(insights.duplicateGroups).toHaveLength(1);
    expect(insights.duplicateGroups[0].comparedCopies).toBe(0);
    expect(insights.duplicateGroups[0].distinctVersions).toBe(0);
    expect(insights.versionMismatchGroups).toHaveLength(0);
  });

  it('哈希不同 → 内容不一致，distinctVersions=2；哈希相同 → 不一致为空', () => {
    const mk = () => [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'rules/always/style.md' })]),
      inventory('codex', [item({ tool: 'codex', hubTargetPath: 'rules/always/style.md' })]),
    ];
    const differing = buildOnboardingInsights(mk(), hashTable({
      'C:/fake/trae-cn/rules/always/style.md': 'h1',
      'C:/fake/codex/rules/always/style.md': 'h2',
    }));
    expect(differing.versionMismatchGroups).toHaveLength(1);
    expect(differing.versionMismatchGroups[0].distinctVersions).toBe(2);
    expect(differing.versionMismatchGroups[0].comparedCopies).toBe(2);

    const same = buildOnboardingInsights(mk(), hashTable({
      'C:/fake/trae-cn/rules/always/style.md': 'h1',
      'C:/fake/codex/rules/always/style.md': 'h1',
    }));
    expect(same.versionMismatchGroups).toHaveLength(0);
  });

  it('同类不同目标路径不互相分组', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'rules/always/a.md' })]),
      inventory('codex', [item({ tool: 'codex', hubTargetPath: 'rules/always/b.md' })]),
    ];
    const insights = buildOnboardingInsights(inventories, () => 'h');
    expect(insights.duplicateGroups).toHaveLength(0);
    expect(insights.coverageGroups).toHaveLength(2);
  });

  it('copies 带每个工具的落点、大小、时间与版本前缀（结果页查看详情）', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'rules/always/style.md' })]),
      inventory('codex', [item({ tool: 'codex', hubTargetPath: 'rules/always/style.md' })]),
    ];
    const insights = buildOnboardingInsights(
      inventories,
      hashTable({
        'C:/fake/trae-cn/rules/always/style.md': 'aaaaaaaaaaaa1111',
        'C:/fake/codex/rules/always/style.md': 'bbbbbbbbbbbb2222',
      }),
    );

    const group = insights.duplicateGroups[0];
    expect(group.copies).toHaveLength(2);
    expect(group.copies[0]).toMatchObject({
      tool: 'trae-cn',
      path: 'C:/fake/trae-cn/rules/always/style.md',
      contentHash: 'aaaaaaaaaaaa',
    });
    expect(group.copies[1].contentHash).toBe('bbbbbbbbbbbb');
  });
});

describe('buildOnboardingInsights（spec 3.3 覆盖不全）', () => {
  it('只在一个已安装工具中存在 → 覆盖不全，列出有/无', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'identity/profile.md', category: 'identity' })]),
      inventory('codex', []),
      inventory('workbuddy', []),
    ];
    const insights = buildOnboardingInsights(inventories, () => 'h');

    expect(insights.coverageGroups).toHaveLength(1);
    expect(insights.coverageGroups[0].tools).toEqual(['trae-cn']);
    expect(insights.installedTools).toEqual(['trae-cn', 'codex', 'workbuddy']);
  });

  it('全部已安装工具都有 → 不进覆盖不全', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'rules/always/x.md' })]),
      inventory('codex', [item({ tool: 'codex', hubTargetPath: 'rules/always/x.md' })]),
    ];
    const insights = buildOnboardingInsights(inventories, () => 'h');
    expect(insights.coverageGroups).toHaveLength(0);
    expect(insights.duplicateGroups).toHaveLength(1);
  });

  it('未安装工具不参与覆盖比较', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'rules/always/x.md' })]),
      inventory('qoder', [], { installed: false }),
    ];
    const insights = buildOnboardingInsights(inventories, () => 'h');
    expect(insights.installedTools).toEqual(['trae-cn']);
    expect(insights.coverageGroups).toHaveLength(0); // 只有一个已安装工具，无从比较
  });
});

describe('buildOnboardingInsights（spec 2.5/3.4 边界）', () => {
  it('0 条目 → 全空', () => {
    const insights = buildOnboardingInsights([inventory('trae-cn', [])], () => 'h');
    expect(insights.duplicateGroups).toHaveLength(0);
    expect(insights.versionMismatchGroups).toHaveLength(0);
    expect(insights.coverageGroups).toHaveLength(0);
    expect(insights.installedTools).toEqual(['trae-cn']);
  });

  it('name 取目标路径不含扩展名的可读名', () => {
    const inventories = [
      inventory('trae-cn', [item({ tool: 'trae-cn', hubTargetPath: 'identity/profile.md', category: 'identity' })]),
      inventory('codex', []),
    ];
    const insights = buildOnboardingInsights(inventories, () => 'h');
    expect(insights.coverageGroups[0].name).toBe('profile');
    expect(insights.coverageGroups[0].category).toBe('identity');
  });
});
