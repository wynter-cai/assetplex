/**
 * 导入请求构建测试（add-zero-config-onboarding T10，从 Import.tsx 抽取的共享逻辑）
 *
 * 行为契约与 Import 页保持一致：
 * - 只构建已选中条目
 * - differs 项携带冲突策略（缺省 merge）与可采纳的仲裁草案
 * - 二进制标记透传
 */

import { describe, it, expect } from 'vitest';
import { itemKey, buildImportItems, type ConflictResolution } from './import-request';
import type { DiscoveredItem } from '@/types/api';

function item(overrides: Partial<DiscoveredItem> & { tool: string; hubTargetPath: string }): DiscoveredItem {
  return {
    absolutePath: `C:/fake/${overrides.hubTargetPath}`,
    relativePath: overrides.hubTargetPath,
    size: 10,
    modified: '2026-11-14T00:00:00.000Z',
    category: 'rule',
    conflict: 'none',
    binary: false,
    ...overrides,
  } as DiscoveredItem;
}

const base = item({ tool: 'trae-cn', hubTargetPath: 'rules/always/a.md' });

describe('itemKey', () => {
  it('tool:absolutePath 唯一标识', () => {
    expect(itemKey(base)).toBe('trae-cn:C:/fake/rules/always/a.md');
  });
});

describe('buildImportItems', () => {
  it('只构建已选中条目', () => {
    const other = item({ tool: 'codex', hubTargetPath: 'rules/always/b.md' });
    const items = buildImportItems({
      allItems: [base, other],
      selectedItemKeys: new Set([itemKey(base)]),
      conflictResolutions: new Map(),
    });
    expect(items).toHaveLength(1);
    expect(items[0].hubTargetPath).toBe('rules/always/a.md');
  });

  it('differs 项缺省 merge；可透传策略与仲裁草案（按 hubTargetPath 键）', () => {
    const conflict = item({ tool: 'trae-cn', hubTargetPath: 'rules/always/c.md', conflict: 'differs' });
    const resolutions = new Map<string, ConflictResolution>([
      ['rules/always/c.md', { strategy: 'merge', draft: 'merged-draft' }],
    ]);
    const items = buildImportItems({
      allItems: [conflict],
      selectedItemKeys: new Set([itemKey(conflict)]),
      conflictResolutions: resolutions,
    });
    expect(items[0].strategy).toBe('merge');
    expect(items[0].mergeDraft).toBe('merged-draft');
  });

  it('非 differs 不携带策略；binary 透传', () => {
    const binary = item({ tool: 'wb', hubTargetPath: 'skills/icon.png', binary: true });
    const items = buildImportItems({
      allItems: [base, binary],
      selectedItemKeys: new Set([itemKey(base), itemKey(binary)]),
      conflictResolutions: new Map(),
    });
    expect(items[0].strategy).toBeUndefined();
    expect(items[1].binary).toBe(true);
  });
});
