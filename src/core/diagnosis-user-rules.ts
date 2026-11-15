/**
 * 用户诊断规则加载与合并（refactor-governance-center T7，拍板 D16）
 *
 * 用户规则落 `<Hub>/diagnosis-rules/*.yaml|yml`：同编号覆盖内置、其余追加；
 * 坏规则逐条跳过并告警，单个文件整体不可解析只影响该文件——内置规则永远可用。
 * 纯逻辑：文件内容由调用方读入，本模块不碰 fs。
 *
 * spec: 设计文档/changes/refactor-governance-center/specs/governance-center.spec.md Requirement 5
 * 契约: api-contract.ts (RuleWithOrigin / RuleLoadWarning / DiagnosisRuleListView)
 */

import { parseRuleRegistry, RuleSetError } from './diagnosis-rules.js';
import type { DiagnosisRule, DiagnosisRuleSet } from './types.js';

export interface RuleWithOrigin extends DiagnosisRule {
  origin: 'builtin' | 'user';
  overridesBuiltin: boolean;
  originLabel: string;
}

export interface DiagnosisRuleListView extends DiagnosisRuleSet {
  rules: RuleWithOrigin[];
  counts: Record<string, number>;
  modeCounts: Record<string, number>;
  sources: { builtinCount: number; userCount: number; overriddenRuleIds: string[] };
  loadPolicy: 'category-on-demand';
  userRules: { directory: string; loaded: number; warnings: RuleLoadWarning[] };
}

/** 规则清单视图：在原规则集上补来源、覆盖标记与用户规则加载情况 */
export function buildRuleListView(merge: UserRulesMergeResult, directory: string): DiagnosisRuleListView | null {
  if (merge.ruleSet === null) return null;
  const counts: Record<string, number> = {};
  const modeCounts: Record<string, number> = {};
  const rules: RuleWithOrigin[] = merge.ruleSet.rules.map((rule) => {
    counts[rule.category] = (counts[rule.category] ?? 0) + 1;
    modeCounts[rule.mode] = (modeCounts[rule.mode] ?? 0) + 1;
    const origin = merge.origins.get(rule.id);
    return {
      ...rule,
      origin: origin?.origin ?? 'builtin',
      overridesBuiltin: origin?.overridesBuiltin ?? false,
      originLabel: origin?.originLabel ?? 'builtin:diagnosis-rules.yaml',
    };
  });
  return {
    ...merge.ruleSet,
    rules,
    counts,
    modeCounts,
    sources: {
      builtinCount: merge.builtinCount,
      userCount: merge.userCount,
      overriddenRuleIds: merge.overriddenRuleIds,
    },
    loadPolicy: 'category-on-demand',
    userRules: { directory, loaded: merge.loadedFiles, warnings: merge.warnings },
  };
}

export interface RuleValidateResult {
  ok: boolean;
  errors: Array<{ line: number | null; ruleId: string | null; message: string }>;
  warnings: RuleLoadWarning[];
  effectiveRules: number;
}

/**
 * 保存前校验：零写库。
 * 单条坏规则不算致命（跳过并告警）；整文件无法解析 / 无有效规则才算不通过。
 */
export function validateUserRuleFile(
  content: string,
  targetPath: string,
  builtin: DiagnosisRuleSet | null,
): RuleValidateResult {
  try {
    const parsed = parseRuleRegistry(content, targetPath);
    const warnings = toRuleLoadWarnings(parsed.warnings, targetPath);
    const builtinIds = new Set((builtin?.rules ?? []).map((rule) => rule.id));
    for (const rule of parsed.ruleSet.rules) {
      if (builtinIds.has(rule.id) && !warnings.some((item) => item.ruleId === rule.id)) {
        // 覆盖内置不是错误，但保存前必须让用户看见（契约把覆盖告警并入 duplicate-id）
        warnings.push({ originLabel: targetPath, ruleId: rule.id, reason: 'duplicate-id' });
      }
    }
    const effectiveRules = parsed.ruleSet.rules.length;
    if (effectiveRules === 0) {
      return {
        ok: false,
        errors: [{ line: null, ruleId: null, message: '文件里没有一条可用规则' }],
        warnings,
        effectiveRules,
      };
    }
    return { ok: true, errors: [], warnings, effectiveRules };
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          line: null,
          ruleId: null,
          message: err instanceof RuleSetError ? err.message : err instanceof Error ? err.message : '规则文件解析失败',
        },
      ],
      warnings: [],
      effectiveRules: 0,
    };
  }
}

