/**
 * 资产医生诊断引擎（add-asset-doctor E2/E3/E4）
 *
 * 诊断 = 「单资产 × 准则集」的对照审视：prompt 组装、内容哈希缓存、闭集解析、
 * 失败隔离全部与仲裁同构（proposal D1，复用 criteria/llm-output/ai-config 基建）。
 * advisory-only：本模块只产报告，永不写库（修复链路见 doctor-fix，Phase F）。
 *
 * spec: 设计文档/changes/add-asset-doctor/specs/asset-diagnosis.spec.md
 */

import {
  assembleCriteriaPromptBlock,
  hashCriteria,
  type CriterionAsset,
} from './criteria.js';
import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import type { LlmClient } from './skill-ai-classification.js';
import { runMechanicalChecks } from './doctor-mechanical.js';
import {
  parseDiagnosisOutput,
  DiagnosisOutputError,
  type ParsedDiagnosis,
} from './doctor-parse.js';
import {
  computeDoctorCacheKey,
  hashDoctorContent,
  sanitizeDoctorEntries,
  type DoctorCacheEntry,
  type DoctorCacheStore,
  type DoctorLastRunStore,
} from './doctor-cache.js';
import { applyIgnores } from './diagnosis-ignore.js';
import { persistDoctorLastRun } from './doctor-last-run.js';
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
import { buildCoverage, mergeOverall, projectFindingsToIssues } from './diagnosis-report.js';

/** 资产正文进 prompt 的截断上限（超长部分不参与诊断，与仲裁单侧上限同值不同义） */
export const DIAGNOSIS_CONTENT_LIMIT = 6000;

/** 资产文件读取失败（路由层映射 404） */
export class DiagnosisAssetError extends Error {
  constructor(path: string) {
    super(`文件读取失败：${path}`);
    this.name = 'DiagnosisAssetError';
  }
}

// 解析层定义在 doctor-parse.ts，此处 re-export 保持对外导入面稳定
export { DiagnosisOutputError, parseDiagnosisOutput, type ParsedDiagnosis };

// ============ 报告与缓存类型（对应 api-contract） ============

export interface DiagnosisReport {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  overall: DiagnosisOverall;
  /** 新链路主结果：规则命中的 findings（含被忽略项，T5 起填充 ignored） */
  findings: RuleFinding[];
  /** 兼容字段：由 findings 投影出的旧结构（无证据项不进入此列表） */
  issues: DiagnosisIssue[];
  /** 规则集版本，用于跨版本对比；规则集未加载时为空串 */
  rulesVersion: string;
  coverage: DiagnosisCoverage;
  criteriaUsed: string[];
  criteriaSkipped: number;
  /** 模型部分来自缓存（机械项每次都重跑，确定性结果不变） */
  cached: boolean;
  /** AI 未配置：只含静态与机械结论，前端展示配置引导（Scenario 7） */
  mechanicalOnly: boolean;
  /** AI 是否实际参与本轮（区别于「配置了但失败」） */
  aiEvaluated: boolean;
  /** 被丢弃的模型条目数（规则编号非法 / 证据不可定位 / 结构缺失；T4 起填充） */
  rejected: number;
  model: string;
  generatedAt: string;
}

// ============ E2: prompt 组装 ============

const KIND_LABEL: Record<DoctorAssetKind, string> = {
  identity: '身份/人设（identity）',
  skill: '技能（skill）',
  rule: '规则（rule）',
  agent: '子代理（agent）',
  command: '斜杠命令（command）',
  memory: '记忆（memory）',
};

export interface DiagnosisPromptInput {
  kind: DoctorAssetKind;
  content: string;
  /** assembleCriteriaPromptBlock 的准则区文本；空串=库内无可用准则（仅内置基线，Scenario 6） */
  criteriaBlock: string;
  /** 机械检查已确认的 finding 清单：注入 user 让模型不重复提出 */
  mechanicalFindings: string[];
}

export interface DiagnosisPrompt {
  system: string;
  user: string;
  /** 正文超出审视上限时为 true（草案生成据此拒绝一键修复，fix spec Scenario 7） */
  contentTruncated: boolean;
}

