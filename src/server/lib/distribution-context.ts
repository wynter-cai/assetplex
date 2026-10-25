/**
 * 分发索引的装配与计数汇总（server 层组合 core）
 *
 * - loadDistributionDeps：把适配器 / 配置 / 资产清单拼成索引输入
 * - buildCounts：从真实索引聚合「我的库」与「已同步」两类口径
 *
 * 口径约束（spec asset-center-consistency）：界面数字必须来自这里，
 * 禁止前端就地 filter().length。
 */

import { listAssets } from '../../core/assets.js';
import {
  getDistributionIndex,
  type DistributionIndexDeps,
  type DistributionIndexPayload,
  type DistributionIndexResponse,
} from '../../core/distribution-index.js';
import { ASSET_CATEGORIES } from '../../core/asset-categories.js';
import { getHubRoot } from '../../utils/paths.js';
import { hubContext } from './hub-context.js';

/** 单类别三口径（阶段 0 只有 library 有真值） */
export interface CategoryCounts {
  library: number;
  /** 本机环境：阶段 0 恒为 0，由 /api/skills 供数，首页不得展示 */
  environment: number;
  /** 可收藏：阶段 0 恒为 0，由 /api/skills 供数，首页不得展示 */
  pendingImport: number;
}

/** 单个工具的已同步计数（来源＝分发状态索引，不读 Hub 文件数） */
export interface ToolSyncedCounts {
  toolId: string;
  byCategory: Record<string, number>;
  total: number;
}

/** hub.toml 中该工具是否启用 */
function isToolEnabled(tools: unknown, name: string): boolean {
  if (typeof tools !== 'object' || tools === null) return false;
  const record = tools as Record<string, { enabled?: boolean } | undefined>;
  return record[name]?.enabled ?? false;
}

/** 组装索引输入：只读，不改配置 */
export async function loadDistributionDeps(): Promise<DistributionIndexDeps> {
  const config = hubContext.getConfig();
  const { items } = await listAssets();
  return {
    tools: hubContext.getAllAdapters().map((adapter) => ({
      adapter,
      enabled: isToolEnabled(config.tools, adapter.name),
    })),
    hubConfig: config,
    hubRoot: getHubRoot(),
    assets: items.map((item) => ({
      id: item.id,
      hubPath: item.hubPath,
      category: item.category,
    })),
  };
}

/** 取分发索引（默认 30 秒缓存） */
export function getDistributions(refresh = false): Promise<DistributionIndexResponse> {
  return getDistributionIndex({ refresh }, loadDistributionDeps);
}

/**
 * 用「我的库」真值覆盖 overview.assetStats
 *
 * getOverview 的 assetStats 按目录文件数统计（含 _meta.json、技能子文件），
 * 与 counts.library 天然不一致。同一响应里出现两个数字等于又是一次撒谎，
 * 因此凡是有同源计数的类别，一律以 listAssets 的结果为准。
 */
export function alignAssetStats(
  assetStats: Record<string, number>,
  counts: Record<string, CategoryCounts>,
): Record<string, number> {
  const aligned: Record<string, number> = { ...assetStats };
  for (const [code, value] of Object.entries(counts)) {
    if (code in aligned) aligned[code] = value.library;
  }
  return aligned;
}

/**
 * 汇总两类真值口径
 *
 * @param items 我的库资产清单（来自 listAssets）
 * @param distribution 分发索引（来自 getDistributions）
 */
export function buildCounts(
  items: ReadonlyArray<{ id: string; category: string }>,
  distribution: DistributionIndexPayload,
): { counts: Record<string, CategoryCounts>; toolSynced: ToolSyncedCounts[] } {
  const categoryOf = new Map<string, string>();
  const counts: Record<string, CategoryCounts> = {};
  for (const category of ASSET_CATEGORIES) {
    counts[category.code] = { library: 0, environment: 0, pendingImport: 0 };
  }
  for (const item of items) {
    categoryOf.set(item.id, item.category);
    const bucket = counts[item.category];
    if (bucket) bucket.library += 1;
  }

  const byTool = new Map<string, ToolSyncedCounts>();
  for (const [assetId, entries] of Object.entries(distribution.index)) {
    const assetCategory = categoryOf.get(assetId);
    if (!assetCategory) continue; // 未入库资产不参与计数
    for (const entry of entries) {
      if (entry.status !== 'synced') continue;
      let tool = byTool.get(entry.toolId);
      if (!tool) {
        tool = { toolId: entry.toolId, byCategory: {}, total: 0 };
        byTool.set(entry.toolId, tool);
      }
      tool.total += 1;
      tool.byCategory[assetCategory] = (tool.byCategory[assetCategory] ?? 0) + 1;
    }
  }

  return {
    counts,
    toolSynced: Array.from(byTool.values()).sort((a, b) => b.total - a.total),
  };
}
