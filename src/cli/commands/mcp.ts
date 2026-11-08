/**
 * assetplex mcp 命令实现（add-asset-governance J1）
 *
 * stdio 模式下 stdout 是协议通道，任何提示只能写 stderr。
 */

import { runMcpServer } from '../../mcp/server.js';

export async function mcpCommand(): Promise<void> {
  try {
    await runMcpServer();
  } catch (err) {
    console.error('AssetPlex MCP 启动失败:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
