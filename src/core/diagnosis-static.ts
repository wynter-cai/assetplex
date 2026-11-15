/**
 * 静态规则执行器（add-diagnosis-rules T2）
 *
 * 45 条 static 规则分五组实现（格式 / 阈值 / 引用 / 凭证 / 冲突信号），纯本地判定、零模型调用。
 * 每条命中都产出带证据的 finding：库内相对路径 + 行号 + ≤200 字原文片段；
 * 缺失类问题（原文里找不到可指的东西）line 为 null，标 insufficientEvidence，不计分不修复。
 */

import { evidenceAt, readDocument, type DocumentView } from './diagnosis-evidence.js';
import { FORMAT_CHECKS } from './diagnosis-checks-format.js';
import { THRESHOLD_CHECKS } from './diagnosis-checks-threshold.js';
import { REFERENCE_CHECKS } from './diagnosis-checks-reference.js';
import { SECURITY_CHECKS } from './diagnosis-checks-security.js';
import { CONFLICT_CHECKS } from './diagnosis-checks-conflict.js';
import type {
  DiagnosisConfidence,
  DiagnosisRule,
  DiagnosisRuleSet,
  DiagnosisSeverity,
  RuleAssetCategory,
  RuleFinding,
} from './types.js';

/** 单条规则最多产出几条命中，避免同一规则在长文里刷屏 */
export const MAX_FINDINGS_PER_RULE = 3;

export interface StaticCheckContext {
  kind: RuleAssetCategory;
  hubRelativePath: string;
  doc: DocumentView;
  /** 同目录其他文件名（Hub 相对路径），用于重名判定 */
  siblings: string[];
  /** 同类别其他资产内容，用于相似度与重复判定 */
  peers: Array<{ hubRelativePath: string; content: string }>;
  /** 库内文件存在性判定；null = 未提供上下文，引用存在性类检查不下结论 */
  exists: ((hubRelativePath: string) => boolean) | null;
}

export interface CheckHit {
  /** 1-based 行号；null = 缺失类问题，无法指向原文某一行 */
  line: number | null;
  detail: string;
}

export interface StaticCheck {
  ruleId: string;
  /** 阈值类可为 medium；缺省 high */
  confidence?: DiagnosisConfidence;
  run(ctx: StaticCheckContext): CheckHit[];
}

/** 五组合并后的全部静态检查（顺序即报告内同严重度下的展示顺序） */
export const ALL_STATIC_CHECKS: StaticCheck[] = [
  ...FORMAT_CHECKS,
  ...THRESHOLD_CHECKS,
  ...REFERENCE_CHECKS,
  ...SECURITY_CHECKS,
  ...CONFLICT_CHECKS,
];

export interface StaticDiagnosisInput {
  kind: RuleAssetCategory;
  hubRelativePath: string;
  content: string;
  siblings?: string[];
  peers?: Array<{ hubRelativePath: string; content: string }>;
  exists?: (hubRelativePath: string) => boolean;
}

export interface StaticDiagnosisResult {
  findings: RuleFinding[];
  /** 本轮实际评估到的静态规则编号（覆盖度披露用） */
  evaluatedRuleIds: string[];
}

const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { high: 0, medium: 1, low: 2 };

/** 某条规则是否适用于该资产类别（覆盖度披露与静态执行共用同一判定） */
export function ruleAppliesToKind(rule: DiagnosisRule, kind: RuleAssetCategory): boolean {
  const appliesTo = rule.appliesTo ?? (rule.category === 'cross' ? [] : [rule.category]);
  return appliesTo.includes(kind);
}

/** 规则标题取自判定信号的首句（来自注册表，不由模型生成） */
export function ruleTitle(rule: DiagnosisRule): string {
  const first = rule.signal.split(/[，,。；;]/)[0] ?? rule.signal;
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
}

function buildFinding(
  rule: DiagnosisRule,
  hit: CheckHit,
  context: { hubRelativePath: string; doc: DocumentView },
  confidence: DiagnosisConfidence,
  index: number,
): RuleFinding {
  const evidence = hit.line === null ? [] : [evidenceAt(context.hubRelativePath, context.doc.lines, hit.line)];
  return {
    id: `${rule.id}:${context.hubRelativePath}:${hit.line ?? 'x'}:${index}`,
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    confidence,
    source: 'rule',
    title: ruleTitle(rule),
    finding: hit.detail,
    impact: '',
    suggestion: rule.recommendation,
    evidence,
    insufficientEvidence: evidence.length === 0,
    fixable: evidence.length > 0,
    ignored: false,
  };
}

/**
 * 跑一遍静态规则：只跑规则集里 mode=static 且适用于该资产类别的规则。
 * ruleSet 为 null（规则集未加载）时返回空结果，绝不猜测规则。
 */
export function runStaticChecks(input: StaticDiagnosisInput, ruleSet: DiagnosisRuleSet | null): StaticDiagnosisResult {
  if (ruleSet === null) return { findings: [], evaluatedRuleIds: [] };

  const doc = readDocument(input.content);
  const context: StaticCheckContext = {
    kind: input.kind,
    hubRelativePath: input.hubRelativePath,
    doc,
    siblings: input.siblings ?? [],
    peers: input.peers ?? [],
    exists: input.exists ?? null,
  };
  const rulesById = new Map(ruleSet.rules.map((rule) => [rule.id, rule]));
  const findings: RuleFinding[] = [];
  const evaluatedRuleIds: string[] = [];

  for (const check of ALL_STATIC_CHECKS) {
    const rule = rulesById.get(check.ruleId);
    if (rule === undefined || rule.mode !== 'static') continue;
    if (!ruleAppliesToKind(rule, input.kind)) continue;
    evaluatedRuleIds.push(rule.id);
    check
      .run(context)
      .slice(0, MAX_FINDINGS_PER_RULE)
      .forEach((hit, index) => findings.push(buildFinding(rule, hit, context, check.confidence ?? 'high', index)));
  }

  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.ruleId.localeCompare(b.ruleId));
  return { findings, evaluatedRuleIds };
}
