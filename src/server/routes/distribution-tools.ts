/**
 * 工具类别支持矩阵路由（remove-tool-swap B21）
 *
 * GET /api/distributions/tools：候选工具 + 六类支持矩阵。
 * 原切换工具矩阵端点归位——用户可见的「切换工具」流程已删除，
 * 该端点仅服务资产医生分发表单与资产分发对话框。
 */

import { Hono } from 'hono';
import type { HubConfig } from '../../core/config.js';
import type { ToolAdapter } from '../../core/adapters/base.js';
import type { CategorySupport, AssetWriteCategory, AssetWriteToolCandidate } from '../../core/asset-write.js';
import { ASSET_WRITE_CATEGORIES } from '../../core/asset-write.js';
import { getHubRoot } from '../../utils/paths.js';
import { hubContext } from '../lib/hub-context.js';

/** 路由依赖（可注入，默认走 hubContext 单例） */
export interface DistributionToolDeps {
  listAdapters: () => ToolAdapter[];
  getHubConfig: () => HubConfig;
}

/** 由适配器 resolveHubItems 推导六类支持矩阵 */
function buildSupportMatrix(adapter: ToolAdapter, config: HubConfig): Record<AssetWriteCategory, CategorySupport> {
  const types = new Set(adapter.resolveHubItems(config, getHubRoot()).map((r) => r.item.type as string));
  const matrix = {} as Record<AssetWriteCategory, CategorySupport>;
  for (const category of ASSET_WRITE_CATEGORIES) {
    matrix[category] = types.has(category)
      ? { supported: true }
      : { supported: false, reason: `此工具不支持${category}类别，已跳过` };
  }
  return matrix;
}

/** 工具是否为项目级（syncStrategy = 'per-project'，D3） */
function isProjectLevel(config: HubConfig, toolName: string): boolean {
  const tools = config.tools as Record<string, Record<string, unknown>>;
  return tools[toolName]?.syncStrategy === 'per-project';
}

/** 项目级工具已配置的项目目录数（未配置为 0，K3：界面据此给「尚未选择项目」出口） */
function projectTargetCount(config: HubConfig, toolName: string): number {
  const tools = config.tools as Record<string, Record<string, unknown>>;
  const targets = tools[toolName]?.projectTargets;
  return Array.isArray(targets) ? targets.length : 0;
}

/** 测试可注入依赖的路由工厂 */
export function distributionToolsRoutesFactory(deps: DistributionToolDeps): Hono {
  const routes = new Hono();

  /** 候选工具 + 六类支持矩阵 */
  routes.get('/tools', async (c) => {
    const config = deps.getHubConfig();
    const tools: AssetWriteToolCandidate[] = [];
    for (const adapter of deps.listAdapters()) {
      let installed = false;
      try {
        installed = (await adapter.detect()).installed;
      } catch {
        installed = false;
      }
      const projectLevel = isProjectLevel(config, adapter.name);
      tools.push({
        name: adapter.name,
        displayName: adapter.displayName,
        installed,
        supportMatrix: buildSupportMatrix(adapter, config),
        projectLevel,
        ...(projectLevel ? { projectCount: projectTargetCount(config, adapter.name) } : {}),
      });
    }
    return c.json({ tools });
  });

  return routes;
}

/** 默认路由实例（hubContext 单例依赖） */
export const distributionToolsRoutes = distributionToolsRoutesFactory({
  listAdapters: () => hubContext.getAllAdapters(),
  getHubConfig: () => hubContext.getConfig(),
});
