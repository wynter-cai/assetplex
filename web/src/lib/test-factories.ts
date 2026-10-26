/**
 * 测试夹具：接口下发的资产类别
 *
 * `AssetCategoryDescriptor` 八个字段全必填，各组件测试都在本地重抄一遍默认值；
 * 收敛到这里，测试只覆盖自己关心的字段（中性示例名，不含本机真实目录）。
 */

import type { AssetCategoryDescriptor, AssetDistributionInfo } from '@/types/api';

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
