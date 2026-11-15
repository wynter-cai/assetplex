/**
 * 诊断规则路由（add-diagnosis-rules）
 *
 * GET /api/diagnosis/rules  规则清单与计数（治理中心分类页、编写指南共用同一份）
 *
 * 错误约定（api-contract）：422 = 规则集加载失败（版本缺失 / 全部规则非法 / 文件缺失）。
 * 规则集是产品承诺，缺失时如实报错，不返回空清单冒充成功。
 */

import { Hono } from 'hono';
import { summarizeRuleSet } from '../../core/diagnosis-rules.js';
import type { DiagnosisRuleSet } from '../../core/types.js';
import { loadRouteRuleSet } from '../lib/rule-registry.js';

export interface DiagnosisRouteDeps {
  /** 规则集：缺省按构建产物 / 仓库定义位置加载；显式 null 表示本轮无规则可用 */
  ruleSet?: DiagnosisRuleSet | null;
}

export function createDiagnosisRoutes(deps: DiagnosisRouteDeps = {}): Hono {
  const routes = new Hono();
  const registry = loadRouteRuleSet(deps.ruleSet);

  routes.get('/rules', (c) => {
    if (registry.error !== null) return c.json({ error: registry.error.message }, 422);
    if (registry.ruleSet === null) {
      return c.json({ error: '规则集未加载：未找到 diagnosis-rules.yaml' }, 422);
    }
    return c.json(summarizeRuleSet(registry.ruleSet));
  });

  return routes;
}
