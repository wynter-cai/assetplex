/**
 * 诊断报告装配（add-diagnosis-rules T3）
 *
 * 覆盖度、结论合并与「findings → 旧 issues」投影三件事都是纯函数，
 * 与调用链分离后既便于单测，也让 doctor.ts 保持在单文件规模内。
 */

import { ruleAppliesToKind } from './diagnosis-static.js';
import {
  type DiagnosisCoverage,
  type DiagnosisIssue,
  type DiagnosisOverall,
  type DiagnosisRuleSet,
  type DoctorAssetKind,
  type MechanicalCheckId,
  type RuleFinding,
} from './types.js';

const OVERALL_RANK: Record<DiagnosisOverall, number> = {
  healthy: 0,
  'needs-attention': 1,
  'at-risk': 2,
};

/** 机械 / 静态 high 项不允许被模型 healthy 覆盖：结论取两侧较重者 */
export function mergeOverall(modelOverall: DiagnosisOverall, hasHighFinding: boolean): DiagnosisOverall {
  if (!hasHighFinding) return modelOverall;
  return OVERALL_RANK[modelOverall] >= OVERALL_RANK['needs-attention'] ? modelOverall : 'needs-attention';
}

/** 覆盖度：静态由执行器给出实测条数，语义规则只在 AI 实际参与时计入已评估 */
export function buildCoverage(
  ruleSet: DiagnosisRuleSet | null,
  kind: DoctorAssetKind,
  staticEvaluated: number,
  aiEvaluated: boolean,
  /** 语义未评估的原因（Scenario 7：无配置 / 超预算 / 超时），默认无配置 */
  skipReason: 'no-ai-config' | 'budget' | 'timeout' = 'no-ai-config',
): DiagnosisCoverage {
  if (ruleSet === null) return { evaluatedRules: 0, skippedRules: 0, skippedReasons: [] };
  const llmApplicable = ruleSet.rules.filter((rule) => rule.mode === 'llm' && ruleAppliesToKind(rule, kind)).length;
  return {
    evaluatedRules: staticEvaluated + (aiEvaluated ? llmApplicable : 0),
    skippedRules: aiEvaluated ? 0 : llmApplicable,
    skippedReasons:
      !aiEvaluated && llmApplicable > 0 ? [{ mode: 'llm', reason: skipReason, count: llmApplicable }] : [],
  };
}

/** 规则与既有机械项的对应关系：同一问题不在旧 issues 里出现两次 */
const MECHANICAL_ALIAS: Partial<Record<string, MechanicalCheckId>> = {
  'SK-01': 'frontmatter-missing-field',
  'SK-03': 'description-empty',
  'SK-08': 'body-over-length',
  'RU-01': 'body-over-length',
  'MEM-03': 'body-over-length',
};

/**
 * 旧 issues 由 findings 投影保留：只投影有证据且未被忽略的结论。
 * 无证据项（缺失类问题）不进旧列表，避免「看起来引用了原文、实际不存在」（Scenario 3.2 / 3.3）。
 */
export function projectFindingsToIssues(
  mechanical: DiagnosisIssue[],
  modelIssues: DiagnosisIssue[],
  findings: RuleFinding[],
): DiagnosisIssue[] {
  const covered = new Set(mechanical.map((issue) => issue.criterion));
  const projected = findings
    .filter((finding) => finding.evidence.length > 0 && !finding.insufficientEvidence && !finding.ignored)
    .filter((finding) => {
      const alias = MECHANICAL_ALIAS[finding.ruleId];
      return alias === undefined || !covered.has(`mechanical:${alias}`);
    })
    .map((finding) => ({
      severity: finding.severity,
      criterion: finding.ruleId,
      finding: finding.finding,
      suggestion: finding.suggestion,
      fixable: finding.fixable,
    }));
  return [...mechanical, ...modelIssues, ...projected];
}
