/**
 * 适配器注册表
 *
 * 借鉴 agentsmesh 的 Plugin 架构：
 * - 内置适配器默认注册
 * - 第三方适配器可通过 registerAdapter() 注册
 * - 新工具支持无需发版
 */

import type { ToolAdapter } from './base.js';
import { TraeCnAdapter } from './trae-cn.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CodexAdapter } from './codex.js';
import { WorkBuddyAdapter } from './workbuddy.js';
import { QoderAdapter } from './qoder.js';

const registry = new Map<string, ToolAdapter>();

/** 注册适配器 */
export function registerAdapter(adapter: ToolAdapter): void {
  registry.set(adapter.name, adapter);
}

/** 获取适配器 */
export function getAdapter(name: string): ToolAdapter | undefined {
  return registry.get(name);
}

/** 获取所有已注册适配器 */
export function getAllAdapters(): ToolAdapter[] {
  return Array.from(registry.values());
}

/** 获取所有适配器名 */
export function getAdapterNames(): string[] {
  return Array.from(registry.keys());
}

/** 注册内置适配器 */
export function registerBuiltinAdapters(): void {
  registerAdapter(new TraeCnAdapter());
  registerAdapter(new ClaudeCodeAdapter());
  registerAdapter(new CodexAdapter());
  registerAdapter(new WorkBuddyAdapter());
  registerAdapter(new QoderAdapter());
}
