/**
 * 适配器相关类型
 */

import type { HubConfig } from '../config.js';
import type { McpFormat, SyncStrategy } from '../types.js';

/**
 * 单个工具的配置（hub.toml 中 tools.<name> 的内容）
 *
 * 由于 hub.toml 中每个工具的字段不完全相同，
 * 这里采用并集类型，子集字段为可选
 */
export interface ToolConfig {
  enabled: boolean;
  configDir: string;
  syncStrategy: SyncStrategy;
  mcpFormat?: McpFormat;
  /** 工具特定字段 */
  [key: string]: unknown;
}

/**
 * 从 HubConfig 中提取某工具的配置
 */
export function getToolConfig(hubConfig: HubConfig, toolName: string): ToolConfig | null {
  const tools = hubConfig.tools as unknown as Record<string, Record<string, unknown>>;
  const raw = tools[toolName];
  if (!raw) return null;
  return {
    enabled: (raw.enabled as boolean) ?? false,
    configDir: (raw.configDir as string) ?? '',
    syncStrategy: (raw.syncStrategy as SyncStrategy) ?? 'hybrid',
    mcpFormat: raw.mcpFormat as McpFormat | undefined,
    ...raw,
  };
}
