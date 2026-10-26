/**
 * 资产类别清单：fallback + 接口覆盖
 *
 * spec: asset-center-consistency（Scenario 1 新增类别只改一处）
 * 关联: fix-trust-and-consistency tasks I1
 *
 * 侧栏子项、首页资产快照、资产库筛选、连接页分组都必须走这里，
 * 不再直接读常量清单——否则后端新增类别时界面不会跟着变。
 */

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  FALLBACK_ASSET_CATEGORIES,
  type AssetCategoryConfig,
} from '@/config/asset-categories';
import type { AssetCategoryDescriptor } from '@/types/api';

/** 类别清单几乎不变，5 分钟内复用缓存 */
const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 合并接口清单与 fallback
 *
 * 接口缺席（首屏 / 请求失败）或返回空清单时一律回退 fallback：
 * 空清单意味着声明源异常，拿它渲染会把整个资产导航清空。
 */
export function mergeCategories(remote?: AssetCategoryDescriptor[]): AssetCategoryConfig[] {
  if (!remote || remote.length === 0) return FALLBACK_ASSET_CATEGORIES;
  return [...remote]
    .sort((a, b) => a.order - b.order)
    .map((descriptor) => ({
      ...descriptor,
      icon: CATEGORY_ICONS[descriptor.code] ?? DEFAULT_CATEGORY_ICON,
    }));
}

export interface AssetCategoriesView {
  categories: AssetCategoryConfig[];
  /** 当前清单来源：接口已覆盖 / 仍是 fallback */
  source: 'remote' | 'fallback';
  /** 请求在途：调用方需要骨架屏时用 */
  isFetching: boolean;
  /** 请求已失败：调用方据此判定「拿不到接口清单」已成定局，不必再等 */
  isError: boolean;
  declaredAt?: string;
}

export function useAssetCategories(): AssetCategoriesView {
  const query = useQuery({
    queryKey: ['asset-categories'],
    queryFn: api.getAssetCategories,
    staleTime: STALE_TIME_MS,
  });
  const remote = query.data?.categories;
  const covered = Array.isArray(remote) && remote.length > 0;

  return {
    categories: mergeCategories(remote),
    source: covered ? 'remote' : 'fallback',
    isFetching: query.isFetching,
    isError: query.isError,
    declaredAt: query.data?.declaredAt,
  };
}

/** 按 code 查类别（接口清单优先，查不到回退 fallback） */
export function pickCategory(
  categories: AssetCategoryConfig[],
  code: string,
): AssetCategoryConfig | undefined {
  return (
    categories.find((category) => category.code === code) ??
    FALLBACK_ASSET_CATEGORIES.find((category) => category.code === code)
  );
}