/** 构造诊断 prompt（导出便于测试约束内容，同 buildArbitrationPrompt 惯例） */
export function buildDiagnosisPrompt(input: DiagnosisPromptInput): DiagnosisPrompt {
  const systemParts = [
    [
      `你是资产医生。待审视资产类别：${KIND_LABEL[input.kind]}。`,
      '只审视这一个资产本身的质量：是否清晰、可触发、精简、符合最佳实践。',
      '结论取值闭集（三选一）：',
      '- healthy：未发现实质问题',
      '- needs-attention：有中等问题，或多个小问题',
      '- at-risk：有高严重度问题，已实质影响资产效果',
      'issues 每条五要素：severity ∈ high/medium/low、criterion（引用准则 slug）、',
      'finding（哪里有问题，中文）、suggestion（怎么改，中文）、fixable（能否改写修复，布尔）。',
      '未发现问题时返回空 issues，绝不编造低价值建议凑数。',
      '只输出 JSON：{"overall":"...","issues":[{"severity":"...","criterion":"...","finding":"...","suggestion":"...","fixable":true}]}',
    ].join('\n'),
  ];
  if (input.criteriaBlock.trim() !== '') {
    systemParts.push(
      [
        '审视时须依据以下裁决准则（来自维护者资产库，按优先级排列）：',
        input.criteriaBlock,
      ].join('\n'),
    );
  }

  const truncated = input.content.length > DIAGNOSIS_CONTENT_LIMIT;
  const visible = truncated ? input.content.slice(0, DIAGNOSIS_CONTENT_LIMIT) : input.content;
  const userParts = [
    truncated
      ? `【待审视资产正文】（超长，仅前 ${DIAGNOSIS_CONTENT_LIMIT} 字符可见，余下已截断，截断部分不参与诊断）\n${visible}`
      : `【待审视资产正文】\n${visible}`,
  ];
  if (input.mechanicalFindings.length > 0) {
    userParts.push(
      [
        '机械检查已确认的问题（不要重复提出，只补充语义层面发现）：',
        ...input.mechanicalFindings.map((f) => `- ${f}`),
      ].join('\n'),
    );
  }
  return { system: systemParts.join('\n\n'), user: userParts.join('\n\n'), contentTruncated: truncated };
}

// ============ E4: 诊断执行（机械恒跑 + 缓存 + 失败隔离） ============

export interface DiagnoseInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
}

export interface DiagnoseDeps {
  /** 读取资产内容（路由层注入 Hub 相对路径解析；读不到返回 null → 404） */
  fs: { read(hubRelativePath: string): string | null };
  getCriteria(): CriterionAsset[];
  cache: DoctorCacheStore;
  llm: LlmClient;
  /** null/不完整 = 未配置 AI：只出机械报告（Scenario 7），不抛错 */
  config: AiClassifyConfig | null;
  /** 规则集：null/缺省 = 规则集未加载，本轮无规则结论（findings 为空，coverage 全零） */
  ruleSet?: DiagnosisRuleSet | null;
  /** 忽略清单（路由层注入）：同路径同规则且内容哈希一致时标记 finding.ignored */
  ignores?: IgnoredFinding[];
  /** 上次运行摘要记录：缺省不写（既有调用零改动；路由层注入 Node 实现） */
  lastRunStore?: DoctorLastRunStore;
  now?: () => string;
}

function mechanicalOnlyReport(
  input: DiagnoseInput,
  mechanical: DiagnosisIssue[],
  findings: RuleFinding[],
  coverage: DiagnosisCoverage,
  rulesVersion: string,
  now: string,
): DiagnosisReport {
  // 被忽略项不参与计分（Scenario 4.2 / 4.3：忽略不等于修好，但也不该继续扣分）
  const visible = findings.filter((f) => !f.ignored);
  const hasHigh = mechanical.some((i) => i.severity === 'high') || visible.some((f) => f.severity === 'high');
  const worst: DiagnosisOverall = hasHigh ? 'at-risk' : mechanical.length + visible.length > 0 ? 'needs-attention' : 'healthy';
  return {
    kind: input.kind,
    hubRelativePath: input.hubRelativePath,
    overall: worst,
    findings,
    issues: projectFindingsToIssues(mechanical, [], findings),
    rulesVersion,
    coverage,
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: true,
    aiEvaluated: false,
    rejected: 0,
    model: '',
    generatedAt: now,
  };
}

