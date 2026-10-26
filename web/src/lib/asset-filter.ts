/**
 * 「全部资产」的筛选与分页口径（纯函数，无 React 依赖）
 *
 * spec: asset-center-consistency Scenario 6 —— 类别筛选 + 同步状态筛选 + 50 项/页，
 * 切换筛选后回到第 1 页。
 * 关联: fix-trust-and-consistency tasks I3
 *
 * 状态维度只认分发索引（GET /api/distributions）：索引里没有条目的资产不参与任何
 * 状态筛选结果的匹配——「状态未知」不是「未同步」，不能被任意一档筛选项捞进来。
 */

import type { Asset, AssetDistributionInfo, AssetSyncStatus } from '@/types/api';

/** 每页项数（spec Scenario 6 定为 50） */
export const ASSET_PAGE_SIZE = 50;

/** 下拉里「不限」这一档的取值 */
export const ALL_FILTER_VALUE = 'all';

export interface AssetFilter {
  /** 类别代码，`all` 表示不限 */
  category: string;
  /** 同步状态，`all` 表示不限 */
  status: AssetSyncStatus | typeof ALL_FILTER_VALUE;
}

/** 两维都不限的初始筛选 */
export const DEFAULT_ASSET_FILTER: AssetFilter = { category: ALL_FILTER_VALUE, status: ALL_FILTER_VALUE };

/** 任一维度不再是「不限」 */
export function isAssetFilterActive(filter: AssetFilter): boolean {
  return filter.category !== ALL_FILTER_VALUE || filter.status !== ALL_FILTER_VALUE;
}

/** 类别下拉的一项（label 来自声明源，认不出时用代码本身） */
export interface AssetCategoryOption {
  code: string;
  label: string;
}

/**
 * 类别筛选选项：只列当前列表里真正出现的类别
 *
 * 不按 `external` 排除：`/api/assets` 会把库内技能一起返回来，下拉里却没有「技能」
 * 就是一处新谎（实测 37 项里技能占 32）；反过来只走专用接口的类别（如裁决准则）
 * 从来不会出现在这个列表里，也就不会进选项。
 */
export function categoryOptionsFor(
  assets: Asset[],
  declared: Array<{ code: string; label: string; order: number }>,
): AssetCategoryOption[] {
  const present = Array.from(new Set(assets.map((asset) => asset.category)));
  return present
    .map((code) => {
      const found = declared.find((descriptor) => descriptor.code === code);
      return { code, label: found?.label ?? code, order: found?.order ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ code, label }) => ({ code, label }));
}

/** 资产是否命中当前筛选：类别按库内类别，状态按分发索引里任一条目 */
function matches(asset: Asset, index: Record<string, AssetDistributionInfo[]>, filter: AssetFilter): boolean {
  if (filter.category !== ALL_FILTER_VALUE && asset.category !== filter.category) return false;
  if (filter.status === ALL_FILTER_VALUE) return true;
  return (index[asset.id] ?? []).some((entry) => entry.status === filter.status);
}

export function filterAssets(
  assets: Asset[],
  index: Record<string, AssetDistributionInfo[]>,
  filter: AssetFilter,
): Asset[] {
  return assets.filter((asset) => matches(asset, index, filter));
}

export interface PagedResult<T> {
  items: T[];
  /** 钳制后的当前页（从 1 起） */
  page: number;
  totalPages: number;
  total: number;
  /** 本页首项在全量中的序号（1 起，空列表为 0） */
  rangeStart: number;
  rangeEnd: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number = ASSET_PAGE_SIZE): PagedResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);

  return {
    items: slice,
    page: safePage,
    totalPages,
    total,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: start + slice.length,
  };
}

/**
 * 筛选指纹：类别、状态、搜索、URL 锁定类别任一变化都会产生新值
 *
 * 列表据此把页码归 1（Scenario 6「切换筛选后回到第 1 页」），翻页不会误触发。
 */
export function filterKey(filter: AssetFilter, search: string, lockedCategory: string | null): string {
  return [lockedCategory ?? '', filter.category, filter.status, search].join('|');
}
