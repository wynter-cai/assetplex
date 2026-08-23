/**
 * Hub 配置相关路由
 */

import { Hono } from 'hono';
import { HubConfigSchema } from '../../core/config.js';
import { hubContext } from '../lib/hub-context.js';
import { checkHubHealth } from '../../core/hub-files.js';
import { getOverview } from '../../core/overview.js';

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
    return c.json(data);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
