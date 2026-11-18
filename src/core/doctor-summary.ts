/**
 * 单资产诊断摘要（refactor-asset-pipeline T2）
 *
 * 只读：本机上次运行记录 + 当前三要素（正文 / 规则集 / 模型）→ never / valid / stale，
 * 并回答「现在点一次重新诊断会不会调用模型」。零模型：不创建 LlmClient、不调 llm.chat、
 * 不跑机械检查（摘要只读上次结果）。
 *
 * spec: 设计文档/changes/refactor-asset-pipeline/specs/asset-pipeline.spec.md Requirement 2
 * 契约: 设计文档/changes/refactor-asset-pipeline/api-contract.ts (DoctorSummaryResponse)
 */

import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import {
  computeDoctorCacheKey,
  doctorLastRunKey,
  diffLastRunInputs,
  hashDoctorContent,
  hashRuleSet,
  sanitizeDoctorEntries,
  sanitizeDoctorLastRuns,
  toDoctorLastRunSummary,
  type DoctorCacheStore,
  type DoctorLastRunStore,
  type DoctorSummaryResponse,
} from './doctor-cache.js';
import type { DiagnosisRuleSet, DoctorAssetKind } from './types.js';

export interface DoctorSummaryInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
}

export interface DoctorSummaryDeps {
  /** 资产正文读取：读不到 = 不可用（不视为健康） */
  fs: { read(hubRelativePath: string): string | null };
  /** 规则集：与诊断侧同一份，用于判定「规则集是否已更新」 */
  ruleSet: DiagnosisRuleSet | null;
  cache: DoctorCacheStore;
  lastRunStore: DoctorLastRunStore;
  config: AiClassifyConfig;
}

/** 本机记录里是否存在该资产的条目（不论是否通过校验）——用于区分「从未诊断」与「记录损坏」 */
function hasRawRecordFor(raw: unknown, kind: DoctorAssetKind, hubRelativePath: string): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.values(raw as Record<string, unknown>).some((value) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return row.kind === kind && row.hubRelativePath === hubRelativePath;
  });
}

export function readDoctorSummary(input: DoctorSummaryInput, deps: DoctorSummaryDeps): DoctorSummaryResponse {
  const aiConfigured = isAiConfigComplete(deps.config);
  // 未配置 AI 时诊断只出静态结论（model 为空串），比对口径需与写入侧一致
  const currentModel = aiConfigured ? deps.config.model : '';
  const rawRuns = deps.lastRunStore.load();
  const record = sanitizeDoctorLastRuns(rawRuns)[doctorLastRunKey(input.kind, input.hubRelativePath)] ?? null;
  const content = deps.fs.read(input.hubRelativePath);
  const base = { kind: input.kind, hubRelativePath: input.hubRelativePath, aiConfigured };
  if (content === null) {
    return { ...base, available: false, state: 'never', lastRun: null, staleReasons: [], willCallModel: aiConfigured };
  }
  const rulesHash = hashRuleSet(deps.ruleSet);
  const current = { contentHash: hashDoctorContent(content), rulesHash, model: currentModel };
  const cacheHit =
    aiConfigured &&
    sanitizeDoctorEntries(deps.cache.load())[
      computeDoctorCacheKey({ kind: input.kind, content, rulesHash, model: currentModel })
    ] !== undefined;
  const willCallModel = aiConfigured && !cacheHit;
  if (record === null) {
    // 没有记录 ≠ 读取失败：正文读得到、本机也没有该资产的脏记录时，就是正常的「从未诊断」，
    // available 仍为 true，否则前端会把每个新资产都误报成「摘要暂不可用」
    const corrupted = hasRawRecordFor(rawRuns, input.kind, input.hubRelativePath);
    return { ...base, available: !corrupted, state: 'never', lastRun: null, staleReasons: [], willCallModel };
  }
  const staleReasons = diffLastRunInputs(record.inputs, current);
  return {
    ...base,
    available: true,
    state: staleReasons.length > 0 ? 'stale' : 'valid',
    lastRun: toDoctorLastRunSummary(record),
    willCallModel,
    staleReasons,
  };
}
