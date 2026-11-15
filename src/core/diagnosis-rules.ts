/**
 * 规则注册表加载与校验（add-diagnosis-rules T1）
 *
 * 规则集是产品承诺（proposal D6）：随版本内置，运行时按 `version` 加载。
 * 单条规则非法只跳过并告警（spec Scenario 1.4）；版本缺失 / 整份不可解析才致命（路由映射 422）。
 * 规则文件为固定结构的 YAML 子集，解析器只认此结构，不引入额外依赖。
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DIAGNOSIS_SEVERITIES,
  RULE_ASSET_CATEGORIES,
  RULE_CATEGORIES,
  RULE_MODES,
  type DiagnosisRule,
  type DiagnosisRuleSet,
  type RuleAssetCategory,
  type RuleCategory,
  type RuleMode,
} from './types.js';

export const RULES_FILE_NAME = 'diagnosis-rules.yaml';

/** 规则集在仓库内的唯一定义位置（tsup 构建时复制进 dist） */
export const DEFAULT_RULES_RELATIVE_PATH = '设计文档/changes/add-diagnosis-rules/diagnosis-rules.yaml';

/** 规则集加载致命错误（缺少 version / 无可用规则）→ 路由 422 */
export class RuleSetError extends Error {
  constructor(reason: string) {
    super(`规则集加载失败：${reason}`);
    this.name = 'RuleSetError';
  }
}

export interface RuleRegistryLoadResult {
  ruleSet: DiagnosisRuleSet;
  /** 启动告警日志：被跳过的坏规则与原因 */
  warnings: string[];
}

type RawValue = string | string[];
type RawRuleEntry = Record<string, RawValue>;

interface RawDocument {
  scalars: Record<string, string>;
  /** null = 文档里没有 rules 段 */
  rules: RawRuleEntry[] | null;
}

function stripQuotes(raw: string): string {
  const text = raw.trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseInlineList(raw: string): string[] | null {
  const text = raw.trim();
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  return text
    .slice(1, -1)
    .split(',')
    .map((item) => stripQuotes(item))
    .filter((item) => item !== '');
}

/** 只解析顶层标量、`rules` 列表与列表项内的一层键值；其余嵌套块整体忽略 */
function parseYamlDocument(text: string): RawDocument {
  const scalars: Record<string, string> = {};
  const rules: RawRuleEntry[] = [];
  let rulesFound = false;
  let mode: 'top' | 'rules' | 'block' = 'top';
  let current: RawRuleEntry | null = null;

  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      current = null;
      const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (match === null) {
        mode = 'block';
        continue;
      }
      const [, key, rest] = match;
      if (key === 'rules') {
        rulesFound = true;
        mode = 'rules';
        continue;
      }
      if (rest.trim() === '') {
        mode = 'block';
        continue;
      }
      mode = 'top';
      scalars[key] = stripQuotes(rest);
      continue;
    }

    if (mode !== 'rules') continue;
    const body = line.trimStart();
    if (body.startsWith('- ')) {
      current = {};
      rules.push(current);
      assignEntry(current, body.slice(2));
    } else if (current !== null) {
      assignEntry(current, body);
    }
  }

  return { scalars, rules: rulesFound ? rules : null };
}

