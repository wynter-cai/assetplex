/**
 * 同步影响范围与主操作派生测试（fix-trust-and-consistency I5）
 *
 * spec: product-surface-hygiene Scenario 3 / 4 / 5
 */

import { describe, it, expect } from 'vitest';
import {
  derivePrimaryAction,
  impactText,
  modeCaption,
  summarizeImpact,
} from './sync-impact';
import type { SyncPlan, SyncPlanItem } from '@/types/api';

function makeItem(overrides: Partial<SyncPlanItem> = {}): SyncPlanItem {
  return {
    item: { type: 'rule', relativePath: 'rules/demo.md', absolutePath: '/hub/rules/demo.md' },
    target: { tool: 'trae-cn', targetPath: '/tool/rules', strategy: 'symlink', isDirectory: true },
    action: 'symlink',
    ...overrides,
  } as SyncPlanItem;
}

function makePlan(tool: string, items: SyncPlanItem[]): SyncPlan {
  return { tool, toolInstalled: true, items };
}

describe('summarizeImpact 影响范围', () => {
  it('变更数不含跳过项，冲突数取覆盖预警', () => {
    const plans = [
      makePlan('trae-cn', [makeItem(), makeItem({ action: 'copy' }), makeItem({ action: 'skip' })]),
      makePlan('workbuddy', [makeItem({ warning: '目标已存在，将被覆盖' })]),
    ];
    expect(summarizeImpact(2, plans)).toEqual({ toolCount: 2, changes: 3, conflicts: 1 });
  });

  it('没有任何计划时三个数都是 0，影响工具数仍等于已选数', () => {
    expect(summarizeImpact(3, [])).toEqual({ toolCount: 3, changes: 0, conflicts: 0 });
  });
});

describe('impactText 影响范围句式', () => {
  it('按 spec 的唯一句式输出三个口径', () => {
    expect(impactText({ toolCount: 2, changes: 12, conflicts: 3 })).toBe(
      '将影响 2 个工具 · 12 项变更 · 3 项冲突',
    );
  });
});

describe('derivePrimaryAction 主操作三态', () => {
  const empty = { toolCount: 0, changes: 0, conflicts: 0 };
  const some = { toolCount: 2, changes: 12, conflicts: 3 };

  it('未选目标：禁用并给出「请先选择目标工具」，不显示影响范围（D7）', () => {
    expect(derivePrimaryAction({ selectedCount: 0, impact: empty, dryRun: false, pending: false })).toEqual({
      disabled: true,
      label: '执行同步',
      hint: '请先选择目标工具',
      showImpact: false,
    });
  });

  it('变更与冲突都是 0：禁用并说「没有需要同步的内容」', () => {
    const action = derivePrimaryAction({ selectedCount: 2, impact: empty, dryRun: false, pending: false });
    expect(action.disabled).toBe(true);
    expect(action.hint).toBe('没有需要同步的内容');
    expect(action.showImpact).toBe(false);
  });

  it('有内容：可执行并显示影响范围', () => {
    const action = derivePrimaryAction({ selectedCount: 2, impact: some, dryRun: false, pending: false });
    expect(action).toEqual({ disabled: false, label: '执行同步', hint: '', showImpact: true });
  });

  it('只有冲突没有变更时仍可执行（覆盖需要显式确认）', () => {
    const action = derivePrimaryAction({
      selectedCount: 1,
      impact: { toolCount: 1, changes: 0, conflicts: 2 },
      dryRun: false,
      pending: false,
    });
    expect(action.disabled).toBe(false);
  });

  it('预览模式下按钮文案为「生成预览」（Scenario 5）', () => {
    const action = derivePrimaryAction({ selectedCount: 2, impact: some, dryRun: true, pending: false });
    expect(action.label).toBe('生成预览');
  });

  it('请求在途时禁用，但影响范围仍然可见', () => {
    const action = derivePrimaryAction({ selectedCount: 2, impact: some, dryRun: false, pending: true });
    expect(action.disabled).toBe(true);
    expect(action.showImpact).toBe(true);
  });
});

describe('modeCaption 模式说明', () => {
  it('开关两侧是两句不同的话，用户能判断按下去会不会写文件', () => {
    expect(modeCaption(true)).toBe('预览模式：只计算不写入');
    expect(modeCaption(false)).toBe('执行模式：将写入文件');
  });
});
