/**
 * 工具状态相关路由
 *
 * 依赖通过 toolsRoutesFactory 注入，默认走 hubContext 单例；
 * 「已同步 / 我的库 / 可收藏」三口径由服务端派生（见 lib/tool-asset-counts.ts），
 * 前端不得就地统计（spec asset-center-consistency Scenario 2/3）。
 */

import { Hono } from 'hono';
import { hubContext } from '../lib/hub-context.js';
import { listAssets as listHubAssets } from '../../core/assets.js';
import type { ListAssetsResult } from '../../core/assets.js';
import { getDistributions } from '../lib/distribution-context.js';
import type { DistributionIndexResponse } from '../../core/distribution-index.js';
import { buildToolAssetCounts } from '../lib/tool-asset-counts.js';
import type { ToolAssetCounts } from '../lib/tool-asset-counts.js';
import type { HubConfig } from '../../core/config.js';
import type { ToolAdapter } from '../../core/adapters/base.js';
import type { DiscoveredCategory, DiscoveredItem } from '../../core/types.js';

/** 路由依赖（可注入，默认走 hubContext 单例） */
export interface ToolsRouteDeps {
  getAdapter: (name: string) => ToolAdapter | undefined;
  listAdapters: () => ToolAdapter[];
  getConfig: () => HubConfig;
  saveConfig: (config: HubConfig) => void;
  listAssets: () => Promise<ListAssetsResult>;
  getDistributions: () => Promise<DistributionIndexResponse>;
}

const DEFAULT_DEPS: ToolsRouteDeps = {
  getAdapter: (name) => hubContext.getAdapter(name),
  listAdapters: () => hubContext.getAllAdapters(),
  getConfig: () => hubContext.getConfig(),
  saveConfig: (config) => hubContext.saveConfig(config),
  listAssets: () => listHubAssets(),
  getDistributions: () => getDistributions(),
};

/** hub.toml 里该工具的启用状态 */
function isEnabled(deps: ToolsRouteDeps, name: string): boolean {
  const tools = deps.getConfig().tools as Record<string, { enabled?: boolean } | undefined>;
  return tools[name]?.enabled ?? false;
}

/** 发现列表只保留可收藏条目（conflict=none），与 assetCounts.pendingImport 同一口径 */
function groupCollectable(items: ReadonlyArray<DiscoveredItem>): Record<
  'identities' | 'rules' | 'skills' | 'mcps',
  Array<{ path: string; size: number }>
> {
  const pick = (category: DiscoveredCategory): Array<{ path: string; size: number }> =>
    items
      .filter((item) => item.conflict === 'none' && item.category === category)
      .map((item) => ({ path: item.absolutePath, size: item.size }));
  return {
    identities: pick('identity'),
    rules: pick('rule'),
    skills: pick('skill'),
    mcps: pick('mcp'),
  };
}

/**
 * 三口径计数：索引或资产清单读不到时返回 null
 *
 * 宁可界面显示「同步状态暂不可用」，也不编一组数字出来。
 */
async function loadAssetCounts(
  deps: ToolsRouteDeps,
  toolId: string,
  installed: boolean,
  discovered: ReadonlyArray<DiscoveredItem>,
): Promise<ToolAssetCounts | null> {
  try {
    const [distribution, assets] = await Promise.all([deps.getDistributions(), deps.listAssets()]);
    return buildToolAssetCounts({
      toolId,
      installed,
      assets: assets.items,
      distribution,
      discovered,
    });
  } catch {
    return null;
  }
}

/** 测试可注入依赖的路由工厂 */
export function toolsRoutesFactory(deps: ToolsRouteDeps = DEFAULT_DEPS): Hono {
  const routes = new Hono();

  /** 列出所有工具及其状态 */
  routes.get('/', async (c) => {
    const adapters = deps.listAdapters();
    const statuses = await Promise.all(adapters.map((adapter) => adapter.detect()));
    const tools = adapters.map((adapter, i) => ({
      ...statuses[i],
      enabled: isEnabled(deps, adapter.name),
    }));
    return c.json({ tools });
  });

  /** 单个工具详情 */
  routes.get('/:name', async (c) => {
    const name = c.req.param('name');
    const adapter = deps.getAdapter(name);
    if (!adapter) {
      return c.json({ error: `未找到工具适配器：${name}` }, 404);
    }
    const status = await adapter.detect();
    return c.json({ ...status, enabled: isEnabled(deps, name) });
  });

  /** 切换工具启用状态 */
  routes.post('/:name/toggle', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({}));
    const enabled = body.enabled as boolean | undefined;

    const config = deps.getConfig();
    const tools = config.tools as Record<string, Record<string, unknown>>;
    if (!tools[name]) {
      return c.json({ error: `未找到工具配置：${name}` }, 404);
    }

    // 若 body 提供 enabled，则用之；否则取反当前值
    const nextEnabled = typeof enabled === 'boolean' ? enabled : !tools[name].enabled;
    tools[name].enabled = nextEnabled;

    deps.saveConfig(config);
    return c.json({ success: true, enabled: nextEnabled });
  });

  /** 重新检测工具 */
  routes.post('/:name/detect', async (c) => {
    const name = c.req.param('name');
    const adapter = deps.getAdapter(name);
    if (!adapter) {
      return c.json({ error: `未找到工具适配器：${name}` }, 404);
    }
    return c.json(await adapter.detect());
  });

  /** 工具连接详情（三口径计数 + 可收藏文件列表） */
  routes.get('/:name/detail', async (c) => {
    const name = c.req.param('name');
    const adapter = deps.getAdapter(name);
    if (!adapter) {
      return c.json({ error: `未找到工具适配器：${name}` }, 404);
    }
    const status = await adapter.detect();
    const tool = { ...status, enabled: isEnabled(deps, name) };

    let scanned: DiscoveredItem[] = [];
    let discovered: ReturnType<typeof groupCollectable> | undefined;
    if (status.installed) {
      try {
        scanned = await adapter.scan();
      } catch {
        scanned = [];
      }
      discovered = groupCollectable(scanned);
    }

    const assetCounts = await loadAssetCounts(deps, name, status.installed, scanned);
    return c.json({ tool, discovered, assetCounts });
  });

  return routes;
}

export const toolsRoutes = toolsRoutesFactory();
