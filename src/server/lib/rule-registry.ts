/**
 * 规则集加载（add-diagnosis-rules）：路由层共享同一份加载与降级约定。
 *
 * - 显式传入（含 null）优先，便于测试与嵌入方注入；
 * - 缺省按构建产物 / 仓库定义位置加载；
 * - 坏规则只打启动告警，致命错误留给请求层映射 422（spec Scenario 1.4）。
 */

import {
  RuleSetError,
  loadRuleRegistryFromFile,
  resolveRuleSetFile,
} from '../../core/diagnosis-rules.js';
import type { DiagnosisRuleSet } from '../../core/types.js';

export interface RuleSetRegistry {
  ruleSet: DiagnosisRuleSet | null;
  /** 规则集致命错误（版本缺失 / 全部规则非法）→ 请求 422 */
  error: RuleSetError | null;
}

export function loadRouteRuleSet(explicit?: DiagnosisRuleSet | null): RuleSetRegistry {
  if (explicit !== undefined) return { ruleSet: explicit, error: null };
  try {
    const file = resolveRuleSetFile();
    if (file === null) return { ruleSet: null, error: null };
    const loaded = loadRuleRegistryFromFile(file);
    for (const warning of loaded.warnings) console.warn(`[diagnosis] ${warning}`);
    return { ruleSet: loaded.ruleSet, error: null };
  } catch (err) {
    if (err instanceof RuleSetError) return { ruleSet: null, error: err };
    return { ruleSet: null, error: null };
  }
}
