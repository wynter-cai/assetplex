/**
 * 智能体路由测试
 *
 * spec: agents-inventory.spec.md（筛选校验、404）
 * 通过依赖注入替换 fs 与 sources，避免依赖真实机器目录。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { agentsRouteFactory } from '../../../src/server/routes/agents.js';
import type { AgentWriteFs } from '../../../src/core/agent-write.js';
import type { AgentFs, AgentSources } from '../../../src/core/agent-inventory.js';

/** 内存可写文件系统（AgentFs + 写方法，供写管理路由注入） */
class MemoryWriteFs implements AgentWriteFs {
  files: Record<string, string>;

  constructor(files: Record<string, string> = {}) {
    this.files = files;
  }

  read(p: string): string | null {
    return this.files[p] ?? null;
  }

  listDir(p: string): string[] {
    const names = new Set<string>();
    const base = p.replace(/\\/g, '/');
    for (const f of Object.keys(this.files)) {
      const norm = f.replace(/\\/g, '/');
      if (norm.startsWith(base + '/')) {
        const seg = norm.slice(base.length + 1).split('/')[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  }

  dirMtime(): string | null {
    return null;
  }

  exists(p: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, p);
  }

  ensureDir(): void {
    // 内存实现无需动作
  }

  writeFile(p: string, content: string): void {
    this.files[p] = content;
  }

  removeFile(p: string): void {
    delete this.files[p];
  }
}

function makeFs(files: Record<string, string>): MemoryWriteFs {
  return new MemoryWriteFs(files);
}

const sources: AgentSources = {
  trae: { builtinRoot: '/root/.trae-cn/builtin' },
  claude: { claudeDir: '/root/.claude' },
  codebuddy: { codebuddyDir: '/root/.codebuddy' },
  codex: { codexDir: '/root/.codex' },
  pluginsRoot: '/root/.trae-cn/plugins',
  hub: { agentsDir: '/hub/agents' },
};

function buildApp(fs: MemoryWriteFs): Hono {
  const app = new Hono();
  app.route('/api/agents', agentsRouteFactory({ fs, writeFs: fs, sources }));
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

describe('POST /api/agents 新建保险箱智能体', () => {
  const headers = { 'Content-Type': 'application/json' };

  it('201 创建成功：frontmatter 落盘且列表立即可见', async () => {
    const fs = makeFs({});
    const res = await buildApp(fs).request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '测试专家', description: '生成测试用例', content: '你是测试专家' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agent.tool).toBe('hub');
    expect(body.agent.kind).toBe('custom-subagent');
    expect(body.agent.id).toBe('hub:custom-subagent:测试专家');
    expect(fs.files['/hub/agents/测试专家.md']).toContain('description: 生成测试用例');

    const list = await buildApp(fs).request('/api/agents');
    expect((await list.json()).countByTool.hub).toBe(1);
  });

  it('重名（大小写不敏感）返回 400', async () => {
    const fs = makeFs({ '/hub/agents/reviewer.md': '---\nname: reviewer\ndescription: 已存在\n---' });
    const res = await buildApp(fs).request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'REVIEWER', content: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('非法名称返回 400', async () => {
    const res = await buildApp(makeFs({})).request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'a:b', content: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('缺 name 返回 400', async () => {
    const res = await buildApp(makeFs({})).request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/agents/:id 编辑保险箱智能体', () => {
  const headers = { 'Content-Type': 'application/json' };

  it('200 整文件替换成功', async () => {
    const fs = makeFs({ '/hub/agents/note.md': '---\nname: note\ndescription: 旧\n---' });
    const res = await buildApp(fs).request('/api/agents/hub:custom-subagent:note', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: '---\nname: note\ndescription: 新\n---\n新提示词' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.description).toBe('新');
    expect(fs.files['/hub/agents/note.md']).toContain('新提示词');
  });

  it('404 智能体不存在', async () => {
    const res = await buildApp(makeFs({})).request('/api/agents/hub:custom-subagent:ghost', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('400 非保险箱智能体拒绝编辑', async () => {
    const fs = makeFs({ '/root/.claude/agents/mine.md': '---\nname: mine\ndescription: claude 自建\n---' });
    const res = await buildApp(fs).request('/api/agents/claude:custom-subagent:mine', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/agents/:id 删除保险箱智能体', () => {
  it('200 删除后列表消失', async () => {
    const fs = makeFs({ '/hub/agents/note.md': '---\nname: note\ndescription: 旧\n---' });
    const res = await buildApp(fs).request('/api/agents/hub:custom-subagent:note', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(fs.files['/hub/agents/note.md']).toBeUndefined();

    const list = await buildApp(fs).request('/api/agents');
    expect((await list.json()).total).toBe(0);
  });

  it('404 智能体不存在', async () => {
    const res = await buildApp(makeFs({})).request('/api/agents/hub:custom-subagent:ghost', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('400 非保险箱智能体拒绝删除', async () => {
    const fs = makeFs({ '/root/.claude/agents/mine.md': '---\nname: mine\ndescription: claude 自建\n---' });
    const res = await buildApp(fs).request('/api/agents/claude:custom-subagent:mine', { method: 'DELETE' });
    expect(res.status).toBe(400);
  });
});
