/**
 * 测试夹具：接口下发的资产类别
 *
 * `AssetCategoryDescriptor` 八个字段全必填，各组件测试都在本地重抄一遍默认值；
 * 收敛到这里，测试只覆盖自己关心的字段（中性示例名，不含本机真实目录）。
 */

import type { Asset, AssetCategoryDescriptor, AssetDistributionInfo } from '@/types/api';
import type { DistributionsView } from './use-distributions';

export function makeCategoryDescriptor(
  overrides: Partial<AssetCategoryDescriptor> & { code: string },
): AssetCategoryDescriptor {
  return {
    label: overrides.code,
    description: '接口下发的类别',
    hubDir: overrides.code,
    external: false,
    syncable: true,
    doctorSupported: true,
    order: 10,
    ...overrides,
  };
}

/** 造分发索引条目（工具名默认与 id 同名，只关心状态时少写两行） */
export function makeDistributionEntry(
  overrides: Partial<AssetDistributionInfo> & { toolId: string },
): AssetDistributionInfo {
  return {
    toolName: overrides.toolId,
    status: 'synced',
    ...overrides,
  };
}

/**
 * 造库内资产（id 默认同时充当 name 与 hubPath，批量造分页数据时少写几行）
 *
 * `distributions` 留空数组是诚实的：状态真值在分发索引里，测试要状态就另造条目。
 */
export function makeAsset(
  overrides: Partial<Asset> & { id: string },
): Asset {
  return {
    name: overrides.id,
    category: 'rule',
    hubPath: overrides.id,
    source: 'manual',
    lastModifiedAt: '2026-10-01T00:00:00.000Z',
    size: 100,
    distributions: [],
    ...overrides,
  };
}

/** 造分发索引视图（只给 index 时视为完整、无降级） */
export function makeDistributionsView(
  overrides: Partial<DistributionsView> = {},
): DistributionsView {
  return {
    index: {},
    partial: false,
    failedTools: [],
    projectTools: [],
    isFetching: false,
    isError: false,
    refresh: async () => undefined,
    ...overrides,
  };
}
