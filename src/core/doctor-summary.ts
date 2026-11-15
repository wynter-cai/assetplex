/**
 * 单资产诊断摘要（refactor-asset-pipeline T2）
 *
 * 只读：本机上次运行记录 + 当前三要素（正文 / 准则集 / 模型）→ never / valid / stale，
 * 并回答「现在点一次重新诊断会不会调用模型」。零模型：不创建 LlmClient、不调 llm.chat、
 * 不跑机械检查（摘要只读上次结果）。
 *
 * spec: 设计文档/changes/refactor-asset-pipeline/specs/asset-pipeline.spec.md Requirement 2
 * 契约: 设计文档/changes/refactor-asset-pipeline/api-contract.ts (DoctorSummaryResponse)
 */

import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import { hashCriteria, type CriterionAsset } from './criteria.js';
import {
  computeDoctorCacheKey,
  doctorLastRunKey,
  diffLastRunInputs,
  hashDoctorContent,
  sanitizeDoctorEntries,
  sanitizeDoctorLastRuns,
  toDoctorLastRunSummary,
  type DoctorCacheStore,
  type DoctorLastRunStore,
  type DoctorSummaryResponse,
} from './doctor-cache.js';
import type { DoctorAssetKind } from './types.js';

export interface DoctorSummaryInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
}

export interface DoctorSummaryDeps {
  /** 资产正文读取：读不到 = 不可用（不视为健康） */
  fs: { read(hubRelativePath: string): string | null };
  getCriteria(): CriterionAsset[];
  cache: DoctorCacheStore;
  lastRunStore: DoctorLastRunStore;
  config: AiClassifyConfig;
}

export function readDoctorSummary(input: DoctorSummaryInput, deps: DoctorSummaryDeps): DoctorSummaryResponse {
  const aiConfigured = isAiConfigComplete(deps.config);
  // 未配置 AI 时诊断只出机械结论（model 为空串），比对口径需与写入侧一致
  const currentModel = aiConfigured ? deps.config.model : '';
  const record =
    sanitizeDoctorLastRuns(deps.lastRunStore.load())[doctorLastRunKey(input.kind, input.hubRelativePath)] ?? null;
  const content = deps.fs.read(input.hubRelativePath);
  const base = { kind: input.kind, hubRelativePath: input.hubRelativePath, aiConfigured };
  if (content === null) {
    return { ...base, available: false, state: 'never', lastRun: null, staleReasons: [], willCallModel: aiConfigured };
  }
  const criteriaHash = hashCriteria(deps.getCriteria());
  const current = { contentHash: hashDoctorContent(content), criteriaHash, model: currentModel };
  const cacheHit =
    aiConfigured &&
    sanitizeDoctorEntries(deps.cache.load())[
      computeDoctorCacheKey({ kind: input.kind, content, criteriaHash, model: currentModel })
    ] !== undefined;
  const willCallModel = aiConfigured && !cacheHit;
  if (record === null) {
    return { ...base, available: false, state: 'never', lastRun: null, staleReasons: [], willCallModel };
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
