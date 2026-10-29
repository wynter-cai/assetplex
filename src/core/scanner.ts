/**
 * 扫描器核心：协调所有适配器的 scan() 方法，返回统一的工具内容清单
 */

import type { DiscoveredItem, ToolInventory } from './types.js';
import { getAllAdapters } from './adapters/registry.js';
import { log } from '../utils/logger.js';

/**
 * 扫描结果去重：同一绝对路径只保留首次命中。
 *
 * 适配器内部按规则表顺序 push（identity → skills → rules → commands → agents），
 * 因此「首次命中」即优先级最高的归类，后命中的重复项（历史 preference 兜底规则等）丢弃。
 * spec: scan-classification-truth Scenario 4
 */
export function dedupeDiscovered(items: DiscoveredItem[]): DiscoveredItem[] {
  const seen = new Set<string>();
  const out: DiscoveredItem[] = [];
  for (const item of items) {
    if (seen.has(item.absolutePath)) continue;
    seen.add(item.absolutePath);
    out.push(item);
  }
  return out;
}

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
      if (status.installed) {
        try {
          items = dedupeDiscovered(await adapter.scan());
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
