/**
 * 技能诊断摘要纯逻辑（refactor-skill-catalog）
 *
 * 只服务展示：记录某技能最近一次诊断的结论、各级问题数与当时正文指纹，
 * 按当前内容哈希判定是否过期；不参与诊断结论本身，清空摘要不影响任何写链路。
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1.2/R1.3/R5.4）
 * Node 实现读写 ~/.assetplex/skill-diagnosis-summaries.json（server 层注入）。
 */

import { createHash } from 'node:crypto';
import { DIAGNOSIS_OVERALLS, type DiagnosisOverall } from './types.js';

/** 各级问题数（非负整数） */
export interface SkillDiagnosisIssueCounts {
  high: number;
  medium: number;
  low: number;
}

/** 存储形态：内容哈希由服务端按当前正文计算，前端不得回传 */
export interface SkillDiagnosisSummary {
  /** Hub 内相对路径，如 'skills/demo-skill/SKILL.md' */
  hubRelativePath: string;
  /** sha256(当前正文)；与读取时不一致即视为过期 */
  contentHash: string;
  overall: DiagnosisOverall;
  issueCounts: SkillDiagnosisIssueCounts;
  /** true = 本次只有机械检查，语义项未评估 */
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  checkedAt: string;
}

/** 展示投影：不含哈希与绝对路径 */
export interface SkillDiagnosisSummaryView {
  overall: DiagnosisOverall;
  issueCounts: SkillDiagnosisIssueCounts;
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  checkedAt: string;
  /** true = 期间正文已变化，问题数不计入看板合计 */
  stale: boolean;
}

/** 摘要存储抽象（key = Hub 内相对路径） */
export interface SkillDiagnosisSummaryStore {
  load(): Record<string, SkillDiagnosisSummary>;
  save(records: Record<string, SkillDiagnosisSummary>): void;
}

/** 正文 sha256（十六进制），与 AI 分类缓存同一口径 */
export function computeSkillContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** Hub 内相对路径：非空且不是本机绝对路径 */
function isHubRelativePath(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  return !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value);
}

function isIssueCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function sanitizeIssueCounts(value: unknown): SkillDiagnosisIssueCounts | null {
  if (typeof value !== 'object' || value === null) return null;
  const counts = value as Record<string, unknown>;
  if (!isIssueCount(counts.high) || !isIssueCount(counts.medium) || !isIssueCount(counts.low)) {
    return null;
  }
  return { high: counts.high, medium: counts.medium, low: counts.low };
}

/** 校验单条摘要；字段非法返回 null（不整体失败） */
export function sanitizeDiagnosisSummary(value: unknown): SkillDiagnosisSummary | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (
    !isHubRelativePath(entry.hubRelativePath) ||
    !isNonEmptyString(entry.contentHash) ||
    typeof entry.overall !== 'string' ||
    !(DIAGNOSIS_OVERALLS as readonly string[]).includes(entry.overall) ||
    typeof entry.mechanicalOnly !== 'boolean' ||
    !isNonEmptyString(entry.rulesVersion) ||
    !isNonEmptyString(entry.model) ||
    !isNonEmptyString(entry.checkedAt)
  ) {
    return null;
  }
  const issueCounts = sanitizeIssueCounts(entry.issueCounts);
  if (!issueCounts) return null;
  return {
    hubRelativePath: entry.hubRelativePath,
    contentHash: entry.contentHash,
    overall: entry.overall as DiagnosisOverall,
    issueCounts,
    mechanicalOnly: entry.mechanicalOnly,
    rulesVersion: entry.rulesVersion,
    model: entry.model,
    checkedAt: entry.checkedAt,
  };
}

/** 过滤非法条目（防御手改的脏 JSON） */
export function sanitizeDiagnosisSummaries(raw: unknown): Record<string, SkillDiagnosisSummary> {
  const out: Record<string, SkillDiagnosisSummary> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const item = sanitizeDiagnosisSummary(value);
    if (item) out[item.hubRelativePath] = item;
  }
  return out;
}

/**
 * 增量合并一条摘要：读取-合并（按 hubRelativePath 覆盖），不丢既有条目。
 * @throws 条目非法时抛错（由调用方计入 rejected，不整体失败）
 */
export function mergeDiagnosisSummary(
  records: Record<string, SkillDiagnosisSummary>,
  next: SkillDiagnosisSummary,
): Record<string, SkillDiagnosisSummary> {
  const item = sanitizeDiagnosisSummary(next);
  if (!item) {
    throw new Error('诊断摘要字段非法（overall 越界或计数非非负整数）');
  }
  return { ...sanitizeDiagnosisSummaries(records), [item.hubRelativePath]: item };
}

/** 当前正文哈希不一致（或读不到正文）即视为过期 */
export function isDiagnosisSummaryStale(
  record: SkillDiagnosisSummary,
  currentContentHash: string | null,
): boolean {
  return currentContentHash === null || record.contentHash !== currentContentHash;
}

/** 转展示投影（含过期标记，不带哈希与路径） */
export function toDiagnosisSummaryView(
  record: SkillDiagnosisSummary,
  currentContentHash: string | null,
): SkillDiagnosisSummaryView {
  return {
    overall: record.overall,
    issueCounts: { ...record.issueCounts },
    mechanicalOnly: record.mechanicalOnly,
    rulesVersion: record.rulesVersion,
    model: record.model,
    checkedAt: record.checkedAt,
    stale: isDiagnosisSummaryStale(record, currentContentHash),
  };
}
