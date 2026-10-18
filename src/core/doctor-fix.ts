/**
 * 资产医生修复草案引擎（add-asset-doctor F1）
 *
 * 草案 = 「原文 × 选中的 fixable 问题 × 准则」的修订全文：与诊断同基建（criteria/LlmClient/sha256 缓存），
 * 但信任红线更强（proposal D2）：本模块只产文本，零写库；落盘必须走 apply 的用户显式确认。
 * 超长资产直接拒绝（fix spec Scenario 7）：草案无法对未审视内容负责。
 *
 * spec: 设计文档/changes/add-asset-doctor/specs/fix-and-distribute.spec.md
 */

import { createHash } from 'node:crypto';
import { assembleCriteriaPromptBlock, hashCriteria, type CriterionAsset } from './criteria.js';
import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import type { LlmClient } from './skill-ai-classification.js';
import { extractJsonObjectText } from './llm-output.js';
import { DIAGNOSIS_CONTENT_LIMIT, DiagnosisAssetError } from './doctor.js';
import type { DiagnosisIssue, DoctorAssetKind } from './types.js';

// ============ 错误（路由映射：Unavailable/Truncated → 400，Output → 422，Asset → 404） ============

/** 模型输出非法（草案解析失败，路由映射 422） */
export class FixDraftOutputError extends Error {
  constructor(reason: string) {
    super(`草案失败：${reason}`);
    this.name = 'FixDraftOutputError';
  }
}

/** 资产超出审视上限：拒绝生成（路由映射 400，fix spec Scenario 7） */
export class FixDraftTruncatedError extends Error {
  constructor() {
    super(`草案失败：资产正文超出审视上限（${DIAGNOSIS_CONTENT_LIMIT} 字符），草案无法对未审视内容负责，请精简后再修复`);
    this.name = 'FixDraftTruncatedError';
  }
}

/** AI 未配置：草案必须走模型，与诊断的机械降级不同（路由映射 400） */
export class FixDraftUnavailableError extends Error {
  constructor() {
    super('AI 端点未配置，无法生成修复草案');
    this.name = 'FixDraftUnavailableError';
  }
}

// ============ prompt 组装 ============

const KIND_LABEL: Record<DoctorAssetKind, string> = {
  identity: '身份/人设（identity）',
  skill: '技能（skill）',
  rule: '规则（rule）',
  agent: '子代理（agent）',
  command: '斜杠命令（command）',
};

/** 选中的待修复问题：index = 在诊断报告 issues 数组中的下标（changeNotes 对齐用） */
export interface SelectedFixIssue {
  index: number;
  issue: DiagnosisIssue;
}

export interface FixDraftPromptInput {
  kind: DoctorAssetKind;
  content: string;
  /** 准则区文本；空串=仅内置基线 */
  criteriaBlock: string;
  selected: SelectedFixIssue[];
}

export interface FixDraftPrompt {
  system: string;
  user: string;
  /** 正文超出审视上限（generate 层据此拒绝，prompt 本身不截断） */
  contentTruncated: boolean;
}

/** 构造草案 prompt（导出便于测试约束内容，同 buildDiagnosisPrompt 惯例） */
export function buildFixDraftPrompt(input: FixDraftPromptInput): FixDraftPrompt {
  const systemParts = [
    [
      `你是资产医生，负责生成修复草案。待修复资产类别：${KIND_LABEL[input.kind]}。`,
      '基于资产原文与选定问题，输出修复后的完整文件内容（draftContent，含 frontmatter 全文）。',
      '只修复选定问题对应的内容，其余部分原样保留：不增删无关段落，不顺手润色。',
      'changeNotes 逐问题交代改动：issueIndex 取问题清单里的编号，note 用中文说明改在哪、改了什么。',
      '只输出 JSON：{"draftContent":"...","changeNotes":[{"issueIndex":0,"note":"..."}]}',
    ].join('\n'),
  ];
  if (input.criteriaBlock.trim() !== '') {
    systemParts.push(
      ['修复后的内容须符合以下裁决准则（来自维护者资产库，按优先级排列）：', input.criteriaBlock].join('\n'),
    );
  }

  const issueLines = input.selected.map(
    (s) => `[${s.index}]（${s.issue.severity}）${s.issue.finding}\n    修复建议：${s.issue.suggestion}`,
  );
  const userParts = [
    `【资产原文】\n${input.content}`,
    ['【选定待修复问题】（changeNotes 的 issueIndex 使用下列编号）', ...issueLines].join('\n'),
  ];
  return {
    system: systemParts.join('\n\n'),
    user: userParts.join('\n\n'),
    contentTruncated: input.content.length > DIAGNOSIS_CONTENT_LIMIT,
  };
}

// ============ 输出解析（失败隔离同诊断：非法即 throw，不产半成品） ============

export interface ParsedFixDraft {
  draftContent: string;
  changeNotes: Array<{ issueIndex: number; note: string }>;
}

/** 解析模型输出为草案；draftContent 必须是非空字符串，changeNotes 缺失宽容为 [] */
export function parseFixDraftOutput(output: string): ParsedFixDraft {
  const jsonText = extractJsonObjectText(output);
  if (jsonText === null) throw new FixDraftOutputError('输出中找不到 JSON 对象');
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new FixDraftOutputError('JSON 无法解析');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new FixDraftOutputError('输出不是 JSON 对象');
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.draftContent !== 'string' || obj.draftContent === '') {
    throw new FixDraftOutputError('缺少 draftContent 草案全文');
  }

  const changeNotes: Array<{ issueIndex: number; note: string }> = [];
  if (Array.isArray(obj.changeNotes)) {
    for (const raw of obj.changeNotes) {
      if (typeof raw !== 'object' || raw === null) continue;
      const e = raw as Record<string, unknown>;
      if (typeof e.issueIndex !== 'number' || !Number.isInteger(e.issueIndex)) continue;
      if (typeof e.note !== 'string' || e.note.trim() === '') continue;
      changeNotes.push({ issueIndex: e.issueIndex, note: e.note });
    }
  }
  return { draftContent: obj.draftContent, changeNotes };
}

