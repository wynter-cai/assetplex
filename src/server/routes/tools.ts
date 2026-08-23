/**
 * 工具状态相关路由
 */

import { Hono } from 'hono';
import { hubContext } from '../lib/hub-context.js';
import type { DiscoveredItem } from '../../core/types.js';

export const toolsRoutes = new Hono();

/** 列出所有工具及其状态 */
toolsRoutes.get('/', async (c) => {
  const config = hubContext.getConfig();
  const adapters = hubContext.getAllAdapters();
  const statuses = await Promise.all(adapters.map((adapter) => adapter.detect()));
  const tools = adapters.map((adapter, i) => {
    const toolConfig = (config.tools as Record<string, { enabled?: boolean }>)[adapter.name];
    return {
      ...statuses[i],
      enabled: toolConfig?.enabled ?? false,
    };
  });
  return c.json({ tools });
});

/** 单个工具详情 */
toolsRoutes.get('/:name', async (c) => {
  const name = c.req.param('name');
  const adapter = hubContext.getAdapter(name);
  if (!adapter) {
    return c.json({ error: `未找到工具适配器：${name}` }, 404);
  }
  const status = await adapter.detect();
  const config = hubContext.getConfig();
  const toolConfig = (config.tools as Record<string, { enabled?: boolean }>)[name];
  return c.json({
    ...status,
    enabled: toolConfig?.enabled ?? false,
  });
});

/** 切换工具启用状态 */
toolsRoutes.post('/:name/toggle', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.json().catch(() => ({}));
  const enabled = body.enabled as boolean | undefined;

  const config = hubContext.getConfig();
  const tools = config.tools as Record<string, Record<string, unknown>>;
  if (!tools[name]) {
    return c.json({ error: `未找到工具配置：${name}` }, 404);
  }

  // 若 body 提供 enabled，则用之；否则取反当前值
  const nextEnabled = typeof enabled === 'boolean' ? enabled : !tools[name].enabled;
  tools[name].enabled = nextEnabled;

  hubContext.saveConfig(config);
  return c.json({ success: true, enabled: nextEnabled });
});

/** 重新检测工具 */
toolsRoutes.post('/:name/detect', async (c) => {
  const name = c.req.param('name');
  const adapter = hubContext.getAdapter(name);
  if (!adapter) {
    return c.json({ error: `未找到工具适配器：${name}` }, 404);
  }
  const status = await adapter.detect();
  return c.json(status);
});

/** 工具连接详情（含发现的资产文件） */
toolsRoutes.get('/:name/detail', async (c) => {
  const name = c.req.param('name');
  const adapter = hubContext.getAdapter(name);
  if (!adapter) {
    return c.json({ error: `未找到工具适配器：${name}` }, 404);
  }
  const status = await adapter.detect();
  const config = hubContext.getConfig();
  const toolConfig = (config.tools as Record<string, { enabled?: boolean }>)[name];

  const tool: Record<string, unknown> = {
    ...status,
    enabled: toolConfig?.enabled ?? false,
  };

  // 如果已安装，扫描发现的资产文件（用于显示"未入库"列表）
  let discovered:
    | {
        identities: Array<{ path: string; size: number }>;
        rules: Array<{ path: string; size: number }>;
        skills: Array<{ path: string; size: number }>;
        mcps: Array<{ path: string; size: number }>;
      }
    | undefined;
  if (status.installed) {
    try {
      const items: DiscoveredItem[] = await adapter.scan();
      discovered = {
        identities: items.filter((i) => i.category === 'identity').map((f) => ({ path: f.absolutePath, size: f.size })),
        rules: items.filter((i) => i.category === 'rule').map((f) => ({ path: f.absolutePath, size: f.size })),
        skills: items.filter((i) => i.category === 'skill').map((f) => ({ path: f.absolutePath, size: f.size })),
        mcps: items.filter((i) => i.category === 'mcp').map((f) => ({ path: f.absolutePath, size: f.size })),
      };
    } catch {
      discovered = undefined;
    }
  }

  return c.json({ tool, discovered });
});
