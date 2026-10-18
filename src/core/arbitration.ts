/**
 * LLM 冲突仲裁核心纯逻辑（add-llm-conflict-arbitration B1/B2）
 *
 * 仲裁是 advisory（建议）：本模块只负责构造 prompt 与解析模型输出，
 * 永不落盘。决策闭集四值之外的一切输出一律判为失败（失败隔离，
 * 最坏等于没有仲裁，手动三策略路径始终可用）。
 *
 * spec: 设计文档/changes/add-llm-conflict-arbitration/specs/conflict-arbitration.spec.md
 */

import { assembleCriteriaPromptBlock, hashCriteria, type CriterionAsset } from './criteria.js';
import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import {
  AiConfigIncompleteError,
  type LlmClient,
} from './skill-ai-classification.js';
import {
  computeArbitrationCacheKey,
  getArbitrationCached,
  saveArbitrationEntry,
  type ArbitrationCacheEntry,
  type ArbitrationCacheStore,
} from './arbitration-cache.js';
import {
  ARBITRATION_CATEGORIES,
  ARBITRATION_DECISIONS,
  type ArbitrationCategory,
  type ArbitrationDecision,
} from './types.js';

// 决策/类别闭集定义在 types.ts（共享基座），此处 re-export 保持对外导入面稳定
export { ARBITRATION_CATEGORIES, ARBITRATION_DECISIONS };
export type { ArbitrationCategory, ArbitrationDecision };

/** 单侧内容进 prompt 的截断上限（proposal 风险项：超限部分不裁决） */
export const SIDE_PROMPT_LIMIT = 6000;

/** 两侧文件读取失败专用错误（路由层映射 404，同 api-contract 错误约定） */
export class ArbitrationFileError extends Error {
  constructor(path: string) {
    super(`文件读取失败：${path}`);
    this.name = 'ArbitrationFileError';
  }
}

/** 模型输出非法专用错误（路由层映射 422「仲裁失败：<原因>」，Scenario 6） */
export class ArbitrationOutputError extends Error {
  constructor(reason: string) {
    super(`仲裁失败：${reason}`);
    this.name = 'ArbitrationOutputError';
  }
}

/** 解析后的仲裁建议（响应体的核心子集，缓存与路由层补其余披露字段） */
export interface ArbitrationSuggestion {
  decision: ArbitrationDecision;
  rationale: string;
  /** 仅 decision=merge 存在且非空（Scenario 3 草案来源） */
  mergedContent?: string;
}

export interface ArbitrationPromptInput {
  category: ArbitrationCategory;
  left: string;
  right: string;
  leftLabel?: string;
  rightLabel?: string;
  /** assembleCriteriaPromptBlock 产出的准则区文本；空串=库内无可用准则（内置基线仍生效） */
  criteriaBlock: string;
  /** 因预算被舍去的准则条数，>0 时向模型披露 */
  criteriaSkipped: number;
}

/** 内置裁决骨架：不依赖任何外部资产的最小基线（spec「定义」节） */
function buildSystemSkeleton(category: ArbitrationCategory): string {
  return [
    `你是资产冲突裁决器。待裁决资产类别：${category}。`,
    '同一资产存在两个分叉版本（导入版 vs 现有版），请对比内容语义后裁决如何合并。',
    '决策取值闭集（只能四选一）：',
    '- keep-left：保留导入版（覆盖现有版）',
    '- keep-right：保留现有版（放弃导入版）',
    '- merge：两版内容互补，产出合并后的完整草案 mergedContent（全文，不是 diff 片段）',
    '- manual-review：差异语义复杂或你不确定，交人工处理',
    '倾向性基线：优先保留更多信息与更新意图的一侧；纯格式差异不构成覆盖理由；',
    '拿不准就 manual-review，错误覆盖的代价高于放过。',
    '只输出 JSON：{"decision":"...","rationale":"...","mergedContent":"..."}，',
    'rationale 用中文简述理由；仅 merge 时必须给 mergedContent，其余决策不要输出该字段。',
  ].join('\n');
}

/** 截断单侧内容；超限部分不进 prompt，显式标注让模型只对有见内容负责 */
function truncateSide(label: string, content: string): string {
  if (content.length <= SIDE_PROMPT_LIMIT) return `【${label}】\n${content}`;
  return `【${label}（超长，仅前 ${SIDE_PROMPT_LIMIT} 字符可见，余下已截断，截断部分不参与裁决）】\n${content.slice(0, SIDE_PROMPT_LIMIT)}`;
}

/** 构造仲裁 prompt（导出便于测试约束内容，同 buildClassifyPrompt 惯例） */
export function buildArbitrationPrompt(input: ArbitrationPromptInput): { system: string; user: string } {
  const systemParts = [buildSystemSkeleton(input.category)];
  if (input.criteriaBlock.trim() !== '') {
    systemParts.push(
      [
        '裁决时须依据以下裁决准则（来自维护者资产库，按优先级排列）：',
        input.criteriaBlock,
      ].join('\n'),
    );
    if (input.criteriaSkipped > 0) {
      systemParts.push(`（另有 ${input.criteriaSkipped} 条准则因预算未参与本次裁决）`);
    }
  }
  const user = [
    truncateSide(input.leftLabel ?? '导入版', input.left),
    truncateSide(input.rightLabel ?? '现有版', input.right),
  ].join('\n\n');
  return { system: systemParts.join('\n\n'), user };
}

