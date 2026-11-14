/**
 * 引导状态测试（add-zero-config-onboarding T2）
 *
 * spec: onboarding.spec Requirement 1（首次判定）/ 7（标记）/ 8（不再自动进入）
 * 铁律：marker 坏数据不抛错；写入失败不抛错（persisted=false）；
 *       autoEnter 必须「未标记 且（无 hub.toml 或 资产数为 0）」。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveAutoEnter,
  readOnboardingMarker,
  writeOnboardingMarker,
  readOnboardingState,
} from '../../../src/core/onboarding-state.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-onboarding-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('resolveAutoEnter：首次判定四组合（spec 1.1/1.4/8.2）', () => {
  it('无 hub.toml 且未标记 → 进入向导', () => {
    expect(resolveAutoEnter({ initialized: false, assetCount: 0, onboarded: false })).toBe(true);
  });

  it('已初始化但资产为 0 且未标记 → 进入向导（Scenario 1.4）', () => {
    expect(resolveAutoEnter({ initialized: true, assetCount: 0, onboarded: false })).toBe(true);
  });

  it('有资产但未标记 → 不进入（老用户不被打扰，Scenario 8.2）', () => {
    expect(resolveAutoEnter({ initialized: true, assetCount: 7, onboarded: false })).toBe(false);
  });

  it('已标记 → 永不自动进入，即使资产为 0', () => {
    expect(resolveAutoEnter({ initialized: false, assetCount: 0, onboarded: true })).toBe(false);
  });
});

describe('readOnboardingMarker：坏数据不抛错（spec 8.4）', () => {
  it('文件缺失返回 null', () => {
    expect(readOnboardingMarker(tempDir)).toBeNull();
  });

  it('合法 JSON 返回解析结果', () => {
    writeFileSync(
      join(tempDir, 'onboarding.json'),
      JSON.stringify({ version: 1, outcome: 'skipped', step: 'collect', at: '2026-11-14T00:00:00.000Z' }),
      'utf-8',
    );
    const marker = readOnboardingMarker(tempDir);
    expect(marker).not.toBeNull();
    expect(marker?.outcome).toBe('skipped');
    expect(marker?.step).toBe('collect');
  });

  it('坏 JSON 返回 null 且不抛错', () => {
    writeFileSync(join(tempDir, 'onboarding.json'), '{not-json', 'utf-8');
    expect(readOnboardingMarker(tempDir)).toBeNull();
  });

  it('未知 version 返回 null 且不抛错', () => {
    writeFileSync(
      join(tempDir, 'onboarding.json'),
      JSON.stringify({ version: 99, outcome: 'completed', step: 'done', at: '2026-11-14T00:00:00.000Z' }),
      'utf-8',
    );
    expect(readOnboardingMarker(tempDir)).toBeNull();
  });

  it('outcome/step 非法取值返回 null', () => {
    writeFileSync(
      join(tempDir, 'onboarding.json'),
      JSON.stringify({ version: 1, outcome: 'other', step: 'done', at: '2026-11-14T00:00:00.000Z' }),
      'utf-8',
    );
    expect(readOnboardingMarker(tempDir)).toBeNull();
  });
});

describe('writeOnboardingMarker：落盘与失败兜底（spec 7.2/7.4）', () => {
  it('写入后可读回，at 来自注入时钟', () => {
    const result = writeOnboardingMarker(
      { outcome: 'completed', step: 'done' },
      { hubRoot: tempDir, now: () => '2026-11-14T08:30:00.000Z' },
    );
    expect(result.persisted).toBe(true);
    const marker = readOnboardingMarker(tempDir);
    expect(marker?.outcome).toBe('completed');
    expect(marker?.at).toBe('2026-11-14T08:30:00.000Z');
  });

  it('skipped 同样落盘（跳过也写标记）', () => {
    writeOnboardingMarker({ outcome: 'skipped', step: 'doctor' }, { hubRoot: tempDir });
    expect(readOnboardingMarker(tempDir)?.outcome).toBe('skipped');
  });

  it('重复写入覆盖旧值（重新运行引导）', () => {
    writeOnboardingMarker({ outcome: 'skipped', step: 'welcome' }, { hubRoot: tempDir });
    writeOnboardingMarker({ outcome: 'completed', step: 'done' }, { hubRoot: tempDir });
    expect(readOnboardingMarker(tempDir)?.outcome).toBe('completed');
  });

  it('写入失败返回 persisted=false 且不抛错（Scenario 7.4）', () => {
    // hubRoot 指向一个已存在的文件，任何目录创建/写入都会失败
    const filePath = join(tempDir, 'occupied');
    writeFileSync(filePath, 'x', 'utf-8');
    const result = writeOnboardingMarker({ outcome: 'completed', step: 'done' }, { hubRoot: filePath });
    expect(result.persisted).toBe(false);
  });
});

describe('readOnboardingState：聚合（spec 1.1/1.4）', () => {
  it('空 Hub：initialized=false、assetCount=0、autoEnter=true', () => {
    const state = readOnboardingState({ hubRoot: tempDir, assetCount: 0 });
    expect(state.initialized).toBe(false);
    expect(state.assetCount).toBe(0);
    expect(state.autoEnter).toBe(true);
    expect(state.lastOutcome).toBeNull();
  });

  it('有资产但未标记（历史升级，hub.toml 存在）→ 不进入（spec 8.2）', () => {
    writeFileSync(join(tempDir, 'hub.toml'), '', 'utf-8');
    const state = readOnboardingState({ hubRoot: tempDir, assetCount: 3 });
    expect(state.autoEnter).toBe(false);
  });

  it('无 hub.toml 但有资产 → 按规格定义仍是首次环境（定义：无 toml 或 资产 0）', () => {
    expect(resolveAutoEnter({ initialized: false, assetCount: 3, onboarded: false })).toBe(true);
  });

  it('完成标记后：autoEnter=false 且 lastOutcome 可见', () => {
    writeOnboardingMarker({ outcome: 'completed', step: 'done' }, { hubRoot: tempDir });
    const state = readOnboardingState({ hubRoot: tempDir, assetCount: 5 });
    expect(state.onboarded).toBe(true);
    expect(state.autoEnter).toBe(false);
    expect(state.lastOutcome?.outcome).toBe('completed');
  });
});