/**
 * 诊断一个库内资产：机械项恒跑；AI 未配置降级 mechanicalOnly；
 * 缓存 key 命中不调模型；模型输出非法 throw 且不落缓存（下次重调）。
 */
export async function diagnoseAsset(
  input: DiagnoseInput,
  deps: DiagnoseDeps,
): Promise<DiagnosisReport> {
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const content = deps.fs.read(input.hubRelativePath);
  if (content === null) throw new DiagnosisAssetError(input.hubRelativePath);

  const ruleSet = deps.ruleSet ?? null;
  const rulesVersion = ruleSet === null ? '' : ruleSet.version;
  const mechanical = runMechanicalChecks(input.kind, content);
  const staticResult = runStaticChecks(
    { kind: input.kind, hubRelativePath: input.hubRelativePath, content },
    ruleSet,
  );
  // 忽略按内容哈希绑定：内容变更后自动失效，旧忽略条目不再命中（Scenario 4.2）
  const findings = applyIgnores(
    staticResult.findings,
    { hubRelativePath: input.hubRelativePath, contentHash: hashDoctorContent(content) },
    deps.ignores ?? [],
  );
  const config = deps.config;
  if (config === null || !isAiConfigComplete(config)) {
    const report = mechanicalOnlyReport(
      input,
      mechanical,
      findings,
      buildCoverage(ruleSet, input.kind, staticResult.evaluatedRuleIds.length, false),
      rulesVersion,
      now,
    );
    persistDoctorLastRun(deps, input, report, content, null, now);
    return report;
  }

  const criteria = deps.getCriteria();
  const criteriaHash = hashCriteria(criteria);
  const { block, used, skipped } = assembleCriteriaPromptBlock(criteria, input.kind);
  const key = computeDoctorCacheKey({
    kind: input.kind,
    content,
    criteriaHash,
    model: config.model,
  });

  const hit = sanitizeDoctorEntries(deps.cache.load())[key] ?? null;
  let modelPart: DoctorCacheEntry;
  if (hit !== null) {
    modelPart = hit;
  } else {
    const prompt = buildDiagnosisPrompt({
      kind: input.kind,
      content,
      criteriaBlock: block,
      mechanicalFindings: mechanical.map((i) => i.finding),
    });
    const output = await deps.llm.chat({ system: prompt.system, user: prompt.user });
    const parsed = parseDiagnosisOutput(output);
    modelPart = {
      overall: parsed.overall,
      issues: parsed.issues,
      model: config.model,
      criteriaUsed: used,
      criteriaSkipped: skipped,
      generatedAt: now,
    };
    const entries = sanitizeDoctorEntries(deps.cache.load());
    entries[key] = modelPart;
    deps.cache.save(entries);
  }

  const hasHigh =
    mechanical.some((issue) => issue.severity === 'high') ||
    findings.some((finding) => finding.severity === 'high' && !finding.ignored);
  const report: DiagnosisReport = {
    kind: input.kind,
    hubRelativePath: input.hubRelativePath,
    overall: mergeOverall(modelPart.overall, hasHigh),
    findings,
    issues: projectFindingsToIssues(mechanical, modelPart.issues, findings),
    rulesVersion,
    coverage: buildCoverage(ruleSet, input.kind, staticResult.evaluatedRuleIds.length, true),
    criteriaUsed: modelPart.criteriaUsed,
    criteriaSkipped: modelPart.criteriaSkipped,
    cached: hit !== null,
    mechanicalOnly: false,
    aiEvaluated: true,
    rejected: 0,
    model: modelPart.model,
    generatedAt: modelPart.generatedAt,
  };
  persistDoctorLastRun(deps, input, report, content, criteriaHash, now);
  return report;
}
