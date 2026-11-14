/**
 * 引导状态（add-zero-config-onboarding T2）
 *
 * - marker 存 <Hub>/onboarding.json，与资产配置（hub.toml）分离（proposal D3）
 * - 坏数据一律视为「未完成」，绝不抛错（spec 8.4）
 * - 写入失败返回 persisted=false，调用方提示但不阻断（spec 7.4）
 * - autoEnter = 未标记 且（无 hub.toml 或 资产数为 0）（spec 1.1/1.4/8.2）
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHubRoot, hubPath } from '../utils/paths.js';

/** 引导步骤闭集（与 api-contract OnboardingStepId 一致） */
export type OnboardingStepId =
  | 'welcome'
  | 'scan'
  | 'result'
  | 'collect'
  | 'doctor'
  | 'distribute'
  | 'done';

/** 引导结果：走完 = completed；任意步骤跳过 = skipped（同样写标记，spec 7.2） */
export type OnboardingOutcome = 'completed' | 'skipped';

const OUTCOMES: readonly string[] = ['completed', 'skipped'];
const STEPS: readonly string[] = ['welcome', 'scan', 'result', 'collect', 'doctor', 'distribute', 'done'];

/** marker 文件结构（version 用于将来演进；未知版本视为坏数据） */
export interface OnboardingMarker {
  version: 1;
  outcome: OnboardingOutcome;
  step: OnboardingStepId;
  /** ISO 时间 */
  at: string;
}

export interface OnboardingState {
  hubRoot: string;
  /** <Hub>/hub.toml 是否存在 */
  initialized: boolean;
  /** 是否已写合法 marker */
  onboarded: boolean;
  autoEnter: boolean;
  /** 调用方传入的资产库真实计数（listAssets 口径） */
  assetCount: number;
  lastOutcome: { outcome: OnboardingOutcome; step: OnboardingStepId; at: string } | null;
}

export interface WriteMarkerOptions {
  hubRoot?: string;
  now?: () => string;
}

function markerPath(hubRoot?: string): string {
  return hubRoot !== undefined ? join(hubRoot, 'onboarding.json') : hubPath('onboarding.json');
}

/** 读取 marker；缺失 / 坏 JSON / 未知 version / 非法枚举 → null，不抛错 */
export function readOnboardingMarker(hubRoot?: string): OnboardingMarker | null {
  const file = markerPath(hubRoot);
  if (!existsSync(file)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf-8'));
    if (typeof raw !== 'object' || raw === null) return null;
    const rec = raw as Record<string, unknown>;
    if (rec.version !== 1) return null;
    if (typeof rec.outcome !== 'string' || !OUTCOMES.includes(rec.outcome)) return null;
    if (typeof rec.step !== 'string' || !STEPS.includes(rec.step)) return null;
    if (typeof rec.at !== 'string' || rec.at === '') return null;
    return {
      version: 1,
      outcome: rec.outcome as OnboardingOutcome,
      step: rec.step as OnboardingStepId,
      at: rec.at,
    };
  } catch {
    return null;
  }
}

/**
 * 写入 marker（原子写：临时文件 + rename）。
 * 失败（权限/路径占用等）返回 persisted=false，不抛错。
 */
export function writeOnboardingMarker(
  input: { outcome: OnboardingOutcome; step: OnboardingStepId },
  options: WriteMarkerOptions = {},
): { persisted: boolean } {
  const root = options.hubRoot ?? getHubRoot();
  const at = (options.now ?? (() => new Date().toISOString()))();
  const marker: OnboardingMarker = { version: 1, outcome: input.outcome, step: input.step, at };
  const target = join(root, 'onboarding.json');
  const tmp = join(root, `.onboarding.json.tmp-${Math.random().toString(36).slice(2, 8)}`);
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(tmp, JSON.stringify(marker, null, 2) + '\n', 'utf-8');
    renameSync(tmp, target);
    return { persisted: true };
  } catch {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // ignore
    }
    return { persisted: false };
  }
}

/** 首次判定（spec 1.1/1.4/8.2）：未标记 且（无 hub.toml 或 资产为 0） */
export function resolveAutoEnter(input: {
  initialized: boolean;
  assetCount: number;
  onboarded: boolean;
}): boolean {
  return !input.onboarded && (!input.initialized || input.assetCount === 0);
}

/** 聚合读取（assetCount 必须由调用方显式给出，禁止默认 0 掩盖真实库） */
export function readOnboardingState(input: {
  hubRoot?: string;
  assetCount: number;
}): OnboardingState {
  const hubRoot = input.hubRoot ?? getHubRoot();
  const initialized = existsSync(join(hubRoot, 'hub.toml'));
  const marker = readOnboardingMarker(hubRoot);
  const onboarded = marker !== null;
  return {
    hubRoot,
    initialized,
    onboarded,
    autoEnter: resolveAutoEnter({ initialized, assetCount: input.assetCount, onboarded }),
    assetCount: input.assetCount,
    lastOutcome:
      marker !== null
        ? { outcome: marker.outcome, step: marker.step, at: marker.at }
        : null,
  };
}
