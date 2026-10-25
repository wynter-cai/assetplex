/**
 * 资产目录与分发状态 API
 *
 * GET /api/asset-categories  资产类别声明源（唯一真相，proposal D5）
 * GET /api/distributions     分发状态索引（只读，30s 缓存，?refresh=1 强刷）
 *
 * 阶段 0 只读；写通道统一走 sync / swap / doctor。
 */

import { Hono } from 'hono';
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_DECLARED_AT,
} from '../../core/asset-categories.js';
import { getDistributionIndex, type DistributionIndexDeps } from '../../core/distribution-index.js';
import { loadDistributionDeps } from '../lib/distribution-context.js';

export interface CatalogRoutesOptions {
  /** 依赖加载器（测试注入；生产用真实适配器与配置） */
  loadDeps?: () => Promise<DistributionIndexDeps>;
}

export function createCatalogRoutes(options: CatalogRoutesOptions = {}): Hono {
  const routes = new Hono();

  /** 资产类别声明源 */
  routes.get('/asset-categories', (c) =>
    c.json({ categories: ASSET_CATEGORIES, declaredAt: ASSET_CATEGORY_DECLARED_AT }),
  );

  /** 分发状态索引 */
  routes.get('/distributions', async (c) => {
    const refresh = c.req.query('refresh');
    if (refresh !== undefined && refresh !== '0' && refresh !== '1') {
      return c.json({ error: 'refresh 只接受 0 或 1' }, 400);
    }
    const loader = options.loadDeps ?? loadDistributionDeps;
    try {
      const result = await getDistributionIndex({ refresh: refresh === '1' }, loader);
      return c.json(result);
    } catch (err) {
      // 索引整体失败：不得返回半真半假的状态
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return routes;
}
