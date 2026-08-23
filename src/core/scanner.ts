/**
 * 扫描器核心：协调所有适配器的 scan() 方法，返回统一的工具内容清单
 */

import type { DiscoveredItem, ToolInventory } from './types.js';
import { getAllAdapters } from './adapters/registry.js';
import { log } from '../utils/logger.js';

/**
 * 扫描所有已注册工具的可导入内容
 *
 * @returns ToolInventory[] 每个工具的扫描结果
 */
export async function scanAll(): Promise<ToolInventory[]> {
  const adapters = getAllAdapters();
  const results: ToolInventory[] = [];

  for (const adapter of adapters) {
    try {
      const status = await adapter.detect();

      let items: DiscoveredItem[] = [];
      // Qoder 始终可扫描（项目级，detect 返回 installed=false）
      if (status.installed || adapter.name === 'qoder') {
        try {
          items = await adapter.scan();
        } catch (scanErr) {
          log.warn(`[${adapter.name}] scan 失败: ${(scanErr as Error).message}`);
          items = [];
        }
      }

      results.push({
        toolName: adapter.name,
        displayName: adapter.displayName,
        installed: status.installed,
        configDir: status.configDir,
        items,
      });
    } catch (err) {
      log.warn(`[${adapter.name}] detect 失败: ${(err as Error).message}`);
      results.push({
        toolName: adapter.name,
        displayName: adapter.displayName,
        installed: false,
        configDir: '',
        items: [],
      });
    }
  }

  return results;
}
