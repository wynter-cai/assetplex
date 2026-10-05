/**
 * 智能体路由测试
 *
 * spec: agents-inventory.spec.md（筛选校验、404）
 * 通过依赖注入替换 fs 与 sources，避免依赖真实机器目录。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { agentsRouteFactory } from '../../../src/server/routes/agents.js';
import type { AgentFs, AgentSources } from '../../../src/core/agent-inventory.js';

function makeFs(files: Record<string, string>): AgentFs {
  return {
    read: (p) => files[p] ?? null,
    listDir: (p) => {
      const names = new Set<string>();
      const base = p.replace(/\\/g, '/');
      for (const f of Object.keys(files)) {
        const norm = f.replace(/\\/g, '/');
        if (norm.startsWith(base + '/')) {
          const seg = norm.slice(base.length + 1).split('/')[0];
          if (seg) names.add(seg);
        }
      }
      return Array.from(names).sort();
    },
    dirMtime: () => null,
  };
}

const sources: AgentSources = {
  trae: { builtinRoot: '/root/.trae-cn/builtin' },
  claude: { claudeDir: '/root/.claude' },
  codebuddy: { codebuddyDir: '/root/.codebuddy' },
  codex: { codexDir: '/root/.codex' },
  pluginsRoot: '/root/.trae-cn/plugins',
};

function buildApp(fs: AgentFs): Hono {
  const app = new Hono();
  app.route('/api/agents', agentsRouteFactory({ fs, sources }));
  return app;
}

describe('GET /api/agents', () => {
  let fs: AgentFs;

  beforeEach(() => {
    fs = makeFs({
      [`${sources.trae.builtinRoot}/manifests/solo.json`]: JSON.stringify({
        agent_types: [
          { name: 'work', models: [{ name: 'hebe', skills: [] }] },
        ],
      }),
      [`${sources.claude.claudeDir}/agents/my-agent.md`]: '---\nname: my-agent\ndescription: mine\n---',
    });
  });

  it('返回 200 与聚合结构', async () => {
    const res = await buildApp(fs).request('/api/agents');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.countByKind['custom-subagent']).toBe(1);
    expect(body.countByKind['builtin-persona']).toBe(1);
  });

  it('kind 筛选', async () => {
    const res = await buildApp(fs).request('/api/agents?kind=expert');
    const body = await res.json();
    expect(body.total).toBe(0);
  });

  it('非法 kind 返回 400', async () => {
    const res = await buildApp(fs).request('/api/agents?kind=nope');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/kind/);
  });
});

describe('GET /api/agents/:id', () => {
  it('存在时返回详情与原始内容', async () => {
    const fs = makeFs({
      [`${sources.claude.claudeDir}/agents/my-agent.md`]: '---\nname: my-agent\n---\n正文XYZ',
    });
    const res = await buildApp(fs).request('/api/agents/claude:custom-subagent:my-agent');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.name).toBe('my-agent');
    expect(body.rawContent).toContain('正文XYZ');
  });

  it('不存在返回 404', async () => {
    const fs = makeFs({});
    const res = await buildApp(fs).request('/api/agents/ghost');
    expect(res.status).toBe(404);
  });
});
