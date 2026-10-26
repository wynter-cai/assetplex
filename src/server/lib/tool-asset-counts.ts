/**
 * 连接页工具详情的三口径计数（服务端派生）
 *
 * spec: asset-center-consistency（Scenario 2 计数一致 / Scenario 3 已同步来自真实状态）
 * 关联: fix-trust-and-consistency tasks I4、proposal D3 / D4
 *
 * 「已同步 N / 我的库 M / 可收藏 K」三个数字必须在这里算好下发：
 * 前端一律禁止就地 `filter(...).length`，否则同一类别又会长出第二个真相。
 * 三个口径互不可加总，界面必须带口径名（D4）。
 */

import { ASSET_CATEGORIES } from '../../core/asset-categories.js';
import type { DistributionIndexPayload } from '../../core/distribution-index.js';
import type { DiscoveredItem } from '../../core/types.js';

/** 单类别三口径（名字与 spec 术语表一一对应） */
export interface ToolCategoryCounts {
  /** 我的库：Hub 内该类资产入口数（与工具无关） */
  library: number;
  /** 已同步：该工具中状态为 synced 的库内资产数 */
  synced: number;
  /** 可收藏：该工具扫到且我的库里没有的条目数 */
  pendingImport: number;
}

export interface ToolAssetCounts {
  /** key = 类别 code；声明源之外的类别照实补上，不丢计数 */
  byCategory: Record<string, ToolCategoryCounts>;
  /** 项目级工具（如 Qoder）已接入项目数；null = 按单资产同步的普通工具（D3） */
  projectCount: number | null;
  /** 索引部分工具判定失败，界面须提示「部分工具状态暂不可用」 */
  partial: boolean;
  failedTools: string[];
  /** 索引生成时间，界面据此说明数字的新鲜度 */
  generatedAt: string;
}

export interface ToolAssetCountsInput {
  toolId: string;
  /** 未安装的工具不产出任何已同步/可收藏数字，避免拿 0 冒充结论 */
  installed: boolean;
  assets: ReadonlyArray<{ id: string; category: string }>;
  distribution: DistributionIndexPayload;
  /** 该工具的扫描结果；未安装或扫描失败时传空数组 */
  discovered: ReadonlyArray<Pick<DiscoveredItem, 'category' | 'hubTargetPath' | 'conflict'>>;
}

type CountsByCategory = Record<string, ToolCategoryCounts>;

function makeBucket(): ToolCategoryCounts {
  return { library: 0, synced: 0, pendingImport: 0 };
}

/** 取某类别的桶，声明源之外的类别（如 memory）自动补一条 */
function bucket(byCategory: CountsByCategory, code: string): ToolCategoryCounts {
  const existing = byCategory[code];
  if (existing) return existing;
  const created = makeBucket();
  byCategory[code] = created;
  return created;
}

/** 已同步：只认分发索引里该工具的 synced，未入库资产不参与 */
function countSynced(
  byCategory: CountsByCategory,
  categoryOf: ReadonlyMap<string, string>,
  index: DistributionIndexPayload['index'],
  toolId: string,
): void {
  for (const [assetId, entries] of Object.entries(index)) {
    const category = categoryOf.get(assetId);
    if (!category) continue;
    if (entries.some((entry) => entry.toolId === toolId && entry.status === 'synced')) {
      bucket(byCategory, category).synced += 1;
    }
  }
}

/** 可收藏：conflict=none（我的库里没有该目标文件），同一路径只计一次 */
function countPendingImport(
  byCategory: CountsByCategory,
  discovered: ToolAssetCountsInput['discovered'],
): void {
  const seen = new Map<string, Set<string>>();
  for (const item of discovered) {
    if (item.conflict !== 'none') continue;
    let paths = seen.get(item.category);
    if (!paths) {
      paths = new Set<string>();
      seen.set(item.category, paths);
    }
    paths.add(item.hubTargetPath);
  }
  for (const [category, paths] of seen) {
    bucket(byCategory, category).pendingImport = paths.size;
  }
}

/** 组装某工具的三口径计数（纯函数，不碰文件系统） */
export function buildToolAssetCounts(input: ToolAssetCountsInput): ToolAssetCounts {
  const byCategory: CountsByCategory = {};
  for (const category of ASSET_CATEGORIES) byCategory[category.code] = makeBucket();

  const categoryOf = new Map<string, string>();
  for (const asset of input.assets) {
    categoryOf.set(asset.id, asset.category);
    bucket(byCategory, asset.category).library += 1;
  }

  const project = input.distribution.projectTools.find((tool) => tool.toolId === input.toolId);
  if (input.installed && !project) {
    countSynced(byCategory, categoryOf, input.distribution.index, input.toolId);
  }
  if (input.installed) {
    countPendingImport(byCategory, input.discovered);
  }

  return {
    byCategory,
    projectCount: project?.projectCount ?? null,
    partial: input.distribution.partial,
    failedTools: input.distribution.failedTools,
    generatedAt: input.distribution.generatedAt,
  };
}
