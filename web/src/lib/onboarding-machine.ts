/**
 * 首跑向导状态机（add-zero-config-onboarding T13，纯逻辑无 React 依赖）
 *
 * spec Requirement 7：
 * - 步骤只能沿链路前进/后退，不可跳跃
 * - 跳过（exit）冻结在当前步骤，之后不再自动回弹（done 是终点）
 * - 分发取消不产生状态迁移
 */

import type { OnboardingStepId } from '@/types/api';

/** 向导链路（与原型 s0–s6 对应） */
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
  'welcome',
  'scan',
  'result',
  'collect',
  'doctor',
  'distribute',
  'done',
];

export function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** 前进一步；done 是终点（返回 null，不会自动回弹） */
export function advanceStep(step: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(step);
  if (index < 0 || index >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[index + 1] ?? null;
}

/** 后退一步；welcome 是起点（返回 null） */
export function previousStep(step: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(step);
  if (index <= 0) return null;
  return ONBOARDING_STEPS[index - 1] ?? null;
}

/** 跳过入口：冻结当前步骤，作为 skipped 记录 */
export function exitOnboarding(
  step: OnboardingStepId,
): { outcome: 'skipped'; step: OnboardingStepId } {
  return { outcome: 'skipped', step };
}

/** 完成：走完链路后记录 completed + done */
export function finishOnboarding(): { outcome: 'completed'; step: OnboardingStepId } {
  return { outcome: 'completed', step: 'done' };
}

/** 分发确认弹窗取消：无状态迁移（显式表达，防误实现成回退） */
export function cancelDistribute(step: OnboardingStepId): OnboardingStepId {
  return step;
}
