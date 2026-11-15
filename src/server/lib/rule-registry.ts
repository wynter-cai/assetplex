/**
 * 规则集加载（add-diagnosis-rules；refactor-governance-center T7 起并入用户规则）
 *
 * - 显式传入（含 null）优先，便于测试与嵌入方注入；
 * - 缺省按构建产物 / 仓库定义位置加载内置规则，再与 `<Hub>/diagnosis-rules/` 用户规则合并
 *   （同编号覆盖内置，坏规则跳过并告警，拍板 D16）；
 * - 坏规则只打启动告警，致命错误留给请求层映射 422（spec Scenario 1.4）。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RuleSetError,
  loadRuleRegistryFromFile,
  resolveRuleSetFile,
} from '../../core/diagnosis-rules.js';
import {
  mergeUserRules,
  type RuleLoadWarning,
  type UserRuleFile,
  type UserRulesMergeResult,
} from '../../core/diagnosis-user-rules.js';
import type { DiagnosisRuleSet } from '../../core/types.js';
import { getHubRoot } from '../../utils/paths.js';

/** 用户规则目录（Hub 内相对路径） */
export const USER_RULES_DIR = 'diagnosis-rules';

export interface RuleSetRegistry {
  ruleSet: DiagnosisRuleSet | null;
  /** 规则集致命错误（版本缺失 / 全部规则非法）→ 请求 422 */
  error: RuleSetError | null;
  /** 用户规则合并结果：规则清单页据此展示来源与告警；显式注入时为 null */
  userRules: UserRulesMergeResult | null;
}

/** 读用户规则目录（不存在 = 没有用户规则；坏文件由合并层跳过并告警） */
export function readUserRuleFiles(dir = USER_RULES_DIR): UserRuleFile[] {
  const absolute = join(getHubRoot(), dir);
  let names: string[];
  try {
    names = readdirSync(absolute).filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'));
  } catch {
    return [];
  }
  const files: UserRuleFile[] = [];
  for (const name of names.sort()) {
    try {
      files.push({ path: `${dir}/${name}`, text: readFileSync(join(absolute, name), 'utf-8') });
    } catch {
      // 读不到的文件按不可解析处理（告警由合并层给出）
      files.push({ path: `${dir}/${name}`, text: '' });
    }
  }
  return files;
}

/** 合并内置与用户规则（每次调用都读盘：用户保存后即时生效，规则文件很小） */
export function loadMergedRuleSet(explicit?: DiagnosisRuleSet | null): RuleSetRegistry {
  if (explicit !== undefined) return { ruleSet: explicit, error: null, userRules: null };
  try {
    const file = resolveRuleSetFile();
    const builtin = file === null ? null : loadRuleRegistryFromFile(file);
    if (builtin !== null) {
      for (const warning of builtin.warnings) console.warn(`[diagnosis] ${warning}`);
    }
    const dirExists = existsSync(join(getHubRoot(), USER_RULES_DIR));
    const merged = mergeUserRules(builtin === null ? null : builtin.ruleSet, dirExists ? readUserRuleFiles() : []);
    for (const warning of merged.warnings) {
      console.warn(`[diagnosis] user rule ${warning.originLabel} ${warning.ruleId ?? ''} ${warning.reason}`);
    }
    return { ruleSet: merged.ruleSet, error: null, userRules: merged };
  } catch (err) {
    if (err instanceof RuleSetError) return { ruleSet: null, error: err, userRules: null };
    return { ruleSet: null, error: null, userRules: null };
  }
}

/** 内置规则集（不含用户规则）：测试与需要稳定基线的场景用 */
export function loadRouteRuleSet(explicit?: DiagnosisRuleSet | null): RuleSetRegistry {
  if (explicit !== undefined) return { ruleSet: explicit, error: null, userRules: null };
  try {
    const file = resolveRuleSetFile();
    if (file === null) return { ruleSet: null, error: null, userRules: null };
    const loaded = loadRuleRegistryFromFile(file);
    for (const warning of loaded.warnings) console.warn(`[diagnosis] ${warning}`);
    return { ruleSet: loaded.ruleSet, error: null, userRules: null };
  } catch (err) {
    if (err instanceof RuleSetError) return { ruleSet: null, error: err, userRules: null };
    return { ruleSet: null, error: null, userRules: null };
  }
}

export type { RuleLoadWarning };
