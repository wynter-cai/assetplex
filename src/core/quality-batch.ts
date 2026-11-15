/**
 * 跨类别批量诊断预估（refactor-governance-center T4）
 *
 * 纯函数：圈选结果 → 资产总数、缓存命中、需调用、语义跳过、不可诊断明细、按类别规则覆盖度。
 * 零模型零写库：调用方只注入「读到的正文」「是否已缓存」，本模块不做 IO。
 * 不可诊断项必须逐条列出原因，禁止静默丢弃（spec Scenario 3.1 / 3.2）。
 *
 * spec: 设计文档/changes/refactor-governance-center/specs/governance-center.spec.md Requirement 3
 * 契约: 设计文档/changes/refactor-governance-center/api-contract.ts (BatchDiagnoseEstimate)
 */

import { ruleAppliesToKind, runStaticChecks } from './diagnosis-static.js';
import type { DiagnosisRuleSet, DoctorAssetKind } from './types.js';

/** 单次批量最多资产数 */
export const BATCH_MAX_ASSETS = 100;
/** 预计调用超过该值时前端需二次确认 */
export const BATCH_CONFIRM_ABOVE_CALLS = 50;
/** 单次实际调用硬上限 */
export const BATCH_HARD_MAX_CALLS = 200;

export type UnDiagnosableReason = 'env-asset' | 'unreadable' | 'unsupported-kind' | 'rule-load-failed';

export interface UnDiagnosableAsset {
  hubRelativePath: string;
  kind: DoctorAssetKind;
  reason: UnDiagnosableReason;
}

export interface BatchDiagnoseCandidate {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 读到的正文；null = 读不到（不可诊断，不伪装成健康） */
  content: string | null;
  /** false = 工具侧/环境条目（不在 Hub 内），医生不服务 */
  hubInternal: boolean;
}

export interface BatchRuleCoverage {
  kind: DoctorAssetKind;
  evaluatedRules: number;
  skippedRules: number;
}

export interface BatchDiagnosisEstimate {
  totalAssets: number;
  cacheHits: number;
  willCall: number;
  semanticSkipped: number;
  unDiagnosable: UnDiagnosableAsset[];
  ruleCoverage: BatchRuleCoverage[];
  rulesVersion: string;
  /**
   * 执行目标清单（T5 补充）：可诊断资产按稳定顺序列出，前端据此逐资产调用
   * `/api/doctor/diagnose`，避免前端自己按类别重算一份口径。
   */
  targets: Array<{ kind: DoctorAssetKind; hubRelativePath: string }>;
  limits: { maxAssets: number; confirmAboveCalls: number; hardMaxCalls: number };
  estimatedAt: string;
}

export interface BatchEstimateInput {
  ruleSet: DiagnosisRuleSet;
  candidates: BatchDiagnoseCandidate[];
  aiConfigured: boolean;
  /** 该资产本轮是否命中内容哈希缓存（由调用方用与诊断同一套 key 判定） */
  isCached: (candidate: { kind: DoctorAssetKind; content: string }) => boolean;
  now?: () => string;
}

/** 按规则编号圈选：只留静态命中这些规则的资产（零模型，与诊断同一执行器） */
export function filterCandidatesByRuleIds(
  ruleSet: DiagnosisRuleSet,
  ruleIds: string[],
  candidates: BatchDiagnoseCandidate[],
): BatchDiagnoseCandidate[] {
  if (ruleIds.length === 0) return candidates;
  const selected = new Set(ruleIds);
  const narrowed: DiagnosisRuleSet = { ...ruleSet, rules: ruleSet.rules.filter((rule) => selected.has(rule.id)) };
  if (narrowed.rules.length === 0) return [];
  return candidates.filter((candidate) => {
    if (candidate.content === null || !candidate.hubInternal) return false;
    const result = runStaticChecks(
      { kind: candidate.kind, hubRelativePath: candidate.hubRelativePath, content: candidate.content },
      narrowed,
    );
    return result.findings.length > 0;
  });
}

/** 按类别统计本轮会评估多少条规则（与概览覆盖度同一口径） */
export function ruleCoverageByKind(
  ruleSet: DiagnosisRuleSet,
  kinds: DoctorAssetKind[],
  aiConfigured: boolean,
): BatchRuleCoverage[] {
  return kinds.map((kind) => {
    let evaluatedRules = 0;
    let skippedRules = 0;
    for (const rule of ruleSet.rules) {
      if (!ruleAppliesToKind(rule, kind)) continue;
      if (rule.mode === 'static' || aiConfigured) evaluatedRules += 1;
      else skippedRules += 1;
    }
    return { kind, evaluatedRules, skippedRules };
  });
}

export function estimateBatchDiagnosis(input: BatchEstimateInput): BatchDiagnosisEstimate {
  const unDiagnosable: UnDiagnosableAsset[] = [];
  const targets: BatchDiagnosisEstimate['targets'] = [];
  let cacheHits = 0;
  let willCall = 0;
  const kinds = new Set<DoctorAssetKind>();

  for (const candidate of input.candidates) {
    if (!candidate.hubInternal) {
      unDiagnosable.push({
        hubRelativePath: candidate.hubRelativePath,
        kind: candidate.kind,
        reason: 'env-asset',
      });
      continue;
    }
    if (candidate.content === null) {
      unDiagnosable.push({
        hubRelativePath: candidate.hubRelativePath,
        kind: candidate.kind,
        reason: 'unreadable',
      });
      continue;
    }
    kinds.add(candidate.kind);
    targets.push({ kind: candidate.kind, hubRelativePath: candidate.hubRelativePath });
    if (!input.aiConfigured) continue;
    if (input.isCached({ kind: candidate.kind, content: candidate.content })) cacheHits += 1;
    else willCall += 1;
  }

  const coverage = ruleCoverageByKind(input.ruleSet, [...kinds], input.aiConfigured);
  return {
    // 契约口径：totalAssets = 可诊断资产数；不可诊断项单独列出，不混入总数
    totalAssets: input.candidates.length - unDiagnosable.length,
    cacheHits,
    willCall,
    semanticSkipped: coverage.reduce((sum, item) => sum + item.skippedRules, 0),
    unDiagnosable,
    ruleCoverage: coverage,
    rulesVersion: input.ruleSet.version,
    targets,
    limits: {
      maxAssets: BATCH_MAX_ASSETS,
      confirmAboveCalls: BATCH_CONFIRM_ABOVE_CALLS,
      hardMaxCalls: BATCH_HARD_MAX_CALLS,
    },
    estimatedAt: (input.now ?? (() => new Date().toISOString()))(),
  };
}
