import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DistributionDialog } from './DistributionDialog';
import { makeDistributionEntry } from '@/lib/test-factories';
import { api } from '@/lib/api';
import type { Asset, AssetDistributionInfo, ToolStatus } from '@/types/api';

/**
 * 分发管理弹窗的状态来源
 *
 * spec: asset-distribution-truth Scenario 1/3/8（状态来自分发索引；缺失条目不编造状态；
 *   `pending` 全站统一叫「待同步」）
 * 关联: fix-trust-and-consistency tasks I2
 */

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

function tool(name: string, installed: boolean): ToolStatus {
  return { name, installed, configDirExists: installed, configDir: 'demo' };
}

function renderDialog(distributions: AssetDistributionInfo[]): void {
  vi.spyOn(api, 'getTools').mockResolvedValue({
    tools: [tool('trae-cn', true), tool('codex', true), tool('ghost', false)],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DistributionDialog asset={asset} open onOpenChange={vi.fn()} distributions={distributions} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DistributionDialog 状态来源', () => {
  it('索引里的真值决定每个工具的状态文案', async () => {
    renderDialog([
      makeDistributionEntry({ toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced' }),
      makeDistributionEntry({ toolId: 'codex', toolName: 'Codex', status: 'pending' }),
    ]);

    expect(await screen.findByText('已同步')).toBeInTheDocument();
    // pending 统一叫「待同步」，不再出现旧文案「待更新」
    expect(screen.getByText('待同步')).toBeInTheDocument();
    expect(screen.queryByText('待更新')).not.toBeInTheDocument();
  });

  it('索引里没有条目的工具不编造状态，也不写「未同步」', async () => {
    renderDialog([makeDistributionEntry({ toolId: 'trae-cn', status: 'synced' })]);

    await screen.findByText('已同步');
    expect(screen.getByText('状态未知')).toBeInTheDocument();
    expect(screen.queryByText('未同步')).not.toBeInTheDocument();
  });

  it('未安装的工具照实说明，不靠索引', async () => {
    renderDialog([]);

    expect(await screen.findAllByText('未安装')).toHaveLength(1);
    expect(screen.queryByText('未分发')).not.toBeInTheDocument();
  });
});