export type RuleLoadWarningReason =
  | 'missing-field'
  | 'invalid-category'
  | 'invalid-severity'
  | 'invalid-mode'
  | 'duplicate-id'
  | 'invalid-applies-to'
  | 'unparsable';

export interface RuleLoadWarning {
  originLabel: string;
  ruleId: string | null;
  reason: RuleLoadWarningReason;
}

export interface UserRuleFile {
  /** 库内相对路径（如 diagnosis-rules/demo.yaml） */
  path: string;
  text: string;
}

export interface RuleOriginInfo {
  origin: 'builtin' | 'user';
  overridesBuiltin: boolean;
  originLabel: string;
}

export interface UserRulesMergeResult {
  /** 合并后的生效规则集；内置与用户都为空时为 null */
  ruleSet: DiagnosisRuleSet | null;
  origins: Map<string, RuleOriginInfo>;
  warnings: RuleLoadWarning[];
  builtinCount: number;
  userCount: number;
  overriddenRuleIds: string[];
  loadedFiles: number;
}

const RULE_ID_PATTERNS = [/^规则 (\S+) /, /^跨资产规则 (\S+) /];

/** 从解析告警文案提取规则编号（拿不到就 null） */
function extractRuleId(text: string): string | null {
  for (const pattern of RULE_ID_PATTERNS) {
    const matched = pattern.exec(text);
    if (matched?.[1] !== undefined) return matched[1];
  }
  return null;
}

/** 告警文案 → 结构化原因；未识别的统一归 unparsable，绝不丢告警 */
export function toRuleLoadWarnings(texts: string[], originLabel: string): RuleLoadWarning[] {
  return texts.map((text) => {
    const ruleId = extractRuleId(text);
    let reason: RuleLoadWarningReason = 'unparsable';
    if (text.includes('编号重复')) reason = 'duplicate-id';
    else if (text.includes('缺少 id') || text.includes('缺少 ')) reason = 'missing-field';
    else if (text.includes('category「')) reason = 'invalid-category';
    else if (text.includes('severity「')) reason = 'invalid-severity';
    else if (text.includes('mode「')) reason = 'invalid-mode';
    else if (text.includes('appliesTo')) reason = 'invalid-applies-to';
    return { originLabel, ruleId, reason };
  });
}

/**
 * 合并内置与用户规则。
 * 用户规则按文件路径排序后逐条覆盖同编号内置规则，未命中的追加；
 * 单个文件解析失败只跳过该文件并记为 unparsable 告警。
 */
export function mergeUserRules(
  builtin: DiagnosisRuleSet | null,
  files: UserRuleFile[],
  builtinLabel = 'builtin:diagnosis-rules.yaml',
): UserRulesMergeResult {
  const merged = new Map<string, DiagnosisRule>();
  const origins = new Map<string, RuleOriginInfo>();
  const warnings: RuleLoadWarning[] = [];
  const overriddenRuleIds: string[] = [];
  const builtinRules = builtin?.rules ?? [];
  for (const rule of builtinRules) {
    merged.set(rule.id, rule);
    origins.set(rule.id, { origin: 'builtin', overridesBuiltin: false, originLabel: builtinLabel });
  }

  let loadedFiles = 0;
  let userCount = 0;
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of ordered) {
    let parsed;
    try {
      parsed = parseRuleRegistry(file.text, file.path);
    } catch (err) {
      warnings.push({
        originLabel: file.path,
        ruleId: null,
        reason: err instanceof RuleSetError ? 'unparsable' : 'unparsable',
      });
      continue;
    }
    loadedFiles += 1;
    warnings.push(...toRuleLoadWarnings(parsed.warnings, file.path));
    for (const rule of parsed.ruleSet.rules) {
      const overridesBuiltin = origins.get(rule.id)?.origin === 'builtin';
      if (overridesBuiltin && !overriddenRuleIds.includes(rule.id)) overriddenRuleIds.push(rule.id);
      merged.set(rule.id, rule);
      origins.set(rule.id, { origin: 'user', overridesBuiltin, originLabel: file.path });
      userCount += 1;
    }
  }

  const rules = [...merged.values()];
  if (rules.length === 0) {
    return {
      ruleSet: null,
      origins,
      warnings,
      builtinCount: builtinRules.length,
      userCount: 0,
      overriddenRuleIds,
      loadedFiles,
    };
  }
  const base = builtin ?? { version: 'user', updatedAt: '' };
  return {
    ruleSet: { ...base, rules },
    origins,
    warnings,
    builtinCount: builtinRules.length,
    userCount: rules.filter((rule) => origins.get(rule.id)?.origin === 'user').length,
    overriddenRuleIds,
    loadedFiles,
  };
}
