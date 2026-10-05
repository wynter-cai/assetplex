/**
 * 智能体只读盘点 API 路由
 *
 * GET /api/agents         列出（可筛选）
 * GET /api/agents/:id     单个详情 + 原始内容
 *
 * spec: agents-inventory.spec.md
 */

import { Hono } from 'hono';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  listAgents,
  getAgentRawContent,
  type AgentFs,
  type AgentSources,
  type ListAgentsParams,
} from '../../core/agent-inventory.js';
import { nodeAgentFs } from '../lib/node-agent-fs.js';

export interface AgentsRouteDeps {
  fs: AgentFs;
  sources: AgentSources;
}

/** 解析本机各来源根目录 */
export function defaultSources(): AgentSources {
  const home = homedir();
  return {
    trae: { builtinRoot: join(home, '.trae-cn', 'builtin') },
    claude: { claudeDir: join(home, '.claude') },
    codebuddy: { codebuddyDir: join(home, '.codebuddy') },
    codex: { codexDir: join(home, '.codex') },
    pluginsRoot: join(home, '.trae-cn', 'plugins'),
  };
}

/** 创建智能体路由（可注入 fs/sources，便于测试） */
export function agentsRouteFactory(deps: AgentsRouteDeps = { fs: nodeAgentFs, sources: defaultSources() }): Hono {
  const routes = new Hono();
  const { fs, sources } = deps;

  /** 列出智能体 */
  routes.get('/', (c) => {
    try {
      const result = listAgents({
        fs,
        sources,
        params: {
          tool: c.req.query('tool') ?? undefined,
          kind: (c.req.query('kind') as ListAgentsParams['kind']) ?? undefined,
          search: c.req.query('search') ?? undefined,
        },
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 单个智能体详情 */
  routes.get('/:id{.+}', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const result = getAgentRawContent(id, { fs, sources });
    if (!result) {
      return c.json({ error: `智能体不存在：${id}` }, 404);
    }
    return c.json(result);
  });

  return routes;
}

/** 默认路由（使用真实文件系统） */
export const agentsRoutes = agentsRouteFactory();
