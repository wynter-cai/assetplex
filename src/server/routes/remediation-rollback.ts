/**
 * 分发回滚路由（remove-tool-swap B21）
 *
 * POST /api/remediations/rollback：按本次分发 id 撤销写入（覆盖项恢复 + 新增项移除）。
 * 原 POST /api/swap/rollback 归位——用户可见的「切换工具」流程已删除，
 * 该端点仅服务资产医生修复结果页的「回滚本次分发」。
 */

import { Hono } from 'hono';
import type { AssetWriteEngine } from '../../core/asset-write.js';
import { invalidateDistributionIndex } from '../../core/distribution-index.js';
import { hubContext } from '../lib/hub-context.js';

/** 路由依赖（可注入，默认走 hubContext 单例） */
export interface RemediationRollbackDeps {
  getEngine: () => AssetWriteEngine;
}

/** 测试可注入依赖的路由工厂 */
export function remediationRollbackRoutesFactory(deps: RemediationRollbackDeps): Hono {
  const routes = new Hono();

  /** 回滚本次分发（覆盖项恢复 + 本次新增项移除） */
  routes.post('/rollback', async (c) => {
    const body = await c.req.json<{ swapId?: string }>().catch(() => ({}) as { swapId?: string });
    if (!body.swapId) {
      return c.json({ error: '缺少 swapId 参数' }, 400);
    }
    const result = await deps.getEngine().rollback(body.swapId);
    invalidateDistributionIndex();
    return c.json(result);
  });

  return routes;
}

/** 默认路由实例（hubContext 单例依赖） */
export const remediationRollbackRoutes = remediationRollbackRoutesFactory({
  getEngine: () => hubContext.getSwapEngine(),
});
