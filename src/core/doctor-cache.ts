/**
 * 诊断报告内容哈希缓存纯逻辑（add-asset-doctor，与 arbitration-cache 同构）
 *
 * key = sha256(类别 + 资产正文 + 规则集哈希 + model)：内容变、规则增删改、
 * 换模型——key 即变，缓存自然失效（spec Scenario 4 / 6.2）。
 * Node 实现读写 ~/.assetplex/doctor-reports.json（server 层注入）。
 */

import { createHash } from 'node:crypto';
import {
  DIAGNOSIS_CONFIDENCES,
  DIAGNOSIS_OVERALLS,
  DIAGNOSIS_SEVERITIES,
  DOCTOR_ASSET_KINDS,
  RULE_CATEGORIES,
  type DiagnosisOverall,
  type DiagnosisRuleSet,
  type DoctorAssetKind,
  type FindingEvidence,
  type RuleFinding,
} from './types.js';

/** 缓存条目 = 模型给出的语义增量结论（静态结论每次重算，不入缓存） */
export interface DoctorCacheEntry {
  /** 合并后的 findings（静态 + AI）；AI 未实际参与时不写缓存 */
  findings: RuleFinding[];
  /** 被丢弃的模型条目数 */
  rejected: number;
  /** 本轮候选语义规则数（0 = 该类别无语义规则，缓存也不代表 AI 参与过） */
  candidateCount: number;
  model: string;
  rulesVersion: string;
  generatedAt: string;
}

/** 缓存存储抽象（key = 诊断输入 sha256 十六进制） */
export interface DoctorCacheStore {
  load(): Record<string, DoctorCacheEntry>;
  save(entries: Record<string, DoctorCacheEntry>): void;
}

/** 诊断缓存 key：类别 + 正文 + 规则集 + 模型规范化拼接后 sha256 */
export function computeDoctorCacheKey(input: {
  kind: string;
  content: string;
  /** 规则集指纹：规则编号 / 严重度 / 模式 / 版本任一变化都会让缓存失效 */
  rulesHash: string;
  model: string;
}): string {
  const canonical = [input.kind, input.content, input.rulesHash, input.model].join('\u0000');
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/** 规则集指纹：版本 + 每条规则的编号/严重度/模式（规则集未加载返回空串） */
export function hashRuleSet(ruleSet: DiagnosisRuleSet | null): string {
  if (ruleSet === null) return '';
  const canonical = [ruleSet.version, ...ruleSet.rules.map((rule) => `${rule.id}:${rule.severity}:${rule.mode}`)].join(
    '\u0000',
  );
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isClosedSet<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function isValidEvidence(value: unknown): value is FindingEvidence {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  const lineOk = e['line'] === null || (typeof e['line'] === 'number' && Number.isInteger(e['line']));
  return typeof e['hubRelativePath'] === 'string' && lineOk && typeof e['snippet'] === 'string';
}

function isValidFinding(value: unknown): value is RuleFinding {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    isNonEmptyString(e['id']) &&
    isNonEmptyString(e['ruleId']) &&
    isClosedSet(e['category'], RULE_CATEGORIES) &&
    isClosedSet(e['severity'], DIAGNOSIS_SEVERITIES) &&
    isClosedSet(e['confidence'], DIAGNOSIS_CONFIDENCES) &&
    (e['source'] === 'rule' || e['source'] === 'llm') &&
    typeof e['title'] === 'string' &&
    typeof e['finding'] === 'string' &&
    typeof e['impact'] === 'string' &&
    typeof e['suggestion'] === 'string' &&
    Array.isArray(e['evidence']) &&
    e['evidence'].every(isValidEvidence) &&
    typeof e['insufficientEvidence'] === 'boolean' &&
    typeof e['fixable'] === 'boolean' &&
    typeof e['ignored'] === 'boolean'
  );
}

/** 过滤非法条目（fields 残缺 / 闭集外取值），防御手改的脏 JSON */
export function sanitizeDoctorEntries(raw: unknown): Record<string, DoctorCacheEntry> {
  const out: Record<string, DoctorCacheEntry> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const e = value as Record<string, unknown>;
    if (
      !Array.isArray(e['findings']) ||
      !e['findings'].every(isValidFinding) ||
      typeof e['rejected'] !== 'number' ||
      typeof e['candidateCount'] !== 'number' ||
      !isNonEmptyString(e['model']) ||
      typeof e['rulesVersion'] !== 'string' ||
      !isNonEmptyString(e['generatedAt'])
    ) {
      continue;
    }
    out[key] = {
      findings: e['findings'] as RuleFinding[],
      rejected: e['rejected'],
      candidateCount: e['candidateCount'],
      model: e['model'],
      rulesVersion: e['rulesVersion'],
      generatedAt: e['generatedAt'],
    };
  }
  return out;
}

// ============ 上次运行摘要（refactor-asset-pipeline T1，api-contract） ============

/** 三要素指纹：内容 sha256 / 规则集指纹 / 模型名（与 computeDoctorCacheKey 同源） */
export interface DoctorInputFingerprint {
  contentHash: string;
  rulesHash: string;
  model: string;
}

/** 指纹变化项：正文变更 / 规则集更新 / 模型更换 */
export type DoctorStaleReason = 'content' | 'rules' | 'model';

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

/** 三要素差异，顺序固定 content → rules → model */
export function diffLastRunInputs(
  stored: DoctorInputFingerprint,
  current: DoctorInputFingerprint,
): DoctorStaleReason[] {
  const reasons: DoctorStaleReason[] = [];
  if (stored.contentHash !== current.contentHash) reasons.push('content');
  if (stored.rulesHash !== current.rulesHash) reasons.push('rules');
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

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidFingerprint(value: unknown): value is DoctorInputFingerprint {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return isNonEmptyString(f.contentHash) && typeof f.rulesHash === 'string' && typeof f.model === 'string';
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
