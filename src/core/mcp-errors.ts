/**
 * MCP 工具统一错误（add-asset-governance J5）
 *
 * spec: specs/mcp-entry.spec.md Scenario 1/10
 * 约定：工具失败一律返回结构化错误（code + 人话提示 + 建议动作），宿主进程不崩。
 */

export type McpToolErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'OUT_OF_HUB'
  | 'STALE_PENDING'
  | 'AI_UNAVAILABLE'
  | 'IO_FAILED';

export class McpToolError extends Error {
  constructor(
    readonly code: McpToolErrorCode,
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export interface McpErrorPayload {
  code: McpToolErrorCode;
  error: string;
  hint: string;
}

/** 任意异常 → 结构化错误载荷；未知异常不吞细节，但统一归为 IO_FAILED */
export function toMcpErrorPayload(err: unknown): McpErrorPayload {
  if (err instanceof McpToolError) {
    return { code: err.code, error: err.message, hint: err.hint };
  }
  return {
    code: 'IO_FAILED',
    error: err instanceof Error ? err.message : String(err),
    hint: '稍后重试；若持续失败，检查 Hub 目录权限与草稿缓存文件是否可读',
  };
}

/** 任意异常 → McpToolError（handler 内部统一出口） */
export function asMcpToolError(err: unknown): McpToolError {
  if (err instanceof McpToolError) return err;
  const payload = toMcpErrorPayload(err);
  return new McpToolError(payload.code, payload.error, payload.hint);
}
