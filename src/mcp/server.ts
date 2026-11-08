/**
 * AssetPlex MCP stdio 服务（add-asset-governance J1/J2/J3）
 *
 * spec: specs/mcp-entry.spec.md Scenario 2（一行配置接入、不占端口、不开浏览器）
 *
 * 注意：stdio 传输下 stdout 属于协议通道，任何日志只能走 stderr。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpToolHandlers } from '../core/mcp-tools.js';
import { toMcpErrorPayload } from '../core/mcp-errors.js';
import type { McpToolHandlers } from '../core/mcp-types.js';
import { createNodeMcpDeps } from './node-deps.js';

export const MCP_TOOL_NAMES = [
  'assetplex_identity_get',
  'assetplex_assets_list',
  'assetplex_asset_get',
  'assetplex_health_get',
  'assetplex_asset_diagnose',
  'assetplex_asset_propose',
  'assetplex_asset_commit',
] as const;

const KIND = z.enum(['identity', 'skill', 'rule', 'agent', 'command', 'memory']);

function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** 任何异常都转成结构化错误，MCP 进程保持存活（Scenario 10） */
async function guard(run: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await run());
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(toMcpErrorPayload(err), null, 2) }] };
  }
}

export function buildMcpServer(handlers: McpToolHandlers): McpServer {
  const server = new McpServer({ name: 'assetplex', version: '0.1.0' });

  server.registerTool(
    'assetplex_identity_get',
    {
      title: '获取当前身份',
      description: '读取本机 AssetPlex Hub 中的身份正文与硬约束。开工前先调用；只读、零模型调用。',
      inputSchema: {},
    },
    () => guard(() => handlers.identityGet()),
  );

  server.registerTool(
    'assetplex_assets_list',
    {
      title: '列出资产',
      description: '按类别列出 Hub 内资产（名称、路径、诊断状态、分发状态）。只读、零模型调用。',
      inputSchema: {
        kind: KIND.optional().describe('identity / skill / rule / agent / command / memory'),
        limit: z.number().int().positive().optional().describe('最多返回条数'),
      },
    },
    (args) => guard(() => handlers.assetsList(args)),
  );

  server.registerTool(
    'assetplex_asset_get',
    {
      title: '读取资产正文',
      description: '读取单个资产正文；超出上限会截断并标注 truncated。只读、零模型调用。',
      inputSchema: {
        kind: KIND,
        hubRelativePath: z.string().describe('Hub 相对路径，如 rules/demo-rule.md'),
      },
    },
    (args) => guard(() => handlers.assetGet(args)),
  );

  server.registerTool(
    'assetplex_health_get',
    {
      title: '获取健康分',
      description: '返回四维健康分摘要与前三条问题。只读、零模型调用。',
      inputSchema: {},
    },
    () => guard(() => handlers.healthGet()),
  );

  server.registerTool(
    'assetplex_asset_diagnose',
    {
      title: '诊断单个资产',
      description: '机械项恒跑；语义项仅在 useAi=true 时调用用户自配模型（默认 false，零模型调用）。',
      inputSchema: {
        kind: KIND,
        hubRelativePath: z.string(),
        useAi: z.boolean().optional().describe('默认 false：只跑机械项'),
      },
    },
    (args) => guard(() => handlers.assetDiagnose(args)),
  );

  server.registerTool(
    'assetplex_asset_propose',
    {
      title: '提交资产草案（不落盘）',
      description: '产出新增/修改草案与 diff 预览，零写库，返回 pendingChangeId（10 分钟内有效）。',
      inputSchema: {
        kind: KIND,
        mode: z.enum(['create', 'update']),
        hubRelativePath: z.string().optional().describe('update 必填；create 可省略由服务端生成'),
        content: z.string().describe('完整文件内容（含 frontmatter）'),
        rationale: z.string().optional().describe('给用户看的一句话理由'),
      },
    },
    (args) => guard(() => handlers.assetPropose(args)),
  );

  server.registerTool(
    'assetplex_asset_commit',
    {
      title: '落盘资产草案',
      description: '凭 pendingChangeId 写库（写前备份）。默认只写 Hub、不分发；需要分发时显式传 distribute=true。',
      inputSchema: {
        pendingChangeId: z.string(),
        distribute: z.boolean().optional().describe('默认 false：只写 Hub'),
        targets: z.array(z.string()).optional().describe('分发目标工具；缺省用默认目标'),
      },
    },
    (args) => guard(() => handlers.assetCommit(args)),
  );

  return server;
}

/** 启动 stdio 服务（不占用端口、不打开浏览器、不要求 HUB Web 运行） */
export async function runMcpServer(): Promise<void> {
  const handlers = createMcpToolHandlers(createNodeMcpDeps());
  const server = buildMcpServer(handlers);
  await server.connect(new StdioServerTransport());
}
