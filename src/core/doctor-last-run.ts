/**
 * 上次诊断记录写入（refactor-asset-pipeline T1）
 *
 * 唯一写入点由 diagnoseAsset 在成功返回前调用：只存摘要与三要素指纹，绝不写正文。
 * 存储不可写时静默降级——摘要是辅助数据，不能反过来拖垮诊断主链路。
 */

import { hashCriteria } from './criteria.js';
import {
  doctorLastRunKey,
  hashDoctorContent,
  sanitizeDoctorLastRuns,
  type DoctorLastRunRecord,
  type DoctorLastRunSummary,
} from './doctor-cache.js';
import type { DiagnoseDeps, DiagnoseInput, DiagnosisReport } from './doctor.js';

/** 摘要计数：findings 为主口径（含「已忽略 N 条」披露）；规则集未加载时回退旧 issues */
function lastRunCounts(
  report: DiagnosisReport,
): Pick<DoctorLastRunSummary, 'issueCount' | 'highSeverityCount' | 'fixableCount' | 'ignoredCount'> {
  if (report.findings.length > 0) {
    const active = report.findings.filter((finding) => !finding.ignored);
    return {
      issueCount: active.length,
      highSeverityCount: active.filter((finding) => finding.severity === 'high').length,
      fixableCount: active.filter((finding) => finding.fixable && !finding.insufficientEvidence).length,
      ignoredCount: report.findings.length - active.length,
    };
  }
  return {
    issueCount: report.issues.length,
    highSeverityCount: report.issues.filter((issue) => issue.severity === 'high').length,
    fixableCount: report.issues.filter((issue) => issue.fixable).length,
    ignoredCount: 0,
  };
}

/**
 * 写入一条上次运行记录：key = kind + '\u0000' + hubRelativePath。
 * criteriaHash 由调用方传入（AI 路径已算过），null 时按当前准则集补算。
 */
export function persistDoctorLastRun(
  deps: Pick<DiagnoseDeps, 'lastRunStore' | 'getCriteria'>,
  input: DiagnoseInput,
  report: DiagnosisReport,
  content: string,
  criteriaHash: string | null,
  runAt: string,
): void {
  const store = deps.lastRunStore;
  if (store === undefined) return;
  try {
    const record: DoctorLastRunRecord = {
      kind: input.kind,
      hubRelativePath: input.hubRelativePath,
      overall: report.overall,
      ...lastRunCounts(report),
      mechanicalOnly: report.mechanicalOnly,
      rulesVersion: report.rulesVersion,
      model: report.model,
      generatedAt: runAt,
      inputs: {
        contentHash: hashDoctorContent(content),
        criteriaHash: criteriaHash ?? hashCriteria(deps.getCriteria()),
        model: report.model,
      },
    };
    const entries = sanitizeDoctorLastRuns(store.load());
    entries[doctorLastRunKey(input.kind, input.hubRelativePath)] = record;
    store.save(entries);
  } catch {
    // 记录失败不影响本次诊断结果
  }
}
