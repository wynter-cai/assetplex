import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Vault from './Vault';
import { api } from '@/lib/api';

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
