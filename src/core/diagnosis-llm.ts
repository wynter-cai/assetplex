/**
 * AI 增量执行器（add-diagnosis-rules T4）
 *
 * AI 只做语义增量：候选规则 = 规则集中 mode=llm 且适用于该资产类别的条目；
 * 输出必须从候选 ruleId 中选，且证据片段必须能在原文定位，否则整条丢弃计入 rejected。
 * 发送层只包含：类别、库内相对路径、静态命中片段、候选规则与信号——不发全文、不发绝对路径。
 * 静态结论优先：同 ruleId 的 AI 结论只补充 impact / suggestion，不替换静态严重度与来源。
 *
 * spec: 设计文档/changes/add-diagnosis-rules/specs/diagnosis-rules.spec.md Requirement 2 / 3 / 7
 */

import { evidenceAt, readDocument, SNIPPET_MAX_LENGTH, type DocumentView } from './diagnosis-evidence.js';
import { ruleAppliesToKind, ruleTitle } from './diagnosis-static.js';
import { extractJsonObjectText } from './llm-output.js';
import type { LlmClient } from './skill-ai-classification.js';
import {
  DIAGNOSIS_CONFIDENCES,
  DIAGNOSIS_SEVERITIES,
  type DiagnosisConfidence,
  type DiagnosisRule,
  type DiagnosisRuleSet,
  type DiagnosisSeverity,
  type DoctorAssetKind,
  type RuleFinding,
} from './types.js';

/** 单次请求字符预算（user 文本）；超出即按 budget 降级，不发请求 */
export const INCREMENTAL_CHAR_BUDGET = 4000;

/** 静态命中片段上限：只发最相关的几条，避免长文刷屏 */
export const MAX_SENT_SNIPPETS = 6;

export interface IncrementalInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  content: string;
  /** 静态阶段 findings（提供命中片段与「不要重复定罪」的上下文） */
  staticFindings: RuleFinding[];
  ruleSet: DiagnosisRuleSet;
}

/** 候选规则：只有 mode=llm 且适用于该资产类别（含 cross.appliesTo）的规则可被 AI 选中 */
export function candidateRules(ruleSet: DiagnosisRuleSet, kind: DoctorAssetKind): DiagnosisRule[] {
  return ruleSet.rules.filter((rule) => rule.mode === 'llm' && ruleAppliesToKind(rule, kind));
}

export interface IncrementalPrompt {
  system: string;
  user: string;
  /** user 字符数（预算判定与隐私披露用） */
  sentChars: number;
  candidateCount: number;
}

function collectSnippets(findings: RuleFinding[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      if (lines.length >= MAX_SENT_SNIPPETS) return lines;
      const key = `${evidence.line ?? 'x'}:${evidence.snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- 第 ${evidence.line ?? '?'} 行：${evidence.snippet}`);
    }
  }
  return lines;
}

/** 构造增量 prompt（导出便于测试隐私边界） */
export function buildIncrementalPrompt(input: IncrementalInput): IncrementalPrompt {
  const candidates = candidateRules(input.ruleSet, input.kind);
  const snippets = collectSnippets(input.staticFindings);
  const system = [
    `你是资产诊断的语义增量评审。资产类别：${input.kind}。`,
    '只能从候选规则中选择，不得自造 ruleId；不确定就不下结论。',
    '每条结论必须引用 user 提供的片段：snippet 必须是片段原文的子串，line 是片段所在行号。',
    '静态阶段已命中的问题不要重复定罪，可补充影响与改法。',
    '只输出 JSON：{"findings":[{"ruleId":"...","severity":"high|medium|low","confidence":"high|medium|low","finding":"哪里有问题","impact":"不修会怎样","suggestion":"怎么改","evidence":[{"line":12,"snippet":"原文片段"}]}]}',
    '没有成立项输出 {"findings":[]}，不得凑数。',
  ].join('\n');
  const user = [
    `【资产类别】${input.kind}`,
    `【库内路径】${input.hubRelativePath}`,
    snippets.length === 0 ? '【静态命中片段】无' : `【静态命中片段】\n${snippets.join('\n')}`,
    `【候选规则】\n${candidates.map((rule) => `- ${rule.id}（${rule.severity}）${rule.signal}`).join('\n')}`,
  ].join('\n\n');
  return { system, user, sentChars: user.length, candidateCount: candidates.length };
}

export interface IncrementalParseContext {
  candidates: DiagnosisRule[];
  hubRelativePath: string;
  doc: DocumentView;
}

export interface IncrementalParseResult {
  findings: RuleFinding[];
  /** 被丢弃的模型条目数（非法编号 / 编造片段 / 结构缺失） */
  rejected: number;
}

