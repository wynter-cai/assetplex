/**
 * 首跑向导状态机测试（add-zero-config-onboarding T13）
 *
 * spec Requirement 7 / Scenario 7.2：跳过后不可自动回弹；done 是终点；
 * 分发取消保持原步骤。
 */

import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS,
  advanceStep,
  previousStep,
  exitOnboarding,
  finishOnboarding,
  cancelDistribute,
} from './onboarding-machine';

describe('onboarding-machine（T13）', () => {
  it('步骤链路与原型 s0–s6 对应', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'welcome',
      'scan',
      'result',
      'collect',
      'doctor',
      'distribute',
      'done',
    ]);
  });

  it('advance 沿链路前进，done 为终点不回弹', () => {
    expect(advanceStep('welcome')).toBe('scan');
    expect(advanceStep('result')).toBe('collect');
    expect(advanceStep('distribute')).toBe('done');
    expect(advanceStep('done')).toBeNull();
  });

  it('previous 沿链路后退，welcome 为起点', () => {
    expect(previousStep('welcome')).toBeNull();
    expect(previousStep('result')).toBe('scan');
    expect(previousStep('done')).toBe('distribute');
  });

  it('exit 冻结在当前步骤（skipped）', () => {
    expect(exitOnboarding('doctor')).toEqual({ outcome: 'skipped', step: 'doctor' });
    expect(exitOnboarding('welcome')).toEqual({ outcome: 'skipped', step: 'welcome' });
  });

  it('finish 记录 completed + done', () => {
    expect(finishOnboarding()).toEqual({ outcome: 'completed', step: 'done' });
  });

  it('分发取消保持原步骤（不迁移、不回退）', () => {
    expect(cancelDistribute('distribute')).toBe('distribute');
  });
});
