/**
 * 分发四分类纯函数测试（add-zero-config-onboarding T5）
 *
 * spec Requirement 6.1 口径：
 * - unchanged：计划 skip，或分发索引判定 synced（内容已一致）
 * - create：目标不存在
 * - conflict：目标存在且分发索引判定 conflict（曾同步后偏离）
 * - overwrite：其余已存在目标（首次接管）
 */

import { describe, it, expect } from 'vitest';
import { classifyDistributeItem, summarizeDistribute } from './onboarding-distribute';
import type { SyncPlan, SyncPlanItem, DistributionIndexResponse } from '@/types/api';

function planItem(overrides: Partial<SyncPlanItem> & { targetPath: string }): SyncPlanItem {
  return {
    item: { type: 'rule', relativePath: 'rules/always/x.md', absolutePath: 'C:/hub/rules/always/x.md' },
    target: { tool: 'trae-cn', targetPath: overrides.targetPath, strategy: 'symlink', isDirectory: false },
    action: 'symlink',
    ...overrides,
  } as SyncPlanItem;
}

function distribution(
  index: Record<string, Array<{ toolId: string; status: 'synced' | 'pending' | 'conflict' | 'not_enabled' | 'not_installed' }>>,
): DistributionIndexResponse {
  return {
    generatedAt: '2026-11-14T00:00:00.000Z',
    cached: false,
    partial: false,
    failedTools: [],
    index: index as DistributionIndexResponse['index'],
    projectTools: [],
  };
}

describe('classifyDistributeItem（spec 6.1）', () => {
  it('计划 skip → unchanged（无论目标是否存在）', () => {
    const item = planItem({ targetPath: 'C:/t/x', action: 'skip', targetExists: true });
    expect(classifyDistributeItem(item, null)).toBe('unchanged');
  });

  it('目标不存在 → create', () => {
    const item = planItem({ targetPath: 'C:/t/x', targetExists: false });
    expect(classifyDistributeItem(item, null)).toBe('create');
  });

  it('目标存在、索引无该资产 → overwrite（首次接管）', () => {
    const item = planItem({ targetPath: 'C:/t/x', targetExists: true });
    expect(classifyDistributeItem(item, distribution({}))).toBe('overwrite');
  });

  it('目标存在、索引判定 conflict → conflict', () => {
    const item = planItem({ targetPath: 'C:/t/x', targetExists: true });
    const dist = distribution({
      'rules/always/x.md': [{ toolId: 'trae-cn', status: 'conflict' }],
    });
    expect(classifyDistributeItem(item, dist)).toBe('conflict');
  });

  it('目标存在但索引判定 synced → unchanged（内容已一致）', () => {
    const item = planItem({ targetPath: 'C:/t/x', targetExists: true });
    const dist = distribution({
      'rules/always/x.md': [{ toolId: 'trae-cn', status: 'synced' }],
    });
    expect(classifyDistributeItem(item, dist)).toBe('unchanged');
  });

  it('relativePath 为空时回退为 overwrite（不猜）', () => {
    const item = planItem({ targetPath: 'C:/t/x', targetExists: true });
    (item.item as { relativePath: string }).relativePath = '';
    expect(classifyDistributeItem(item, distribution({}))).toBe('overwrite');
  });
});

describe('summarizeDistribute（spec 6.1 汇总）', () => {
  const dist = distribution({
    'rules/always/old.md': [{ toolId: 'trae-cn', status: 'conflict' }],
  });

  const plan: SyncPlan = {
    tool: 'trae-cn',
    toolInstalled: true,
    items: [
      planItem({ targetPath: 'C:/t/new.md', targetExists: false }),
      planItem({
        targetPath: 'C:/t/old.md',
        targetExists: true,
        item: { type: 'rule', relativePath: 'rules/always/old.md', absolutePath: 'C:/hub/rules/always/old.md' },
      }),
      planItem({ targetPath: 'C:/t/skip.md', action: 'skip', targetExists: false }),
    ],
  };

  it('计数与文件清单一致，skip 不计入', () => {
    const summary = summarizeDistribute([plan], dist);
    expect(summary.counts).toEqual({ create: 1, overwrite: 0, conflict: 1, unchanged: 1 });
    expect(summary.files).toHaveLength(2);
    expect(summary.files.every((f) => f.action !== 'unchanged')).toBe(true);
    expect(summary.byTool['trae-cn']).toBe(2);
  });

  it('多工具汇总累加', () => {
    const otherPlan: SyncPlan = {
      tool: 'codex',
      toolInstalled: true,
      items: [planItem({ targetPath: 'C:/c/new.md', targetExists: false, target: { tool: 'codex', targetPath: 'C:/c/new.md', strategy: 'copy', isDirectory: false } })],
    };
    const summary = summarizeDistribute([plan, otherPlan], dist);
    expect(summary.counts.create).toBe(2);
    expect(summary.byTool['codex']).toBe(1);
  });
});
