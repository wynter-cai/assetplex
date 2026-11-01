import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DistributionDialog } from './DistributionDialog';
import { makeDistributionEntry } from '@/lib/test-factories';
import { api } from '@/lib/api';
import type { Asset, AssetDistributionInfo, SwapCategorySupport, SwapToolCandidate, ToolStatus } from '@/types/api';

/**
 * 分发管理弹窗的状态来源
 *
 * spec: asset-distribution-truth Scenario 1/3/8（状态来自分发索引；缺失条目不编造状态；
 *   `pending` 全站统一叫「待同步」）
 * 关联: fix-trust-and-consistency tasks I2
 *   + add-memory-category T12（不支持记忆的工具显示原因并禁用，memory-visible Scenario 6）
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

/** 六类支持矩阵：memory 之外的类别一律支持，memory 由参数决定 */
function candidate(name: string, memory: SwapCategorySupport): SwapToolCandidate {
  const supported: SwapCategorySupport = { supported: true };
  return {
    name,
    displayName: name,
    installed: true,
    projectLevel: false,
    supportMatrix: {
      identity: supported,
      rule: supported,
      skill: supported,
      mcp: supported,
      agent: supported,
      memory,
    },
  };
}

interface DialogOptions {
  asset?: Asset;
  /** 支持矩阵候选；不传 = 矩阵拿不到（接口失败/未落地） */
  swapTools?: SwapToolCandidate[];
}

function renderDialog(distributions: AssetDistributionInfo[], options: DialogOptions = {}): void {
  vi.spyOn(api, 'getTools').mockResolvedValue({
    tools: [tool('trae-cn', true), tool('codex', true), tool('ghost', false)],
  });
  vi.spyOn(api, 'getSwapTools').mockResolvedValue({ tools: options.swapTools ?? [] });
  vi.spyOn(api, 'getAssetCategories').mockResolvedValue({ categories: [], declaredAt: '2026-10-29' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DistributionDialog
        asset={options.asset ?? asset}
        open
        onOpenChange={vi.fn()}
        distributions={distributions}
      />
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

/**
 * spec: memory-visible Scenario 6（同步能力如实呈现）
 * 关联: add-memory-category tasks T12
 */
describe('DistributionDialog 类别支持矩阵', () => {
  const memoryAsset: Asset = {
    ...asset,
    id: 'memory/session.md',
    name: '会话记忆',
    category: 'memory',
    hubPath: 'memory/session.md',
  };

  it('不支持记忆的工具：该行说明具体原因并禁用开关', async () => {
    renderDialog([], {
      asset: memoryAsset,
      swapTools: [
        candidate('trae-cn', { supported: true }),
        candidate('codex', { supported: false, reason: '此工具不支持memory类别，已跳过' }),
      ],
    });

    expect(await screen.findByText('此工具不支持记忆类别，无法同步')).toBeInTheDocument();
    const switches = screen.getAllByRole('switch');
    // 行序 = tools 接口顺序（trae-cn / codex / ghost）
    expect(switches[0]).not.toBeDisabled();
    expect(switches[1]).toBeDisabled();
  });

  it('矩阵拿不到时不编造「不支持」，只按安装状态禁用', async () => {
    renderDialog([], { asset: memoryAsset, swapTools: [] });

    await screen.findByText('会话记忆');
    expect(screen.queryByText(/不支持记忆类别/)).not.toBeInTheDocument();
    const switches = await screen.findAllByRole('switch');
    expect(switches[0]).not.toBeDisabled();
    expect(switches[1]).not.toBeDisabled();
  });
});
