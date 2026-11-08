/**
 * MCP stdio 服务装配测试（add-asset-governance J1/J5）
 *
 * spec: specs/mcp-entry.spec.md Scenario 2（列出 7 个工具）/ Scenario 1/10（结构化错误不崩）
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, MCP_TOOL_NAMES } from '../../../src/mcp/server.js';
import { McpToolError } from '../../../src/core/mcp-errors.js';
import type { McpToolHandlers } from '../../../src/core/mcp-types.js';

function stubHandlers(overrides: Partial<McpToolHandlers> = {}): McpToolHandlers {
  return {
    identityGet: () => ({
      content: '# Identity\n\n- 先给结论\n',
      hubRelativePath: 'identity/profile.md',
      versionHash: 'a'.repeat(64),
      updatedAt: '2026-11-08T00:00:00.000Z',
    }),
    assetsList: async () => ({
      items: [{ name: 'demo-rule', kind: 'rule', hubRelativePath: 'rules/demo-rule.md', diagnosisOverall: 'unknown', distribution: [] }],
      total: 1,
    }),
    assetGet: () => ({ content: '# demo\n', hubRelativePath: 'rules/demo-rule.md', truncated: false }),
    healthGet: async () => ({
      score: 80,
      grade: 'good',
      totalAssets: 1,
      qualityMode: 'mechanical-only',
      computedAt: '2026-11-08T00:00:00.000Z',
      cached: false,
      dimensions: [],
      topIssues: [],
    }),
    assetDiagnose: async () => ({ overall: 'healthy', issues: [], mechanicalOnly: true, aiUsed: false }),
    assetPropose: () => ({
      pendingChangeId: 'p-1',
      mode: 'create',
      hubRelativePath: 'rules/demo-rule.md',
      previewContent: '# demo\n',
      unifiedDiff: '',
      expiresAt: '2026-11-08T00:10:00.000Z',
    }),
    assetCommit: async () => ({ saved: true, hubRelativePath: 'rules/demo-rule.md', backupRef: '', dispatch: [] }),
    ...overrides,
  };
}

async function connect(handlers: McpToolHandlers) {
  const server = buildMcpServer(handlers);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'assetplex-test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}

let current: Awaited<ReturnType<typeof connect>> | null = null;

afterEach(async () => {
  await current?.client.close();
  await current?.server.close();
  current = null;
});

describe('MCP stdio 服务', () => {
  it('启动后宿主能列出 7 个工具（不占端口、不要求 HUB 运行）', async () => {
    current = await connect(stubHandlers());
    const tools = await current.client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(tools.tools).toHaveLength(7);
  });

  it('只读工具成功返回 JSON 文本', async () => {
    current = await connect(stubHandlers());
    const result = await current.client.callTool({ name: 'assetplex_identity_get', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text).hubRelativePath).toBe('identity/profile.md');
  });

  it('失败返回结构化错误（code/error/hint），进程不崩、后续调用仍可用', async () => {
    let fail = true;
    current = await connect(stubHandlers({
      identityGet: () => {
        if (fail) throw new McpToolError('NOT_FOUND', '尚未建立身份资产', '在 HUB 中创建身份');
        return {
          content: '# Identity\n',
          hubRelativePath: 'identity/profile.md',
          versionHash: 'a'.repeat(64),
          updatedAt: '2026-11-08T00:00:00.000Z',
        };
      },
    }));

    const first = await current.client.callTool({ name: 'assetplex_identity_get', arguments: {} });
    expect(first.isError).toBe(true);
    const payload = JSON.parse((first.content as Array<{ text: string }>)[0]?.text ?? '{}');
    expect(payload.code).toBe('NOT_FOUND');
    expect(payload.error).toContain('身份');
    expect(payload.hint).toContain('创建');

    fail = false;
    const second = await current.client.callTool({ name: 'assetplex_identity_get', arguments: {} });
    expect(second.isError).toBeFalsy();
  });

  it('propose 与 commit 是两次独立调用（两段式）', async () => {
    current = await connect(stubHandlers());
    const propose = await current.client.callTool({ name: 'assetplex_asset_propose', arguments: { kind: 'rule', mode: 'create', content: '# demo\n' } });
    expect(propose.isError).toBeFalsy();
    expect(JSON.parse((propose.content as Array<{ text: string }>)[0]?.text ?? '{}').pendingChangeId).toBe('p-1');

    const commit = await current.client.callTool({ name: 'assetplex_asset_commit', arguments: { pendingChangeId: 'p-1' } });
    expect(commit.isError).toBeFalsy();
    expect(JSON.parse((commit.content as Array<{ text: string }>)[0]?.text ?? '{}').saved).toBe(true);
  });
});