function assignEntry(entry: RawRuleEntry, text: string): void {
  const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(text);
  if (match === null) return;
  const [, key, rest] = match;
  if (rest.trim() === '') return;
  const list = parseInlineList(rest);
  entry[key] = list ?? stripQuotes(rest);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function textField(entry: RawRuleEntry, key: string): string | null {
  const value = entry[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function parseAppliesTo(
  entry: RawRuleEntry,
  id: string,
  category: RuleCategory,
  warnings: string[],
): RuleAssetCategory[] | null {
  if (category !== 'cross') return [category];
  const list = entry['appliesTo'];
  if (!Array.isArray(list) || list.length === 0) {
    warnings.push(`跨资产规则 ${id} 缺少 appliesTo，已跳过`);
    return null;
  }
  const unknown = list.filter((item) => !(RULE_ASSET_CATEGORIES as readonly string[]).includes(item));
  if (unknown.length > 0) {
    warnings.push(`规则 ${id} appliesTo 含未知类别「${unknown.join('、')}」，已跳过`);
    return null;
  }
  return list as RuleAssetCategory[];
}

function validateRule(
  entry: RawRuleEntry,
  index: number,
  warnings: string[],
  seen: Set<string>,
): DiagnosisRule | null {
  const id = textField(entry, 'id');
  if (id === null) {
    warnings.push(`第 ${index + 1} 条规则缺少 id，已跳过`);
    return null;
  }
  if (seen.has(id)) {
    warnings.push(`规则 ${id} 编号重复，重复条目已跳过`);
    return null;
  }
  const missing = (['signal', 'recommendation', 'source'] as const).filter((key) => textField(entry, key) === null);
  if (missing.length > 0) {
    warnings.push(`规则 ${id} 缺少 ${missing.join('、')}，已跳过`);
    return null;
  }
  const category = entry['category'];
  if (!isOneOf(category, RULE_CATEGORIES)) {
    warnings.push(`规则 ${id} category「${String(category)}」不在闭集内，已跳过`);
    return null;
  }
  const severity = entry['severity'];
  if (!isOneOf(severity, DIAGNOSIS_SEVERITIES)) {
    warnings.push(`规则 ${id} severity「${String(severity)}」不在闭集内，已跳过`);
    return null;
  }
  const mode: unknown = entry['mode'];
  if (!isOneOf(mode, RULE_MODES)) {
    warnings.push(`规则 ${id} mode「${String(mode)}」不在闭集内，已跳过`);
    return null;
  }
  const appliesTo = parseAppliesTo(entry, id, category, warnings);
  if (appliesTo === null) return null;

  seen.add(id);
  return {
    id,
    category,
    appliesTo,
    severity,
    mode: mode as RuleMode,
    signal: textField(entry, 'signal') as string,
    recommendation: textField(entry, 'recommendation') as string,
    source: textField(entry, 'source') as string,
  };
}

/** 解析并校验规则集文本；单条坏规则跳过并告警，致命问题 throw RuleSetError */
export function parseRuleRegistry(text: string, sourceLabel = RULES_FILE_NAME): RuleRegistryLoadResult {
  const doc = parseYamlDocument(text);
  const version = doc.scalars['version'];
  if (version === undefined || version.trim() === '') {
    throw new RuleSetError(`${sourceLabel} 缺少 version（规则集版本是回归比对的前提）`);
  }
  if (doc.rules === null) {
    throw new RuleSetError(`${sourceLabel} 缺少 rules 段`);
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  const rules: DiagnosisRule[] = [];
  doc.rules.forEach((entry, index) => {
    const rule = validateRule(entry, index, warnings, seen);
    if (rule !== null) rules.push(rule);
  });
  if (rules.length === 0) {
    throw new RuleSetError(`${sourceLabel} 全部规则非法（${warnings.length} 条被跳过）`);
  }

  return {
    ruleSet: { version: version.trim(), updatedAt: doc.scalars['updatedAt'] ?? '', rules },
    warnings,
  };
}

/** 读取并解析规则集文件；文件缺失视为不可恢复（由调用方决定 422 或降级） */
export function loadRuleRegistryFromFile(filePath: string): RuleRegistryLoadResult {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch {
    throw new RuleSetError(`无法读取 ${filePath}`);
  }
  return parseRuleRegistry(text, filePath);
}

/**
 * 定位规则集文件：优先构建产物（dist 同级），开发态回落到仓库内唯一定义位置。
 * 均不存在返回 null（调用方降级为「本轮无规则可用」而不是整站失败）。
 */
export function resolveRuleSetFile(candidates?: string[]): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const paths =
    candidates ??
    [
      resolve(here, RULES_FILE_NAME),
      resolve(here, '..', RULES_FILE_NAME),
      resolve(process.cwd(), 'dist', RULES_FILE_NAME),
      resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH),
    ];
  return paths.find((path) => existsSync(path)) ?? null;
}