// ============ 草案缓存（与 doctor-cache 同构：内容变/准则变/换模型/问题集变 → key 变） ============

/** 缓存条目 = 模型产出的草案文本（同一原文同一问题集不必重复调用） */
export interface FixDraftCacheEntry {
  draftContent: string;
  changeNotes: Array<{ issueIndex: number; note: string }>;
  model: string;
  generatedAt: string;
}

export interface FixDraftCacheStore {
  load(): Record<string, FixDraftCacheEntry>;
  save(entries: Record<string, FixDraftCacheEntry>): void;
}

/** 草案缓存 key：类别+正文+准则哈希+model+问题下标集（排序去序） */
export function computeFixDraftCacheKey(input: {
  kind: string;
  content: string;
  criteriaHash: string;
  model: string;
  issueIndexes: number[];
}): string {
  const indexes = [...input.issueIndexes].sort((a, b) => a - b).join(',');
  const canonical = [input.kind, input.content, input.criteriaHash, input.model, indexes].join('\u0000');
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/** 过滤非法条目（字段类型错 / 手改的脏 JSON） */
export function sanitizeFixDraftEntries(raw: unknown): Record<string, FixDraftCacheEntry> {
  const out: Record<string, FixDraftCacheEntry> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const e = value as Record<string, unknown>;
    if (
      typeof e.draftContent !== 'string' ||
      e.draftContent === '' ||
      !Array.isArray(e.changeNotes) ||
      typeof e.model !== 'string' ||
      e.model === '' ||
      typeof e.generatedAt !== 'string' ||
      e.generatedAt === ''
    ) {
      continue;
    }
    const changeNotes: Array<{ issueIndex: number; note: string }> = [];
    for (const rawNote of e.changeNotes) {
      if (typeof rawNote !== 'object' || rawNote === null) continue;
      const n = rawNote as Record<string, unknown>;
      if (typeof n.issueIndex !== 'number' || typeof n.note !== 'string') continue;
      changeNotes.push({ issueIndex: n.issueIndex, note: n.note });
    }
    out[key] = {
      draftContent: e.draftContent,
      changeNotes,
      model: e.model,
      generatedAt: e.generatedAt,
    };
  }
  return out;
}

// ============ 草案生成 ============

export interface FixDraftInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  selected: SelectedFixIssue[];
}

export interface FixDraftDeps {
  fs: { read(hubRelativePath: string): string | null };
  getCriteria(): CriterionAsset[];
  cache: FixDraftCacheStore;
  llm: LlmClient;
  config: AiClassifyConfig | null;
  now?: () => string;
}

export interface FixDraftResult {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  draftContent: string;
  changeNotes: Array<{ issueIndex: number; note: string }>;
  /** 成功返回时恒 false（超长已在生成前拒绝）；契约保留字段供前端类型对齐 */
  contentTruncated: boolean;
  cached: boolean;
  model: string;
  generatedAt: string;
}

/**
 * 生成修复草案：只调模型产文本，零写库（Scenario 1）。
 * 顺序守卫：读文件(404) → AI 配置(400) → 超长拒绝(400) → 缓存 → 模型 → 解析(422 不落缓存)。
 */
export async function generateFixDraft(input: FixDraftInput, deps: FixDraftDeps): Promise<FixDraftResult> {
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const content = deps.fs.read(input.hubRelativePath);
  if (content === null) throw new DiagnosisAssetError(input.hubRelativePath);

  const config = deps.config;
  if (config === null || !isAiConfigComplete(config)) throw new FixDraftUnavailableError();
  if (content.length > DIAGNOSIS_CONTENT_LIMIT) throw new FixDraftTruncatedError();

  const criteria = deps.getCriteria();
  const { block } = assembleCriteriaPromptBlock(criteria, input.kind);
  const key = computeFixDraftCacheKey({
    kind: input.kind,
    content,
    criteriaHash: hashCriteria(criteria),
    model: config.model,
    issueIndexes: input.selected.map((s) => s.index),
  });

  const entries = sanitizeFixDraftEntries(deps.cache.load());
  const hit = entries[key] ?? null;
  if (hit !== null) {
    return {
      kind: input.kind,
      hubRelativePath: input.hubRelativePath,
      draftContent: hit.draftContent,
      changeNotes: hit.changeNotes,
      contentTruncated: false,
      cached: true,
      model: hit.model,
      generatedAt: hit.generatedAt,
    };
  }

  const prompt = buildFixDraftPrompt({
    kind: input.kind,
    content,
    criteriaBlock: block,
    selected: input.selected,
  });
  const output = await deps.llm.chat({ system: prompt.system, user: prompt.user });
  const parsed = parseFixDraftOutput(output);
  const entry: FixDraftCacheEntry = {
    draftContent: parsed.draftContent,
    changeNotes: parsed.changeNotes,
    model: config.model,
    generatedAt: now,
  };
  entries[key] = entry;
  deps.cache.save(entries);

  return {
    kind: input.kind,
    hubRelativePath: input.hubRelativePath,
    draftContent: parsed.draftContent,
    changeNotes: parsed.changeNotes,
    contentTruncated: false,
    cached: false,
    model: config.model,
    generatedAt: now,
  };
}
