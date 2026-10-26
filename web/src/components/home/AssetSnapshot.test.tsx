import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetSnapshot } from './AssetSnapshot';
import { api } from '@/lib/api';
import type { AssetCategoryDescriptor } from '@/types/api';

/**
 * 首页资产快照的类别清单来源测试
 *
 * spec: asset-center-consistency Scenario 1（后端加类别，首页快照自动跟随）
 * 关联: fix-trust-and-consistency tasks I1
 */

function descriptor(overrides: Partial<AssetCategoryDescriptor> & { code: string }): AssetCategoryDescriptor {
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

function renderSnapshot(assetStats: Record<string, number>): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AssetSnapshot assetStats={assetStats} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetSnapshot 类别清单来源', () => {
  it('接口新增类别后快照格子自动多出一项，总数按接口清单累加（I1）', async () => {
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      declaredAt: '2026-10-26T00:00:00.000Z',
      categories: [
        descriptor({ code: 'identity', label: '身份', order: 10 }),
        descriptor({ code: 'memory', label: '记忆', order: 70 }),
      ],
    });

    renderSnapshot({ identity: 1, memory: 3, skill: 32 });

    await waitFor(() => expect(screen.getByText('记忆')).toBeInTheDocument());
    // memory 是接口类别 → 计入；skill 不在接口清单 → 不渲染格子，也不计入总数
    expect(screen.queryByText('技能')).not.toBeInTheDocument();
    expect(screen.getByText('共 4 项')).toBeInTheDocument();
  });

  it('接口失败时回退 fallback 清单，快照不空白（I1）', async () => {
    vi.spyOn(api, 'getAssetCategories').mockRejectedValue(new Error('network down'));

    renderSnapshot({ rule: 2 });

    await waitFor(() => expect(screen.getByText('规则')).toBeInTheDocument());
    expect(screen.getByText('共 2 项')).toBeInTheDocument();
  });
});
