/**
 * 导入请求构建（add-zero-config-onboarding T10，从 Import.tsx 抽取共享）
 *
 * Import 页与首跑向导收纳共用同一份构建逻辑，保证冲突策略、
 * 二进制透传、仲裁草案语义只有一处真相。
 */

import type { DiscoveredItem, ImportItem, ConflictStrategy } from '@/types/api';

/** 条目唯一键：tool:absolutePath（与 Import 页一致） */
export function itemKey(item: DiscoveredItem): string {
  return `${item.tool}:${item.absolutePath}`;
}

/** 冲突项解决状态：策略 + 可选的已采纳仲裁草案（仅 merge 时有意义） */
export interface ConflictResolution {
  strategy: ConflictStrategy;
  draft?: string;
}

export interface BuildImportItemsInput {
  allItems: DiscoveredItem[];
  selectedItemKeys: Set<string>;
  conflictResolutions: Map<string, ConflictResolution>;
}

/**
 * 构建导入请求：
 * - 只含已选中条目
 * - differs 项携带策略（缺省 merge）；已采纳草案时透传 mergeDraft
 * - binary 标记透传（后端据此走字节写入）
 */
export function buildImportItems(input: BuildImportItemsInput): ImportItem[] {
  return input.allItems
    .filter((item) => input.selectedItemKeys.has(itemKey(item)))
    .map((item) => {
      const resolution = item.conflict === 'differs'
        ? (input.conflictResolutions.get(item.hubTargetPath) ?? { strategy: 'merge' as ConflictStrategy })
        : undefined;
      return {
        tool: item.tool,
        absolutePath: item.absolutePath,
        hubTargetPath: item.hubTargetPath,
        category: item.category,
        conflict: item.conflict,
        strategy: resolution?.strategy,
        binary: item.binary,
        ...(resolution !== undefined && resolution.strategy === 'merge' && resolution.draft !== undefined
          ? { mergeDraft: resolution.draft }
          : {}),
      };
    });
}