function isSeverity(value: unknown): value is DiagnosisSeverity {
  return typeof value === 'string' && (DIAGNOSIS_SEVERITIES as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is DiagnosisConfidence {
  return typeof value === 'string' && (DIAGNOSIS_CONFIDENCES as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** 把模型给的片段定位回原文行；定位失败返回 null（整条丢弃） */
function locateLine(doc: DocumentView, line: unknown, snippet: string): number | null {
  if (typeof line === 'number' && Number.isInteger(line) && line >= 1 && line <= doc.lines.length) {
    if ((doc.lines[line - 1] ?? '').includes(snippet)) return line;
  }
  const index = doc.lines.findIndex((item) => item.includes(snippet));
  return index === -1 ? null : index + 1;
}

interface RawEvidence {
  line: unknown;
  snippet: string;
}

function parseEvidenceList(raw: unknown): RawEvidence[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: RawEvidence[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return [];
    const e = item as Record<string, unknown>;
    if (!isNonEmptyString(e['snippet'])) return [];
    out.push({ line: e['line'], snippet: e['snippet'].trim().slice(0, SNIPPET_MAX_LENGTH) });
  }
  return out;
}

function buildFinding(
  rule: DiagnosisRule,
  entry: Record<string, unknown>,
  evidence: RawEvidence[],
  context: IncrementalParseContext,
  index: number,
): RuleFinding | null {
  if (!isNonEmptyString(entry['finding']) || !isNonEmptyString(entry['suggestion'])) return null;
  const located: Array<{ line: number; snippet: string }> = [];
  for (const item of evidence) {
    const line = locateLine(context.doc, item.line, item.snippet);
    if (line === null) return null;
    located.push({ line, snippet: item.snippet });
  }
  const first = located[0];
  if (first === undefined) return null;
  return {
    id: `${rule.id}:${context.hubRelativePath}:${first.line}:${index}`,
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    confidence: isConfidence(entry['confidence']) ? entry['confidence'] : 'medium',
    source: 'llm',
    title: ruleTitle(rule),
    finding: entry['finding'],
    impact: isNonEmptyString(entry['impact']) ? entry['impact'] : '',
    suggestion: entry['suggestion'],
    evidence: located.map((item) => evidenceAt(context.hubRelativePath, context.doc.lines, item.line)),
    insufficientEvidence: false,
    fixable: true,
    ignored: false,
  };
}

/**
 * 解析增量输出：非法条目单条丢弃，不影响其他条目；整体不可解析时 rejected=1 且不抛错
 * （AI 是增量，失败不应让静态结论一起消失）。
 */
export function parseIncrementalOutput(
  output: string,
  context: IncrementalParseContext,
): IncrementalParseResult {
  const jsonText = extractJsonObjectText(output);
  if (jsonText === null) return { findings: [], rejected: 1 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { findings: [], rejected: 1 };
  }
  if (typeof parsed !== 'object' || parsed === null) return { findings: [], rejected: 1 };
  const rawFindings = (parsed as Record<string, unknown>)['findings'];
  if (!Array.isArray(rawFindings)) return { findings: [], rejected: 1 };

  const byId = new Map(context.candidates.map((rule) => [rule.id, rule]));
  const seen = new Set<string>();
  const findings: RuleFinding[] = [];
  let rejected = 0;
  for (const [index, raw] of rawFindings.entries()) {
    if (typeof raw !== 'object' || raw === null) {
      rejected += 1;
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const rule = typeof entry['ruleId'] === 'string' ? byId.get(entry['ruleId']) : undefined;
    if (rule === undefined || seen.has(rule.id) || !isSeverity(entry['severity'])) {
      rejected += 1;
      continue;
    }
    const evidence = parseEvidenceList(entry['evidence']);
    const finding = buildFinding(rule, entry, evidence, context, index);
    if (finding === null) {
      rejected += 1;
      continue;
    }
    seen.add(rule.id);
    findings.push(finding);
  }
  return { findings, rejected };
}

/**
 * 静态优先合并：同 ruleId 的 AI 结论只补充 impact / suggestion，严重度与来源保持静态值；
 * AI 发现的新规则结论追加在静态结论之后（静态结论永不因模型而消失）。
 */
export function mergeIncrementalFindings(
  staticFindings: RuleFinding[],
  llmFindings: RuleFinding[],
): RuleFinding[] {
  const byRule = new Map(llmFindings.map((finding) => [finding.ruleId, finding]));
  const merged = staticFindings.map((finding) => {
    const llm = byRule.get(finding.ruleId);
    if (llm === undefined) return finding;
    byRule.delete(finding.ruleId);
    return {
      ...finding,
      impact: llm.impact !== '' ? llm.impact : finding.impact,
      suggestion: llm.suggestion !== '' ? llm.suggestion : finding.suggestion,
    };
  });
  return [...merged, ...byRule.values()];
}

export interface IncrementalDeps {
  llm: LlmClient;
  /** 单次请求字符预算；缺省 INCREMENTAL_CHAR_BUDGET */
  charBudget?: number;
}

export interface IncrementalRunResult {
  /** 合并后的完整 findings（静态结论始终保留） */
  findings: RuleFinding[];
  rejected: number;
  candidateCount: number;
  /** null = AI 已执行；budget / timeout = 降级原因（不返回假健康） */
  skippedReason: 'budget' | 'timeout' | null;
}

/** 执行一次 AI 增量：候选为空不发请求；超预算或超时不抛错，静态结论原样保留 */
export async function runIncrementalChecks(
  input: IncrementalInput,
  deps: IncrementalDeps,
): Promise<IncrementalRunResult> {
  const candidates = candidateRules(input.ruleSet, input.kind);
  const base = { findings: [...input.staticFindings], rejected: 0, candidateCount: candidates.length };
  if (candidates.length === 0) return { ...base, skippedReason: null };

  const prompt = buildIncrementalPrompt(input);
  if (prompt.sentChars > (deps.charBudget ?? INCREMENTAL_CHAR_BUDGET)) {
    return { ...base, skippedReason: 'budget' };
  }

  let raw: string;
  try {
    raw = await deps.llm.chat({ system: prompt.system, user: prompt.user });
  } catch {
    return { ...base, skippedReason: 'timeout' };
  }

  const parsed = parseIncrementalOutput(raw, {
    candidates,
    hubRelativePath: input.hubRelativePath,
    doc: readDocument(input.content),
  });
  return {
    findings: mergeIncrementalFindings(input.staticFindings, parsed.findings),
    rejected: parsed.rejected,
    candidateCount: candidates.length,
    skippedReason: null,
  };
}
