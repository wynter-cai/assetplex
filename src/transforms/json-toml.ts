/**
 * JSON ↔ TOML 互转器
 *
 * 主要场景：Hub 的 mcp.sources.json (JSON) → Codex 的 config.toml (TOML)
 *
 * 字段映射：
 * - mcpServers (Claude/JSON 格式) ↔ mcp_servers (Codex/TOML 格式)
 *
 * 注意：@iarna/toml 不保留注释，转换会丢注释
 */

import * as TOML from '@iarna/toml';

/**
 * JSON 字符串 → TOML 字符串
 */
export function jsonToToml(jsonStr: string): string {
  const obj = JSON.parse(jsonStr);
  return jsonObjToToml(obj);
}

/**
 * JSON 对象 → TOML 字符串
 */
export function jsonObjToToml(obj: unknown): string {
  return TOML.stringify(obj as TOML.JsonMap);
}

/**
 * TOML 字符串 → JSON 对象
 */
export function tomlToJsonObj(tomlStr: string): unknown {
  return TOML.parse(tomlStr);
}

/**
 * TOML 字符串 → JSON 字符串（美化）
 */
export function tomlToJson(tomlStr: string): string {
  return JSON.stringify(TOML.parse(tomlStr), null, 2);
}

/**
 * MCP 配置：JSON → TOML
 *
 * Claude 格式:
 *   { "mcpServers": { "name": { "command": "...", "args": [...] } } }
 *
 * Codex 格式:
 *   [mcp_servers.name]
 *   command = "..."
 *   args = [...]
 *
 * 转换：mcpServers → mcp_servers（下划线转换）
 */
export function mcpJsonToToml(jsonStr: string): string {
  const obj = JSON.parse(jsonStr);
  const result: Record<string, unknown> = {};

  // 顶层 mcpServers → mcp_servers
  if (obj && typeof obj === 'object' && 'mcpServers' in obj) {
    result.mcp_servers = (obj as { mcpServers: Record<string, unknown> }).mcpServers;
  }

  // 保留其他顶层字段（如 model、log_level 等）
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key !== 'mcpServers') {
      result[key] = value;
    }
  }

  return TOML.stringify(result as TOML.JsonMap);
}

/**
 * MCP 配置：TOML → JSON
 *
 * 反向：mcp_servers → mcpServers
 */
export function mcpTomlToJson(tomlStr: string): string {
  const obj = TOML.parse(tomlStr) as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // mcp_servers → mcpServers
  if ('mcp_servers' in obj) {
    result.mcpServers = obj.mcp_servers;
  }

  // 保留其他顶层字段
  for (const [key, value] of Object.entries(obj)) {
    if (key !== 'mcp_servers') {
      result[key] = value;
    }
  }

  return JSON.stringify(result, null, 2);
}

/**
 * 判断字符串是否为有效 TOML
 */
export function isValidToml(str: string): boolean {
  try {
    TOML.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * 判断字符串是否为有效 JSON
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
