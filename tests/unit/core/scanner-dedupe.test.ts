/**
 * 扫描结果去重测试
 *
 * spec: add-memory-command-categories / specs/scan-classification-truth.spec.md Scenario 4
 * 同一绝对路径在一次扫描里只能出现一次，避免收藏时写两份。
 */

import { describe, it, expect } from 'vitest';
import { dedupeDiscovered } from '../../../src/core/scanner.js';
import type { DiscoveredItem } from '../../../src/core/types.js';

function item(absolutePath: string, hubTargetPath: string, category: DiscoveredItem['category']): DiscoveredItem {
  return {
    absolutePath,
    relativePath: absolutePath.split('/').slice(-2).join('/'),
    size: 10,
    modified: '2026-10-29T00:00:00.000Z',
    category,
    hubTargetPath,
    conflict: 'none',
    tool: 'demo-tool',
  };
}

describe('dedupeDiscovered', () => {
  it('同一绝对路径只保留首次命中（规则表顺序即优先级）', () => {
    const first = item('/demo/commands/run.md', 'commands/run.md', 'command');
    const dup = item('/demo/commands/run.md', 'preferences/run.md', 'preference');

    const result = dedupeDiscovered([first, dup]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(first);
    expect(result[0].hubTargetPath).toBe('commands/run.md');
  });

  it('不同路径全部保留，顺序不变', () => {
    const a = item('/demo/memory/a.md', 'memory/a.md', 'memory');
    const b = item('/demo/memory/b.md', 'memory/b.md', 'memory');

    expect(dedupeDiscovered([a, b]).map((i) => i.absolutePath)).toEqual([
      '/demo/memory/a.md',
      '/demo/memory/b.md',
    ]);
  });

  it('空列表与单元素列表原样返回', () => {
    expect(dedupeDiscovered([])).toEqual([]);
    const one = item('/demo/x.md', 'identity/x.md', 'identity');
    expect(dedupeDiscovered([one])).toHaveLength(1);
  });
});
