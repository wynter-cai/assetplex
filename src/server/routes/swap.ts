/**
 * 工具热切换路由（enable-tool-hot-swap T7）
 *
 * /api/swap/*：候选工具矩阵 → 预览 → 执行（覆盖前备份）→ 回滚 → 历史。
 * 契约见 设计文档/changes/enable-tool-hot-swap/api-contract.ts。
 * 通过 swapRoutesFactory 注入依赖，测试可用临时 Hub + Fake 适配器驱动。
 */

import { Hono } from 'hono';
import type { HubConfig } from '../../core/config.js';
import type { ToolAdapter } from '../../core/adapters/base.js';
import { SwapEngine } from '../../core/swap.js';
import type {
  CategorySupport,
  SwapCategory,
  SwapExecuteRequest,
  SwapToolCandidate,
} from '../../core/swap.js';
import { SWAP_CATEGORIES } from '../../core/swap.js';
import { getHubRoot } from '../../utils/paths.js';
import { hubContext } from '../lib/hub-context.js';

/** 路由依赖（可注入，默认走 hubContext 单例） */
export interface SwapRouteDeps {
  getEngine: () => SwapEngine;
  listAdapters: () => ToolAdapter[];
  getHubConfig: () => HubConfig;
}

/** 由适配器 resolveHubItems 推导六类支持矩阵 */
function buildSupportMatrix(adapter: ToolAdapter, config: HubConfig): Record<SwapCategory, CategorySupport> {
  const types = new Set(adapter.resolveHubItems(config, getHubRoot()).map((r) => r.item.type as string));
  const matrix = {} as Record<SwapCategory, CategorySupport>;
  for (const category of SWAP_CATEGORIES) {
    matrix[category] = types.has(category)
      ? { supported: true }
      : { supported: false, reason: `此工具不支持${category}类别，已跳过` };
  }
  return matrix;
}

/** 业务错误 → HTTP 状态：未注册 400 / staleness 与未安装 409 / 其他 500 */
function statusForError(err: Error): 400 | 409 | 500 {
  const msg = err.message;
  if (msg.includes('未注册适配器')) return 400;
  if (msg.includes('未安装') || msg.includes('重新预览') || msg.includes('已过期') || msg.includes('已变化')) {
    return 409;
  }
  return 500;
}

/** 测试可注入依赖的路由工厂 */
export function swapRoutesFactory(deps: SwapRouteDeps): Hono {
  const routes = new Hono();

  /** 候选工具 + 六类支持矩阵 */
  routes.get('/tools', async (c) => {
    const config = deps.getHubConfig();
    const tools: SwapToolCandidate[] = [];
    for (const adapter of deps.listAdapters()) {
      let installed = false;
      try {
        installed = (await adapter.detect()).installed;
      } catch {
        installed = false;
      }
      tools.push({
        name: adapter.name,
        displayName: adapter.displayName,
        installed,
        supportMatrix: buildSupportMatrix(adapter, config),
      });
    }
    return c.json({ tools });
  });

  /** 冲突预览 */
  routes.post('/preview', async (c) => {
    const body = await c.req.json<{ tool?: string }>().catch(() => ({}) as { tool?: string });
    if (!body.tool) {
      return c.json({ error: '缺少 tool 参数' }, 400);
    }
    try {
      const preview = await deps.getEngine().preview(body.tool);
      return c.json(preview);
    } catch (err) {
      return c.json({ error: (err as Error).message }, statusForError(err as Error));
    }
  });

  /** 执行切换（需回传 previewGeneratedAt 做 staleness 校验） */
  routes.post('/execute', async (c) => {
    const body = await c.req.json<Partial<SwapExecuteRequest>>().catch(() => ({}) as Partial<SwapExecuteRequest>);
    if (!body.tool || !body.previewGeneratedAt) {
      return c.json({ error: '缺少 tool 或 previewGeneratedAt 参数，请先预览' }, 400);
    }
    try {
      const result = await deps.getEngine().execute({
        tool: body.tool,
        previewGeneratedAt: body.previewGeneratedAt,
        overwriteDecisions: body.overwriteDecisions ?? [],
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: (err as Error).message }, statusForError(err as Error));
    }
  });

  /** 回滚本次切换（覆盖项恢复 + 本次新增项移除） */
  routes.post('/rollback', async (c) => {
    const body = await c.req.json<{ swapId?: string }>().catch(() => ({}) as { swapId?: string });
    if (!body.swapId) {
      return c.json({ error: '缺少 swapId 参数' }, 400);
    }
    const result = await deps.getEngine().rollback(body.swapId);
    return c.json(result);
  });

  /** 切换历史（最新在前，仅本机） */
  routes.get('/history', (c) => {
    return c.json({ history: deps.getEngine().history() });
  });

  return routes;
}

/** 默认路由实例（hubContext 单例依赖） */
export const swapRoutes = swapRoutesFactory({
  getEngine: () => hubContext.getSwapEngine(),
  listAdapters: () => hubContext.getAllAdapters(),
  getHubConfig: () => hubContext.getConfig(),
});
