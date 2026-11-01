/**
 * FileItem 类别徽章测试（add-memory-category T10）
 *
 * 契约：徽章的图标与中文名一律来自后端声明源（`GET /api/asset-categories`），
 * 组件里不再保留本地映射——否则后端新增类别时这里必然显示成英文 code
 * （spec memory-visible Scenario 1、asset-center-consistency Scenario 1）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileItem } from './FileItem';
import { api } from '@/lib/api';
import type { AssetCategoryDescriptor, DiscoveredItem } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    getAssetCategories: vi.fn(),
  },
}));

function descriptor(over: Partial<AssetCategoryDescriptor> = {}): AssetCategoryDescriptor {
  return {
    code: 'rule',
    label: '规则',
    description: '规则描述',
    hubDir: 'rules',
    external: false,
    syncable: true,
    doctorSupported: true,
    order: 30,
    ...over,
  };
}

function makeItem(over: Partial<DiscoveredItem> = {}): DiscoveredItem {
  return {
    absolutePath: 'd:/demo/toolA/rules/a.md',
    relativePath: 'a.md',
    size: 100,
    modified: '2026-10-01T00:00:00.000Z',
    category: 'rule',
    hubTargetPath: 'rules/a.md',
    conflict: 'none',
    tool: 'trae-cn',
    ...over,
  };
}

function renderItem(item: DiscoveredItem): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FileItem item={item} selected={false} onToggle={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getAssetCategories).mockReset();
});

describe('FileItem 类别徽章跟随声明源', () => {
  it('记忆类别显示声明源里的中文名「记忆」', async () => {
    vi.mocked(api.getAssetCategories).mockResolvedValue({
      categories: [descriptor(), descriptor({ code: 'memory', label: '记忆', hubDir: 'memory', order: 55 })],
      declaredAt: '2026-10-29',
    });
    renderItem(makeItem({ category: 'memory', hubTargetPath: 'memory/session.md' }));

    expect(await screen.findByText('记忆')).toBeDefined();
    expect(screen.queryByText('memory')).toBeNull();
  });

  it('接口下发 fallback 里没有的类别时按接口中文名显示（守护：组件不得再写死映射）', async () => {
    vi.mocked(api.getAssetCategories).mockResolvedValue({
      categories: [descriptor({ code: 'prompt-pack', label: '提示包', hubDir: 'prompt-packs', order: 70 })],
      declaredAt: '2026-10-29',
    });
    renderItem(makeItem({ category: 'prompt-pack' as DiscoveredItem['category'] }));

    expect(await screen.findByText('提示包')).toBeDefined();
  });

  it('接口失败时回退 fallback 清单，既有类别仍显示中文名', async () => {
    vi.mocked(api.getAssetCategories).mockRejectedValue(new Error('boom'));
    renderItem(makeItem({ category: 'rule' }));

    expect(await screen.findByText('规则')).toBeDefined();
  });

  it('清单里查不到的类别回退显示原始 code，不渲染空白徽章', async () => {
    vi.mocked(api.getAssetCategories).mockResolvedValue({
      categories: [descriptor()],
      declaredAt: '2026-10-29',
    });
    renderItem(makeItem({ category: 'unknown-code' as DiscoveredItem['category'] }));

    expect(await screen.findByText('unknown-code')).toBeDefined();
  });
});
