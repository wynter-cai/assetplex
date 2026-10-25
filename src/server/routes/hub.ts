/**
 * Hub 配置相关路由
 */

import { Hono } from 'hono';
import { HubConfigSchema } from '../../core/config.js';
import { hubContext } from '../lib/hub-context.js';
import { checkHubHealth } from '../../core/hub-files.js';
import { getOverview } from '../../core/overview.js';
import { listAssets } from '../../core/assets.js';
import { buildCounts, alignAssetStats, getDistributions } from '../lib/distribution-context.js';

export const hubRoutes = new Hono();

/** 读取 hub.toml 配置 */
hubRoutes.get('/config', (c) => {
  return c.json(hubContext.getConfig());
});

/** 保存 hub.toml 配置 */
hubRoutes.put('/config', async (c) => {
  const body = await c.req.json();
  const config = HubConfigSchema.parse(body);
  hubContext.saveConfig(config);
  return c.json({ success: true });
});

/** Hub 健康度 */
hubRoutes.get('/health', (c) => {
  return c.json(checkHubHealth());
});

/** 首页聚合数据（资产统计 + 连接状态 + 最近活动） */
hubRoutes.get('/overview', async (c) => {
  try {
    const data = await getOverview();
    // 口径真值：我的库计数与已同步计数都来自分发索引，禁止前端就地统计（proposal D4）
    const [distribution, assets] = await Promise.all([getDistributions(), listAssets()]);
    const summary = buildCounts(assets.items, distribution);
    return c.json({
      ...data,
      // assetStats 收敛到同一口径，避免响应内两个数字打架（proposal D4）
      assetStats: alignAssetStats(data.assetStats, summary.counts),
      generatedAt: distribution.generatedAt,
      counts: summary.counts,
      toolSynced: summary.toolSynced,
      partial: distribution.partial,
      failedTools: distribution.failedTools,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
