/**
 * 诊断报告内容哈希缓存纯逻辑（add-asset-doctor，与 arbitration-cache 同构）
 *
 * key = sha256(类别 + 资产正文 + 准则集哈希 + model)：内容变、准则增删改、
 * 换模型——key 即变，缓存自然失效（spec Scenario 4）。
 * Node 实现读写 ~/.assetplex/doctor-reports.json（server 层注入）。
 */

import { createHash } from 'node:crypto';
import {
  DIAGNOSIS_OVERALLS,
  DOCTOR_ASSET_KINDS,
  type DiagnosisIssue,
  type DiagnosisOverall,
  type DoctorAssetKind,
} from './types.js';

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

/** 诊断缓存 key：类别 + 正文 + 准则集 + 模型（+ 规则集版本）规范化拼接后 sha256 */
export function computeDoctorCacheKey(input: {
  kind: string;
  content: string;
  criteriaHash: string;
  model: string;
  /** 规则集版本：传入即纳入 key，规则升级后缓存自然失效（spec Scenario 6.2） */
  rulesVersion?: string;
}): string {
  const canonical = [input.kind, input.content, input.criteriaHash, input.model, input.rulesVersion ?? ''].join(
    '\u0000',
  );
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

// ============ 上次运行摘要（refactor-asset-pipeline T1，api-contract） ============

/** 三要素指纹：内容 sha256 / 准则集 sha256 / 模型名（与 computeDoctorCacheKey 同源） */
export interface DoctorInputFingerprint {
  contentHash: string;
  criteriaHash: string;
  model: string;
}

/** 指纹变化项：正文变更 / 准则集更新 / 模型更换 */
export type DoctorStaleReason = 'content' | 'criteria' | 'model';

/** 上次运行摘要（不含正文、不含绝对路径） */
export interface DoctorLastRunSummary {
  overall: DiagnosisOverall;
  issueCount: number;
  highSeverityCount: number;
  fixableCount: number;
  ignoredCount: number;
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  generatedAt: string;
}

/** 本机持久化记录：摘要 + 三要素指纹（唯一写入点 = 诊断成功路径） */
export interface DoctorLastRunRecord extends DoctorLastRunSummary {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  inputs: DoctorInputFingerprint;
}

/** 记录存储抽象（Node 实现 ~/.assetplex/doctor-last.json；缺省不写） */
export interface DoctorLastRunStore {
  load(): unknown;
  save(records: Record<string, DoctorLastRunRecord>): void;
}

/** GET /api/doctor/summary 响应（零模型，见 api-contract DoctorSummaryResponse） */
export interface DoctorSummaryResponse {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  available: boolean;
  state: 'never' | 'valid' | 'stale';
  lastRun: DoctorLastRunSummary | null;
  staleReasons: DoctorStaleReason[];
  aiConfigured: boolean;
  willCallModel: boolean;
}

/** 记录 key：类别 + '\u0000' + 库内相对路径（与内容哈希去重口径一致） */
export function doctorLastRunKey(kind: DoctorAssetKind, hubRelativePath: string): string {
  return `${kind}\u0000${hubRelativePath}`;
}

/** 内容指纹（与 computeDoctorCacheKey 同一套 sha256 口径） */
export function hashDoctorContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** 三要素差异，顺序固定 content → criteria → model */
export function diffLastRunInputs(
  stored: DoctorInputFingerprint,
  current: DoctorInputFingerprint,
): DoctorStaleReason[] {
  const reasons: DoctorStaleReason[] = [];
  if (stored.contentHash !== current.contentHash) reasons.push('content');
  if (stored.criteriaHash !== current.criteriaHash) reasons.push('criteria');
  if (stored.model !== current.model) reasons.push('model');
  return reasons;
}

/** 剥离指纹与定位字段，只回摘要（指纹是本机自用，不进响应） */
export function toDoctorLastRunSummary(record: DoctorLastRunRecord): DoctorLastRunSummary {
  return {
    overall: record.overall,
    issueCount: record.issueCount,
    highSeverityCount: record.highSeverityCount,
    fixableCount: record.fixableCount,
    ignoredCount: record.ignoredCount,
    mechanicalOnly: record.mechanicalOnly,
    rulesVersion: record.rulesVersion,
    model: record.model,
    generatedAt: record.generatedAt,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidFingerprint(value: unknown): value is DoctorInputFingerprint {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return isNonEmptyString(f.contentHash) && isNonEmptyString(f.criteriaHash) && typeof f.model === 'string';
}

/** 闭集校验一条记录：脏条目丢弃，绝不抛错（手改 JSON 不拖垮详情） */
function isValidLastRunRecord(value: unknown): value is DoctorLastRunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.kind === 'string' &&
    (DOCTOR_ASSET_KINDS as readonly string[]).includes(r.kind) &&
    typeof r.hubRelativePath === 'string' &&
    r.hubRelativePath.trim() !== '' &&
    typeof r.overall === 'string' &&
    (DIAGNOSIS_OVERALLS as readonly string[]).includes(r.overall) &&
    isCount(r.issueCount) &&
    isCount(r.highSeverityCount) &&
    isCount(r.fixableCount) &&
    isCount(r.ignoredCount) &&
    typeof r.mechanicalOnly === 'boolean' &&
    typeof r.rulesVersion === 'string' &&
    typeof r.model === 'string' &&
    isNonEmptyString(r.generatedAt) &&
    isValidFingerprint(r.inputs)
  );
}

/** 过滤脏条目并按记录自身字段重建 key（不信任手改的 JSON 键） */
export function sanitizeDoctorLastRuns(raw: unknown): Record<string, DoctorLastRunRecord> {
  const out: Record<string, DoctorLastRunRecord> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!isValidLastRunRecord(value)) continue;
    out[doctorLastRunKey(value.kind, value.hubRelativePath)] = value;
  }
  return out;
}
