/**
 * 智能体盘点 API 路由
 *
 * GET /api/agents         列出（可筛选）
 * GET /api/agents/:id     单个详情 + 原始内容
 * POST /api/agents        新建保险箱智能体
 * PUT /api/agents/:id     编辑保险箱智能体（整文件替换）
 * DELETE /api/agents/:id  删除保险箱智能体
 *
 * spec: agents-inventory.spec.md, add-skill-agent-write-management
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
import {
  createVaultAgent,
  updateVaultAgent,
  deleteVaultAgent,
  type AgentWriteFs,
} from '../../core/agent-write.js';
import { getHubRoot } from '../../utils/paths.js';
import { nodeAgentFs } from '../lib/node-agent-fs.js';
import { nodeAgentWriteFs } from '../lib/node-agent-write-fs.js';
import { toWriteErrorResponse } from '../lib/write-error.js';

export interface AgentsRouteDeps {
  fs: AgentFs;
  writeFs: AgentWriteFs;
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
    hub: { agentsDir: join(getHubRoot(), 'agents') },
  };
}

/** 创建智能体路由（可注入 fs/sources，便于测试） */
export function agentsRouteFactory(
  deps: AgentsRouteDeps = { fs: nodeAgentFs, writeFs: nodeAgentWriteFs, sources: defaultSources() },
): Hono {
  const routes = new Hono();
  const { fs, writeFs, sources } = deps;

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

  /** 新建保险箱智能体（hub agents/<name>.md） */
  routes.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = body as { name?: unknown; description?: unknown; content?: unknown } | null;
    if (typeof parsed?.name !== 'string') {
      return c.json({ error: 'name 必须是字符串' }, 400);
    }
    if (typeof parsed?.content !== 'string') {
      return c.json({ error: 'content 必须是字符串' }, 400);
    }
    if (parsed.description !== undefined && typeof parsed.description !== 'string') {
      return c.json({ error: 'description 必须是字符串' }, 400);
    }
    try {
      const agent = createVaultAgent(
        { name: parsed.name, description: parsed.description, content: parsed.content },
        { fs: writeFs, sources },
      );
      return c.json({ agent }, 201);
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 编辑保险箱智能体（整文件替换） */
  routes.put('/:id{.+}', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const content = (body as { content?: unknown } | null)?.content;
    if (typeof content !== 'string') {
      return c.json({ error: 'content 必须是字符串' }, 400);
    }
    try {
      const agent = updateVaultAgent(id, content, { fs: writeFs, sources });
      return c.json({ agent });
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
    }
  });

  /** 删除保险箱智能体（agents/<name>.md） */
  routes.delete('/:id{.+}', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      deleteVaultAgent(id, { fs: writeFs, sources });
      return c.json({ success: true });
    } catch (err) {
      const { status, message } = toWriteErrorResponse(err);
      return c.json({ error: message }, status);
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
