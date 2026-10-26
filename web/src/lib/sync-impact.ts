/**
 * 同步页的影响范围与主操作派生（纯逻辑，无 React 依赖）
 *
 * spec: product-surface-hygiene
 * - Scenario 3 未选目标不可执行（proposal D7：隐式「不选=全部已启用」下线）
 * - Scenario 4 执行前必须显示影响范围
 * - Scenario 5 预览开关可感知、可解释
 *
 * 关联: fix-trust-and-consistency tasks I5
 */

import type { SyncPlan } from '@/types/api';

/** 影响范围（三个数都来自预览计划，不猜） */
export interface SyncImpact {
  /** 将影响的工具数 = 已选目标数 */
  toolCount: number;
  /** 变更项：action !== 'skip' 的条目数 */
  changes: number;
  /** 冲突项：带覆盖预警（目标已有同名非链接文件）的条目数 */
  conflicts: number;
}

/** 跳过项不算变更，覆盖预警单独成一档 */
export function summarizeImpact(selectedCount: number, plans: SyncPlan[]): SyncImpact {
  let changes = 0;
  let conflicts = 0;
  for (const plan of plans) {
    for (const item of plan.items) {
      if (item.action !== 'skip') changes += 1;
      if (item.warning) conflicts += 1;
    }
  }
  return { toolCount: selectedCount, changes, conflicts };
}

/** 「将影响 2 个工具 · 12 项变更 · 3 项冲突」（spec Scenario 4 唯一句式） */
export function impactText(impact: SyncImpact): string {
  return `将影响 ${impact.toolCount} 个工具 · ${impact.changes} 项变更 · ${impact.conflicts} 项冲突`;
}

export interface PrimaryAction {
  disabled: boolean;
  label: string;
  /** 紧邻按钮的解释文案；无文案时为空串 */
  hint: string;
  /** 是否显示影响范围行（未选目标或没有内容时不显示，避免与 hint 打架） */
  showImpact: boolean;
}

export interface PrimaryActionInput {
  selectedCount: number;
  impact: SyncImpact;
  /** true = 预览模式（只计算不写入） */
  dryRun: boolean;
  /** 请求在途 */
  pending: boolean;
}

/** 主操作按钮的三态：未选目标 / 没有内容 / 可执行 */
export function derivePrimaryAction(input: PrimaryActionInput): PrimaryAction {
  const label = input.dryRun ? '生成预览' : '执行同步';
  if (input.selectedCount === 0) {
    return { disabled: true, label, hint: '请先选择目标工具', showImpact: false };
  }
  if (input.impact.changes === 0 && input.impact.conflicts === 0) {
    return { disabled: true, label, hint: '没有需要同步的内容', showImpact: false };
  }
  if (input.pending) {
    return { disabled: true, label, hint: '请求进行中…', showImpact: true };
  }
  return { disabled: false, label, hint: '', showImpact: true };
}

/** 预览开关的模式说明（Scenario 5：状态变化必须有明确差异文案） */
export function modeCaption(dryRun: boolean): string {
  return dryRun ? '预览模式：只计算不写入' : '执行模式：将写入文件';
}
