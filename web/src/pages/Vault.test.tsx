import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Vault from './Vault';
import { api } from '@/lib/api';
import { makeCategoryDescriptor } from '@/lib/test-factories';
import type { Asset, SkillListResult } from '@/types/api';

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

describe('Vault 技能页容器高度（spec navigation-consolidation 长列表滚动中打开详情）', () => {
  const emptySkills: SkillListResult = {
    total: 0,
    items: [],
    countByFunction: {
      coding: 0, writing: 0, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 0, other: 0,
    },
    countByProvenance: { self: 0, marketplace: 0, plugin: 0, builtin: 0 },
    countByStatus: { in: 0, out: 0 },
    countByScope: { asset: 0, environment: 0 },
  };

  it('外部类别页容器不自拉伸（self-start），否则右侧详情面板没有 sticky 可粘滞空间', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(emptySkills);
    renderVault('/vault/skill');
    await screen.findByRole('heading', { level: 1, name: '技能' });
    const host = screen.getByTestId('external-view-host');
    expect(host.className).toContain('self-start');
  });
});

/**
 * spec: asset-center-consistency Scenario 1（后端声明源是唯一真相）
 * 关联: fix-trust-and-consistency tasks I1
 */
describe('Vault 类别清单以接口为准（I1）', () => {
  it('接口下发的 label 覆盖 fallback 常量', async () => {
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      declaredAt: '2026-10-26T00:00:00.000Z',
      categories: [makeCategoryDescriptor({ code: 'rule', label: '约定', order: 30 })],
    });

    renderVault('/vault/rule');

    await screen.findByRole('heading', { level: 1, name: '约定' });
    expect(screen.queryByRole('heading', { level: 1, name: '规则' })).not.toBeInTheDocument();
  });

  it('接口标为 external 的类别走专用视图，不打 /api/assets', async () => {
    const listAssets = vi.spyOn(api, 'listAssets');
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      declaredAt: '2026-10-26T00:00:00.000Z',
      categories: [makeCategoryDescriptor({ code: 'memory', label: '记忆', external: true, order: 70 })],
    });

    renderVault('/vault/memory');

    await screen.findByTestId('external-view-host');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listAssets).not.toHaveBeenCalled();
  });

  it('接口失败时不无限等清单：未知类别照常加载', async () => {
    const listAssets = vi.spyOn(api, 'listAssets');
    vi.spyOn(api, 'getAssetCategories').mockRejectedValue(new Error('network down'));

    renderVault('/vault/unknown-code');

    await waitFor(() => expect(listAssets).toHaveBeenCalled());
  });
});

/**
 * spec: asset-distribution-truth Scenario 8（判定失败必须诚实降级）
 * 关联: fix-trust-and-consistency tasks I2
 */
describe('Vault 分发索引降级提示（I2）', () => {
  const asset: Asset = {
    id: 'rules/safety.md',
    name: '示例规则',
    category: 'rule',
    hubPath: 'rules/safety.md',
    source: 'manual',
    lastModifiedAt: '2026-10-01T00:00:00.000Z',
    size: 100,
    distributions: [],
  };

  it('索引 partial 时页面出现一行「部分工具状态暂不可用」', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [asset], total: 1 });
    vi.spyOn(api, 'getDistributions').mockResolvedValue({
      generatedAt: '2026-10-26T00:00:00.000Z',
      cached: false,
      partial: true,
      failedTools: ['claude'],
      index: { 'rules/safety.md': [{ toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced' }] },
      projectTools: [],
    });

    renderVault('/vault/rule');

    await screen.findByText('部分工具状态暂不可用');
    // 失败工具不伪装成任何圆点，已有真值的工具照常渲染
    expect(screen.queryByTestId('distribution-dot-claude')).not.toBeInTheDocument();
    expect(screen.getByTestId('distribution-dot-trae-cn')).toBeInTheDocument();
  });

  it('索引完整时不出现降级提示', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [asset], total: 1 });
    vi.spyOn(api, 'getDistributions').mockResolvedValue({
      generatedAt: '2026-10-26T00:00:00.000Z',
      cached: false,
      partial: false,
      failedTools: [],
      index: {},
      projectTools: [],
    });

    renderVault('/vault/rule');

    await screen.findByText('示例规则');
    expect(screen.queryByText('部分工具状态暂不可用')).not.toBeInTheDocument();
  });
});