/** 从含杂文输出中提取最外层 JSON 对象文本（首个 { 到末个 }，容忍嵌套与前后缀） */
function extractJsonObjectText(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/**
 * 解析模型输出为仲裁建议（Scenario 6 失败隔离：任何非法形态 throw，
 * 由调用方映射为「仲裁失败：<原因>」，不产生半成品建议）。
 */
export function parseArbitrationOutput(output: string): ArbitrationSuggestion {
  const jsonText = extractJsonObjectText(output.trim());
  if (jsonText === null) throw new Error('输出无法解析为 JSON');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('输出无法解析为 JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('输出无法解析为 JSON');

  const record = parsed as Record<string, unknown>;
  const decision = record.decision;
  if (
    typeof decision !== 'string' ||
    !(ARBITRATION_DECISIONS as readonly string[]).includes(decision)
  ) {
    throw new Error(`决策不在闭集内：${String(decision)}`);
  }
  const rationale = typeof record.rationale === 'string' ? record.rationale : '';

  const suggestion: ArbitrationSuggestion = {
    decision: decision as ArbitrationDecision,
    rationale,
  };
  if (decision === 'merge') {
    const merged = record.mergedContent;
    if (typeof merged !== 'string' || merged.trim() === '') {
      throw new Error('merge 决策缺少合并草案 mergedContent');
    }
    suggestion.mergedContent = merged;
  }
  return suggestion;
}

// ============ 仲裁执行（B3，依赖全注入） ============

/** 仲裁请求（同 api-contract ArbitrationRequest：服务端读两侧文件） */
export interface ArbitrateInput {
  category: ArbitrationCategory;
  leftPath: string;
  rightPath: string;
  leftLabel?: string;
  rightLabel?: string;
}

export interface ArbitrateDeps {
  /** 两侧内容读取（路由层注入 Node fs 实现；读不到返 null → 报错含路径） */
  fs: { read(path: string): string | null };
  /** 准则集来源（core listCriteria 或测试夹具） */
  getCriteria: () => CriterionAsset[];
  cache: ArbitrationCacheStore;
  llm: LlmClient;
  /** 完整配置由调用方读取后传入；缺省/不完整抛 AiConfigIncompleteError（Scenario 8） */
  config?: AiClassifyConfig;
  now?: () => string;
}

/** 仲裁结果（对应 ArbitrationResponse 核心字段，路由层直接透传） */
export interface ArbitrationOutcome {
  decision: ArbitrationDecision;
  rationale: string;
  mergedContent?: string;
  criteriaUsed: string[];
  criteriaSkipped: number;
  cached: boolean;
  model: string;
  generatedAt: string;
}

/**
 * 执行一次冲突仲裁（advisory：只产建议，永不落盘）。
 * 失败隔离：模型输出非法时 parse 报错直接上抛，不写缓存（下次重调）。
 */
export async function arbitrateConflict(
  input: ArbitrateInput,
  deps: ArbitrateDeps,
): Promise<ArbitrationOutcome> {
  if (!deps.config || !isAiConfigComplete(deps.config)) {
    throw new AiConfigIncompleteError();
  }
  const left = deps.fs.read(input.leftPath);
  if (left === null) throw new ArbitrationFileError(input.leftPath);
  const right = deps.fs.read(input.rightPath);
  if (right === null) throw new ArbitrationFileError(input.rightPath);

  const criteria = deps.getCriteria();
  const { block, used, skipped } = assembleCriteriaPromptBlock(criteria, input.category);
  const key = computeArbitrationCacheKey({
    category: input.category,
    left,
    right,
    criteriaHash: hashCriteria(criteria),
    model: deps.config.model,
  });

  const hit = getArbitrationCached(deps.cache, key);
  if (hit) {
    return {
      decision: hit.decision,
      rationale: hit.rationale,
      ...(hit.mergedContent === undefined ? {} : { mergedContent: hit.mergedContent }),
      criteriaUsed: hit.criteriaUsed,
      criteriaSkipped: hit.criteriaSkipped,
      cached: true,
      model: hit.model,
      generatedAt: hit.generatedAt,
    };
  }

  const { system, user } = buildArbitrationPrompt({
    category: input.category,
    left,
    right,
    ...(input.leftLabel === undefined ? {} : { leftLabel: input.leftLabel }),
    ...(input.rightLabel === undefined ? {} : { rightLabel: input.rightLabel }),
    criteriaBlock: block,
    criteriaSkipped: skipped,
  });
  const output = await deps.llm.chat({ system, user });
  let suggestion: ArbitrationSuggestion;
  try {
    suggestion = parseArbitrationOutput(output);
  } catch (err) {
    throw new ArbitrationOutputError(err instanceof Error ? err.message : String(err));
  }

  const generatedAt = (deps.now ?? (() => new Date().toISOString()))();
  const entry: ArbitrationCacheEntry = {
    decision: suggestion.decision,
    rationale: suggestion.rationale,
    ...(suggestion.mergedContent === undefined
      ? {}
      : { mergedContent: suggestion.mergedContent }),
    model: deps.config.model,
    criteriaUsed: used,
    criteriaSkipped: skipped,
    generatedAt,
  };
  saveArbitrationEntry(deps.cache, key, entry);

  return {
    ...suggestion,
    criteriaUsed: used,
    criteriaSkipped: skipped,
    cached: false,
    model: deps.config.model,
    generatedAt,
  };
}
