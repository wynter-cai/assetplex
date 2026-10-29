/**
 * 资产类别清单「fallback + 接口覆盖」测试
 *
 * spec: asset-center-consistency（Scenario 1 新增类别只改一处）
 * 关联: fix-trust-and-consistency tasks I1
 *
 * 唯一声明源在后端；前端只保留同名字段的 fallback。
 * 接口可用 → 以接口为准；接口不可用 → 回退 fallback，不白屏不报错。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mergeCategories, useAssetCategories } from './use-asset-categories';
import { FALLBACK_ASSET_CATEGORIES, CATEGORY_ICONS, DEFAULT_CATEGORY_ICON } from '@/config/asset-categories';
import { api } from '@/lib/api';
import type { AssetCategoryDescriptor } from '@/types/api';

/** 造接口类别（只关心被覆盖的字段） */
function descriptor(overrides: Partial<AssetCategoryDescriptor> & { code: string }): AssetCategoryDescriptor {
  return {
    label: `${overrides.code} 标签`,
    description: '来自接口的描述',
    hubDir: overrides.code,
    external: false,
    syncable: true,
    doctorSupported: true,
    order: 500,
    ...overrides,
  };
}

function wrapper(): ({ children }: { children: ReactNode }) => JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mergeCategories', () => {
  it('接口缺席或返回空清单时回退 fallback（空清单不采信）', () => {
    expect(mergeCategories(undefined)).toEqual(FALLBACK_ASSET_CATEGORIES);
    expect(mergeCategories([])).toEqual(FALLBACK_ASSET_CATEGORIES);
  });

  it('接口字段覆盖 fallback，并按接口 order 重排', () => {
    const merged = mergeCategories([
      descriptor({ code: 'rule', label: '规则们', order: 10 }),
      descriptor({ code: 'identity', label: '身份', order: 20 }),
    ]);
    expect(merged.map((c) => c.code)).toEqual(['rule', 'identity']);
    expect(merged[0].label).toBe('规则们');
    expect(merged[0].description).toBe('来自接口的描述');
  });

  it('接口新增类别自动出现，未知 code 用默认图标', () => {
    const merged = mergeCategories([
      ...FALLBACK_ASSET_CATEGORIES.map((c) => descriptor({ code: c.code, label: c.label, order: c.order })),
      descriptor({ code: 'plugin', label: '插件', order: 70 }),
    ]);
    const added = merged.find((c) => c.code === 'plugin');
    expect(added?.label).toBe('插件');
    // lucide 图标是 forwardRef 对象，不能按 typeof === 'function' 断言
    expect(added?.icon).toBe(DEFAULT_CATEGORY_ICON);
  });

  it('已知 code 用自己的图标，未知 code 才降级到默认图标', () => {
    const merged = mergeCategories([
      descriptor({ code: 'skill', order: 10 }),
      descriptor({ code: 'memory', order: 20 }),
      descriptor({ code: 'weird-code', order: 30 }),
    ]);
    expect(merged.find((c) => c.code === 'skill')?.icon).toBe(CATEGORY_ICONS.skill);
    expect(merged.find((c) => c.code === 'memory')?.icon).toBe(CATEGORY_ICONS.memory);
    expect(merged.find((c) => c.code === 'weird-code')?.icon).toBe(DEFAULT_CATEGORY_ICON);
  });
});

describe('useAssetCategories', () => {
  it('接口可用时返回接口清单', async () => {
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      categories: [descriptor({ code: 'rule', label: '规则', order: 10 })],
      declaredAt: '2026-10-25',
    });
    const { result } = renderHook(() => useAssetCategories(), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.categories.map((c) => c.code)).toEqual(['rule']);
    });
    expect(result.current.source).toBe('remote');
  });

  it('接口不可用时回退 fallback，不抛错也不白屏', async () => {
    vi.spyOn(api, 'getAssetCategories').mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useAssetCategories(), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(result.current.categories).toEqual(FALLBACK_ASSET_CATEGORIES);
    expect(result.current.source).toBe('fallback');
    // isError 供调用方判定「拿不到清单已成定局」：未知类别不该无限等下去
    expect(result.current.isError).toBe(true);
  });
});
