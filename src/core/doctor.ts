/**
 * 资产医生诊断引擎（add-asset-doctor E2/E3/E4；add-diagnosis-rules 起改走规则化语义链路）
 *
 * 诊断 = 「静态规则全跑 + AI 语义增量」：静态规则确定性执行并给出证据，
 * AI 只从候选 ruleId 里补语义结论（证据必须能在原文定位），静态结论优先且永不因模型消失。
 * 内容哈希缓存、失败隔离与降级与仲裁同构；advisory-only：本模块只产报告，永不写库。
 *
 * spec: 设计文档/changes/add-diagnosis-rules/specs/diagnosis-rules.spec.md Requirement 2 / 3 / 7
 */

import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import type { LlmClient } from './skill-ai-classification.js';
import { runMechanicalChecks } from './doctor-mechanical.js';
import {
  computeDoctorCacheKey,
  hashDoctorContent,
  hashRuleSet,
  sanitizeDoctorEntries,
  type DoctorCacheEntry,
  type DoctorCacheStore,
  type DoctorLastRunStore,
} from './doctor-cache.js';
import { applyIgnores } from './diagnosis-ignore.js';
import { persistDoctorLastRun } from './doctor-last-run.js';
import { runIncrementalChecks } from './diagnosis-llm.js';
import {
  type DiagnosisCoverage,
  type DiagnosisIssue,
  type DiagnosisOverall,
  type DiagnosisRuleSet,
  type DoctorAssetKind,
  type IgnoredFinding,
  type RuleFinding,
} from './types.js';
import { runStaticChecks } from './diagnosis-static.js';
import { buildCoverage, overallFromFindings, projectFindingsToIssues } from './diagnosis-report.js';

/** 资产正文进修复草案 prompt 的截断上限（修复链路沿用；诊断发送面已改为片段制） */
export const DIAGNOSIS_CONTENT_LIMIT = 6000;

/** 资产文件读取失败（路由层映射 404） */
export class DiagnosisAssetError extends Error {
  constructor(path: string) {
    super(`文件读取失败：${path}`);
    this.name = 'DiagnosisAssetError';
  }
}

// ============ 报告与缓存类型（对应 api-contract） ============

export interface DiagnosisReport {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  overall: DiagnosisOverall;
  /** 主结果：规则命中的 findings（含被忽略项，供「已忽略 N 条」入口使用） */
  findings: RuleFinding[];
  /** 兼容字段：由 findings 投影出的旧结构（无证据项不进入此列表） */
  issues: DiagnosisIssue[];
  /** 规则集版本，用于跨版本对比；规则集未加载时为空串 */
  rulesVersion: string;
  coverage: DiagnosisCoverage;
  /** 裁决准则已退出诊断链路（偏好层只服务于修复草案），保留字段供契约对齐 */
  criteriaUsed: string[];
  criteriaSkipped: number;
  /** 语义结论来自缓存（静态规则每次都重跑，确定性结果不变） */
  cached: boolean;
  /** AI 未配置：只含静态与机械结论，前端展示配置引导 */
  mechanicalOnly: boolean;
  /** AI 是否实际参与本轮（区别于「配置了但失败 / 该类别无语义规则」） */
  aiEvaluated: boolean;
  /** 被丢弃的模型条目数（规则编号非法 / 证据不可定位 / 结构缺失） */
  rejected: number;
  model: string;
  generatedAt: string;
}

// ============ 诊断执行（静态恒跑 + 语义增量 + 缓存 + 失败隔离） ============

export interface DiagnoseInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
}

export interface DiagnoseDeps {
  /** 读取资产内容（路由层注入 Hub 相对路径解析；读不到返回 null → 404） */
  fs: { read(hubRelativePath: string): string | null };
  cache: DoctorCacheStore;
  llm: LlmClient;
  /** null/不完整 = 未配置 AI：只出静态报告，不抛错 */
  config: AiClassifyConfig | null;
  /** 规则集：null/缺省 = 规则集未加载，本轮无规则结论（findings 为空，coverage 全零） */
  ruleSet?: DiagnosisRuleSet | null;
  /** 忽略清单（路由层注入）：同路径同规则且内容哈希一致时标记 finding.ignored */
  ignores?: IgnoredFinding[];
  /** 上次运行摘要记录：缺省不写（既有调用零改动；路由层注入 Node 实现） */
  lastRunStore?: DoctorLastRunStore;
  now?: () => string;
}

function staticOnlyReport(
  input: DiagnoseInput,
  mechanical: DiagnosisIssue[],
  findings: RuleFinding[],
  coverage: DiagnosisCoverage,
  rulesVersion: string,
  now: string,
  options: { mechanicalOnly: boolean; model: string },
): DiagnosisReport {
  return {
    kind: input.kind,
    hubRelativePath: input.hubRelativePath,
    overall: overallFromFindings(mechanical, findings),
    findings,
    issues: projectFindingsToIssues(mechanical, [], findings),
    rulesVersion,
    coverage,
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: options.mechanicalOnly,
    aiEvaluated: false,
    rejected: 0,
    model: options.model,
    generatedAt: now,
  };
}

