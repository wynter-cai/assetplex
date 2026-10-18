/**
 * 诊断输出解析（add-asset-doctor E3）
 *
 * 闭集校验与仲裁同规则（Scenario 8 失败隔离）：任何非法形态 throw，
 * 调用方不产生半成品报告、不落缓存，最坏体验 = 没有诊断。
 */

import { extractJsonObjectText } from './llm-output.js';
import {
  DIAGNOSIS_OVERALLS,
  DIAGNOSIS_SEVERITIES,
  type DiagnosisIssue,
  type DiagnosisOverall,
} from './types.js';

/** 模型输出非法专用错误（路由层映射 422「诊断失败：<原因>」） */
export class DiagnosisOutputError extends Error {
  constructor(reason: string) {
    super(`诊断失败：${reason}`);
    this.name = 'DiagnosisOutputError';
  }
}

export interface ParsedDiagnosis {
  overall: DiagnosisOverall;
  issues: DiagnosisIssue[];
}

function isClosedSet<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** 解析模型输出为诊断结论；任何非法形态 throw DiagnosisOutputError */
export function parseDiagnosisOutput(output: string): ParsedDiagnosis {
  const jsonText = extractJsonObjectText(output);
  if (jsonText === null) throw new DiagnosisOutputError('输出中找不到 JSON 对象');
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new DiagnosisOutputError('JSON 无法解析');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new DiagnosisOutputError('输出不是 JSON 对象');
  const obj = parsed as Record<string, unknown>;
  if (!isClosedSet(obj.overall, DIAGNOSIS_OVERALLS)) {
    throw new DiagnosisOutputError(`overall「${String(obj.overall)}」不在 healthy/needs-attention/at-risk 闭集内`);
  }
  if (!Array.isArray(obj.issues)) throw new DiagnosisOutputError('缺少 issues 数组');

  const issues: DiagnosisIssue[] = [];
  for (const [idx, raw] of obj.issues.entries()) {
    if (typeof raw !== 'object' || raw === null) throw new DiagnosisOutputError(`issue[${idx}] 不是对象`);
    const e = raw as Record<string, unknown>;
    if (!isClosedSet(e.severity, DIAGNOSIS_SEVERITIES)) {
      throw new DiagnosisOutputError(`issue[${idx}] severity「${String(e.severity)}」不在 high/medium/low 闭集内`);
    }
    for (const field of ['criterion', 'finding', 'suggestion'] as const) {
      if (typeof e[field] !== 'string' || (e[field] as string) === '') {
        throw new DiagnosisOutputError(`issue[${idx}] 缺必填字段 ${field}`);
      }
    }
    issues.push({
      severity: e.severity,
      criterion: e.criterion as string,
      finding: e.finding as string,
      suggestion: e.suggestion as string,
      fixable: e.fixable === true,
    });
  }
  return { overall: obj.overall, issues };
}
