import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssetCard } from './AssetCard';
import { makeDistributionEntry } from '@/lib/test-factories';
import type { Asset } from '@/types/api';

/**
 * 资产卡的分发状态来源
 *
 * spec: asset-distribution-truth Scenario 1/9（圆点来自分发索引真值，空清单不写「未分发」）
 * 关联: fix-trust-and-consistency tasks I2
 */

const asset: Asset = {
  id: 'rules/safety.md',
  name: '示例规则',
  category: 'rule',
  hubPath: 'rules/safety.md',
  source: 'manual',
  lastModifiedAt: '2026-10-01T00:00:00.000Z',
  size: 128,
  distributions: [],
};

const noop = (): void => undefined;

describe('AssetCard 分发状态', () => {
  it('分发索引条目驱动圆点，而不是恒为空的 asset.distributions', () => {
    render(
      <AssetCard
        asset={asset}
        onView={noop}
        onEdit={noop}
        onDistribute={noop}
        distributions={[
          makeDistributionEntry({ toolId: 'trae-cn', toolName: 'TRAE 中国版' }),
          makeDistributionEntry({ toolId: 'codex', toolName: 'Codex', status: 'not_installed' }),
        ]}
      />,
    );

    expect(screen.getByTestId('distribution-dot-trae-cn')).toBeInTheDocument();
    expect(screen.getByTestId('distribution-dot-codex')).toBeInTheDocument();
    expect(screen.queryByText('未分发')).not.toBeInTheDocument();
  });

  it('没有条目时不渲染圆点，也不谎称「未分发」', () => {
    render(<AssetCard asset={asset} onView={noop} onEdit={noop} onDistribute={noop} distributions={[]} />);
    expect(screen.queryAllByTestId(/^distribution-dot-/)).toHaveLength(0);
    expect(screen.queryByText('未分发')).not.toBeInTheDocument();
  });

  it('尚无已同步工具时分发动作是主操作，已有同步后降为次操作', () => {
    const { rerender } = render(
      <AssetCard
        asset={asset}
        onView={noop}
        onEdit={noop}
        onDistribute={noop}
        distributions={[makeDistributionEntry({ toolId: 'codex', status: 'not_installed' })]}
      />,
    );
    const primary = screen.getByTestId('distribute-action');
    expect(primary.className).toContain('bg-primary');

    rerender(
      <AssetCard
        asset={asset}
        onView={noop}
        onEdit={noop}
        onDistribute={vi.fn()}
        distributions={[makeDistributionEntry({ toolId: 'trae-cn' })]}
      />,
    );
    expect(screen.getByTestId('distribute-action').className).not.toContain('bg-primary');
  });
});

/**
 * spec: memory-visible Scenario 5（旧目录内容仍可见，并标注来源为旧目录）
 * 关联: add-memory-category T11/T15 走查前补齐
 */
describe('AssetCard 旧目录标记', () => {
  const memoryAsset: Asset = {
    ...asset,
    id: 'memory/team-decisions.md',
    name: '团队决定',
    category: 'memory',
    hubPath: 'memory/team-decisions.md',
  };

  it('preferences/ 下的历史文件标注「旧目录」', () => {
    render(
      <AssetCard
        asset={{ ...memoryAsset, id: 'preferences/session_memory.md', hubPath: 'preferences/session_memory.md' }}
        onView={noop}
        onEdit={noop}
        onDistribute={noop}
        distributions={[]}
      />,
    );

    expect(screen.getByText('旧目录')).toBeInTheDocument();
  });

  it('memory/ 下的文件不标注旧目录', () => {
    render(<AssetCard asset={memoryAsset} onView={noop} onEdit={noop} onDistribute={noop} distributions={[]} />);

    expect(screen.queryByText('旧目录')).not.toBeInTheDocument();
  });
});