/**
 * 诊断一个库内资产：静态规则恒跑；AI 未配置降级 mechanicalOnly；
 * 缓存 key 命中不调模型；超预算 / 超时保留静态结论并标注语义未完成。
 */
export async function diagnoseAsset(input: DiagnoseInput, deps: DiagnoseDeps): Promise<DiagnosisReport> {
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const content = deps.fs.read(input.hubRelativePath);
  if (content === null) throw new DiagnosisAssetError(input.hubRelativePath);

  const ruleSet = deps.ruleSet ?? null;
  const rulesVersion = ruleSet === null ? '' : ruleSet.version;
  const contentHash = hashDoctorContent(content);
  const ignoreScope = { hubRelativePath: input.hubRelativePath, contentHash };
  const ignores = deps.ignores ?? [];
  const mechanical = runMechanicalChecks(input.kind, content);
  const staticResult = runStaticChecks({ kind: input.kind, hubRelativePath: input.hubRelativePath, content }, ruleSet);
  // 忽略按内容哈希绑定：内容变更后自动失效，旧忽略条目不再命中（Scenario 4.2）
  const staticFindings = applyIgnores(staticResult.findings, ignoreScope, ignores);
  const covered = (aiEvaluated: boolean, reason?: 'no-ai-config' | 'budget' | 'timeout'): DiagnosisCoverage =>
    buildCoverage(ruleSet, input.kind, staticResult.evaluatedRuleIds.length, aiEvaluated, reason);

  const config = deps.config;
  if (config === null || !isAiConfigComplete(config)) {
    const report = staticOnlyReport(input, mechanical, staticFindings, covered(false), rulesVersion, now, {
      mechanicalOnly: true,
      model: '',
    });
    persistDoctorLastRun(deps, input, report, content, null, now);
    return report;
  }

  // 规则集未加载：没有候选语义规则，AI 无从参与——静态报告照常返回，不伪装已评估
  if (ruleSet === null) {
    const report = staticOnlyReport(input, mechanical, staticFindings, covered(false), rulesVersion, now, {
      mechanicalOnly: false,
      model: config.model,
    });
    persistDoctorLastRun(deps, input, report, content, null, now);
    return report;
  }

  const rulesHash = hashRuleSet(ruleSet);
  const key = computeDoctorCacheKey({ kind: input.kind, content, rulesHash, model: config.model });
  const entries = sanitizeDoctorEntries(deps.cache.load());
  const hit = entries[key] ?? null;
  let aiPart: DoctorCacheEntry;
  if (hit !== null) {
    aiPart = hit;
  } else {
    const run = await runIncrementalChecks(
      { kind: input.kind, hubRelativePath: input.hubRelativePath, content, staticFindings, ruleSet },
      { llm: deps.llm },
    );
    // 超预算 / 超时：保留静态结论并标注语义未完成，不落缓存，下次可重试（Scenario 7.2）
    if (run.skippedReason !== null) {
      const degraded = staticOnlyReport(
        input,
        mechanical,
        staticFindings,
        covered(false, run.skippedReason),
        rulesVersion,
        now,
        { mechanicalOnly: false, model: config.model },
      );
      persistDoctorLastRun(deps, input, degraded, content, rulesHash, now);
      return degraded;
    }
    aiPart = {
      findings: run.findings,
      rejected: run.rejected,
      candidateCount: run.candidateCount,
      model: config.model,
      rulesVersion,
      generatedAt: now,
    };
    // 该类别没有语义规则（候选 0）或本轮有条目被丢弃时都不写缓存：
    // 前者缓存无意义，后者要让下次诊断重新调模型（解析失败不固化成结论）
    if (run.candidateCount > 0 && run.rejected === 0) {
      entries[key] = aiPart;
      deps.cache.save(entries);
    }
  }

  const findings = applyIgnores(aiPart.findings, ignoreScope, ignores);
  const report: DiagnosisReport = {
    kind: input.kind,
    hubRelativePath: input.hubRelativePath,
    overall: overallFromFindings(mechanical, findings),
    findings,
    issues: projectFindingsToIssues(mechanical, [], findings),
    rulesVersion,
    coverage: covered(aiPart.candidateCount > 0),
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: hit !== null,
    mechanicalOnly: false,
    aiEvaluated: aiPart.candidateCount > 0,
    rejected: aiPart.rejected,
    model: aiPart.model,
    generatedAt: aiPart.generatedAt,
  };
  persistDoctorLastRun(deps, input, report, content, rulesHash, now);
  return report;
}
