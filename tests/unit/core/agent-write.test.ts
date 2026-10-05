/**
 * 保险箱智能体写服务单元测试（T1.3）
 *
 * spec: add-skill-agent-write-management / specs/agent-write.spec.md
 * 纯逻辑：文件系统通过内存版 AgentWriteFs 注入。
 */

import { describe, it, expect } from 'vitest';
import {
  createVaultAgent,
  updateVaultAgent,
  deleteVaultAgent,
  AgentWriteError,
  type AgentWriteFs,
} from '../../../src/core/agent-write.js';
import { listAgents } from '../../../src/core/agent-inventory.js';
import type { AgentSources } from '../../../src/core/agent-inventory.js';

/** 内存版可写文件系统 */
class MemoryWriteFs implements AgentWriteFs {
  files = new Map<string, string>();
  ensureDirCalls: string[] = [];

  read(p: string): string | null {
    return this.files.get(p) ?? null;
  }

  listDir(p: string): string[] {
    const base = p.replace(/\\/g, '/').replace(/\/+$/, '');
    const names = new Set<string>();
    for (const key of this.files.keys()) {
      const k = key.replace(/\\/g, '/');
      if (k.startsWith(`${base}/`)) {
        const seg = k.slice(base.length + 1).split('/')[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  }

  dirMtime(): string | null {
    return null;
  }

  exists(p: string): boolean {
    return this.files.has(p);
  }

  ensureDir(p: string): void {
    this.ensureDirCalls.push(p);
  }

  writeFile(p: string, content: string): void {
    this.files.set(p, content);
  }

  removeFile(p: string): void {
    this.files.delete(p);
  }
}

const SOURCES: AgentSources = {
  trae: { builtinRoot: '/home/u/.trae-cn/builtin' },
  claude: { claudeDir: '/home/u/.claude' },
  codebuddy: { codebuddyDir: '/home/u/.codebuddy' },
  codex: { codexDir: '/home/u/.codex' },
  pluginsRoot: '/home/u/.trae-cn/plugins',
  hub: { agentsDir: '/hub/agents' },
};

function makeDeps(fs: MemoryWriteFs): { fs: MemoryWriteFs; sources: AgentSources } {
  return { fs, sources: SOURCES };
}

function expectWriteError(fn: () => void, status: 400 | 404, messagePart?: string): void {
  try {
    fn();
    expect.fail('应当抛出 AgentWriteError');
  } catch (err) {
    expect(err).toBeInstanceOf(AgentWriteError);
    const e = err as AgentWriteError;
    expect(e.status).toBe(status);
    if (messagePart) expect(e.message).toContain(messagePart);
  }
}

describe('createVaultAgent 新建保险箱智能体', () => {
  it('正常创建：写入 agents/<name>.md，frontmatter 含 name/description，返回 hub 条目', () => {
    const fs = new MemoryWriteFs();
    const agent = createVaultAgent(
      { name: '测试专家', description: '负责生成测试用例', content: '你是测试专家' },
      makeDeps(fs),
    );

    expect(agent.tool).toBe('hub');
    expect(agent.kind).toBe('custom-subagent');
    expect(agent.userCreated).toBe(true);
    expect(agent.id).toBe('hub:custom-subagent:测试专家');
    expect(agent.sourcePath).toBe('/hub/agents/测试专家.md');

    const raw = fs.files.get('/hub/agents/测试专家.md');
    expect(raw).toContain('name: 测试专家');
    expect(raw).toContain('description: 负责生成测试用例');
    expect(raw).toContain('你是测试专家');
  });

  it('创建时确保 agents 目录存在', () => {
    const fs = new MemoryWriteFs();
    createVaultAgent({ name: 'a', content: '' }, makeDeps(fs));
    expect(fs.ensureDirCalls).toContain('/hub/agents');
  });

  it('创建后立即纳入盘点', () => {
    const fs = new MemoryWriteFs();
    createVaultAgent({ name: '测试专家', content: 'x' }, makeDeps(fs));

    const list = listAgents({ fs, sources: SOURCES });
    expect(list.total).toBe(1);
    expect(list.items[0]?.tool).toBe('hub');
    expect(list.countByTool.hub).toBe(1);
    expect(list.countByKind['custom-subagent']).toBe(1);
  });

  it('重名拒绝（hub 内，大小写不敏感）', () => {
    const fs = new MemoryWriteFs();
    createVaultAgent({ name: '测试专家', content: '' }, makeDeps(fs));
    expectWriteError(() => createVaultAgent({ name: '测试专家', content: '' }, makeDeps(fs)), 400, '同名');
    expectWriteError(
      () => createVaultAgent({ name: '测试专家', content: '' }, makeDeps(fs)),
      400,
    );
  });

  it('与其他工具同名允许（不同来源独立条目）', () => {
    const fs = new MemoryWriteFs();
    fs.files.set('/home/u/.claude/agents/my-agent.md', '---\nname: my-agent\ndescription: claude 副本\n---');
    createVaultAgent({ name: 'my-agent', content: '' }, makeDeps(fs));

    const list = listAgents({ fs, sources: SOURCES });
    expect(list.total).toBe(2);
  });

  it.each(['', '   ', '.', '..', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b'])(
    '非法名称 %j 拒绝创建',
    (name) => {
      const fs = new MemoryWriteFs();
      expectWriteError(() => createVaultAgent({ name, content: '' }, makeDeps(fs)), 400);
    },
  );
});

describe('updateVaultAgent 编辑保险箱智能体', () => {
  it('正常更新：整文件替换并返回刷新条目', () => {
    const fs = new MemoryWriteFs();
    createVaultAgent({ name: '测试专家', description: '旧', content: '旧正文' }, makeDeps(fs));

    const updated = updateVaultAgent(
      'hub:custom-subagent:测试专家',
      '---\nname: 测试专家\ndescription: 新描述\n---\n新提示词',
      makeDeps(fs),
    );

    expect(updated.description).toBe('新描述');
    const raw = fs.files.get('/hub/agents/测试专家.md') ?? '';
    expect(raw).toContain('新提示词');
  });

  it('智能体不存在返回 404', () => {
    const fs = new MemoryWriteFs();
    expectWriteError(() => updateVaultAgent('hub:custom-subagent:ghost', 'x', makeDeps(fs)), 404, '不存在');
  });

  it('非保险箱智能体拒绝编辑', () => {
    const fs = new MemoryWriteFs();
    fs.files.set('/home/u/.claude/agents/mine.md', '---\nname: mine\ndescription: claude 自建\n---');
    expectWriteError(() => updateVaultAgent('claude:custom-subagent:mine', 'x', makeDeps(fs)), 400);
  });
});

describe('deleteVaultAgent 删除保险箱智能体', () => {
  it('正常删除：文件移除，列表不再显示', () => {
    const fs = new MemoryWriteFs();
    createVaultAgent({ name: '测试专家', content: 'x' }, makeDeps(fs));

    deleteVaultAgent('hub:custom-subagent:测试专家', makeDeps(fs));

    expect(fs.files.has('/hub/agents/测试专家.md')).toBe(false);
    const list = listAgents({ fs, sources: SOURCES });
    expect(list.total).toBe(0);
  });

  it('智能体不存在返回 404', () => {
    const fs = new MemoryWriteFs();
    expectWriteError(() => deleteVaultAgent('hub:custom-subagent:ghost', makeDeps(fs)), 404, '不存在');
  });

  it('非保险箱智能体拒绝删除', () => {
    const fs = new MemoryWriteFs();
    fs.files.set('/home/u/.claude/agents/mine.md', '---\nname: mine\ndescription: claude 自建\n---');
    expectWriteError(() => deleteVaultAgent('claude:custom-subagent:mine', makeDeps(fs)), 400);
  });
});
