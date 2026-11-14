/**
 * 无子命令 `assetplex` 的首跑决策（add-zero-config-onboarding T9）
 *
 * 首次环境（autoEnter=true）→ 'wizard'：建骨架并启动 Web 向导；
 * 非首次 → 'help'：保持原有行为（显示帮助），零副作用。
 * 决策（纯函数）与副作用（注入）分离，便于测试。
 */

import type { OnboardingState } from '../../core/onboarding-state.js';

export type BareInvocation = 'wizard' | 'help';

/** 无子命令时该做什么：完全由首次判定决定 */
export function resolveBareInvocation(state: Pick<OnboardingState, 'autoEnter'>): BareInvocation {
  return state.autoEnter ? 'wizard' : 'help';
}

export interface BareInvocationDeps {
  state: Pick<OnboardingState, 'autoEnter'>;
  /** 建骨架（幂等） */
  ensureSkeleton: () => void;
  /** 启动 Web UI（打开浏览器落到向导） */
  startUi: () => Promise<void>;
}

/** wizard 分支执行副作用；help 分支零副作用（调用方落回 program.parseAsync） */
export async function handleBareInvocation(deps: BareInvocationDeps): Promise<BareInvocation> {
  if (resolveBareInvocation(deps.state) !== 'wizard') return 'help';
  deps.ensureSkeleton();
  await deps.startUi();
  return 'wizard';
}
