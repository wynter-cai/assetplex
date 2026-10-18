/**
 * 诊断报告内容哈希缓存纯逻辑（add-asset-doctor，与 arbitration-cache 同构）
 *
 * key = sha256(类别 + 资产正文 + 准则集哈希 + model)：内容变、准则增删改、
 * 换模型——key 即变，缓存自然失效（spec Scenario 4）。
 * Node 实现读写 ~/.assetplex/doctor-reports.json（server 层注入）。
 */

import { createHash } from 'node:crypto';
import { DIAGNOSIS_OVERALLS, type DiagnosisIssue, type DiagnosisOverall } from './types.js';

/** 缓存条目 = 模型的语义结论（机械项不入缓存，每次重跑） */
export interface DoctorCacheEntry {
  overall: DiagnosisOverall;
  issues: DiagnosisIssue[];
  model: string;
  criteriaUsed: string[];
  criteriaSkipped: number;
  generatedAt: string;
}

/** 缓存存储抽象（key = 诊断输入 sha256 十六进制） */
export interface DoctorCacheStore {
  load(): Record<string, DoctorCacheEntry>;
  save(entries: Record<string, DoctorCacheEntry>): void;
}

/** 诊断缓存 key：四要素规范化拼接后 sha256 */
export function computeDoctorCacheKey(input: {
  kind: string;
  content: string;
  criteriaHash: string;
  model: string;
}): string {
  const canonical = [input.kind, input.content, input.criteriaHash, input.model].join('\u0000');
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

function isValidIssue(value: unknown): value is DiagnosisIssue {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.criterion === 'string' &&
    typeof e.finding === 'string' &&
    typeof e.suggestion === 'string' &&
    typeof e.severity === 'string'
  );
}

/** 过滤非法条目（overall 闭集外 / issue 残缺 / 字段类型错），防御手改的脏 JSON */
export function sanitizeDoctorEntries(raw: unknown): Record<string, DoctorCacheEntry> {
  const out: Record<string, DoctorCacheEntry> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const e = value as Record<string, unknown>;
    if (
      typeof e.overall !== 'string' ||
      !(DIAGNOSIS_OVERALLS as readonly string[]).includes(e.overall) ||
      !Array.isArray(e.issues) ||
      !e.issues.every(isValidIssue) ||
      typeof e.model !== 'string' ||
      e.model === '' ||
      !Array.isArray(e.criteriaUsed) ||
      !e.criteriaUsed.every((c) => typeof c === 'string') ||
      typeof e.criteriaSkipped !== 'number' ||
      typeof e.generatedAt !== 'string' ||
      e.generatedAt === ''
    ) {
      continue;
    }
    out[key] = {
      overall: e.overall as DiagnosisOverall,
      issues: e.issues as DiagnosisIssue[],
      model: e.model,
      criteriaUsed: e.criteriaUsed as string[],
      criteriaSkipped: e.criteriaSkipped,
      generatedAt: e.generatedAt,
    };
  }
  return out;
}
