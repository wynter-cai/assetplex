import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Vault from './Vault';
import { api } from '@/lib/api';
import type { Asset } from '@/types/api';

/**
 * 资产库类别页页头（spec refactor-design-system page-headers）：
 * 实测背景是资产库各页无 H1，只能靠侧栏高亮判断位置——现在每个类别页必须有类别名 H1。
 */
beforeEach(() => {
  vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [], total: 0 });
});

function renderVault(path: string): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vault" element={<Vault />} />
          <Route path="/vault/:category" element={<Vault />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Vault 类别页标准页头', () => {
  it('规则类别页呈现 H1「规则」', () => {
    renderVault('/vault/rule');
    expect(screen.getByRole('heading', { level: 1, name: '规则' })).toBeInTheDocument();
  });

  it('身份类别页呈现 H1「身份」', () => {
    renderVault('/vault/identity');
    expect(screen.getByRole('heading', { level: 1, name: '身份' })).toBeInTheDocument();
  });

  it('MCP 类别页呈现 H1「MCP」', () => {
    renderVault('/vault/mcp');
    expect(screen.getByRole('heading', { level: 1, name: 'MCP' })).toBeInTheDocument();
  });

  it('全部资产页呈现 H1「全部资产」', () => {
    renderVault('/vault');
    expect(screen.getByRole('heading', { level: 1, name: '全部资产' })).toBeInTheDocument();
  });
});

describe('Vault 类别导航单轨与详情 overlay（spec refactor-design-system navigation-consolidation）', () => {
  const asset: Asset = {
    id: 'a1',
    name: '示例规则',
    category: 'rule',
    hubPath: 'hub/rule/a1',
    source: 'manual',
    lastModifiedAt: '2026-10-01T00:00:00.000Z',
    size: 100,
    distributions: [],
  };

  beforeEach(() => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [asset], total: 1 });
    vi.spyOn(api, 'getAsset').mockResolvedValue({ ...asset, content: '# 示例' });
  });

  it('页内无重复类别栏（类别导航单轨，仅全局侧栏一处）', () => {
    renderVault('/vault/rule');
    expect(screen.queryByRole('button', { name: /全部资产/ })).not.toBeInTheDocument();
  });

  it('详情打开时列表保持渲染，详情面板具备窄屏 overlay 钩子（fixed + lg:static）', async () => {
    renderVault('/vault/rule');
    fireEvent.click(await screen.findByText('示例规则'));
    const overlay = await screen.findByTestId('detail-overlay');
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('lg:static');
    // 列表不被详情替换（关闭可返回列表状态）
    expect(screen.getAllByText('示例规则').length).toBeGreaterThan(0);
  });
});
