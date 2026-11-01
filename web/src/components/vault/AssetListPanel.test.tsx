import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetListPanel } from './AssetListPanel';
import { FALLBACK_ASSET_CATEGORIES } from '@/config/asset-categories';
import { categoryOptionsFor } from '@/lib/asset-filter';
import { makeAsset, makeDistributionsView } from '@/lib/test-factories';
import type { Asset, AssetDistributionInfo } from '@/types/api';

/**
 * 资产列表区：筛选、分页、空态与失败态
 *
 * spec: asset-center-consistency Scenario 6（可筛选、可分页、数量实时可见）
 *   + Scenario 8（空态只给一个主动作；失败态不显示「共 0 项」）
 * 关联: fix-trust-and-consistency tasks I3
 */

const mixedAssets: Asset[] = [
  makeAsset({ id: 'rules/a.md', name: '规则A', category: 'rule' }),
  makeAsset({ id: 'rules/b.md', name: '规则B', category: 'rule' }),
  // 名字不叫「身份」：否则与类别下拉里的 option 文本同字，queryByText 会打到下拉选项上
  makeAsset({ id: 'identity/me.md', name: '我的人设', category: 'identity' }),
];

function distIndex(entries: Array<{ id: string; toolId: string; status: AssetDistributionInfo['status'] }>): Record<string, AssetDistributionInfo[]> {
  const index: Record<string, AssetDistributionInfo[]> = {};
  for (const e of entries) {
    index[e.id] = [...(index[e.id] ?? []), { toolId: e.toolId, toolName: e.toolId, status: e.status }];
  }
  return index;
}

interface PanelOptions {
  assets?: Asset[];
  distributions?: Record<string, AssetDistributionInfo[]>;
  partial?: boolean;
  lockedCategory?: string | null;
  lockedCategoryLabel?: string;
  error?: Error | null;
  isLoading?: boolean;
}

function renderPanel(options: PanelOptions = {}): void {
  const assets = options.assets ?? mixedAssets;
  // 与真调用方一致：选项由当前列表里的类别派生，不拿常量清单直接铺
  const categoryOptions = categoryOptionsFor(assets, FALLBACK_ASSET_CATEGORIES);
  render(
    <AssetListPanel
      assets={assets}
      categoryOptions={categoryOptions}
      lockedCategory={options.lockedCategory ?? null}
      lockedCategoryLabel={options.lockedCategoryLabel}
      search=""
      onSearchChange={vi.fn()}
      distributions={makeDistributionsView({ index: options.distributions ?? {}, partial: options.partial ?? false })}
      isLoading={options.isLoading ?? false}
      error={options.error ?? null}
      onRetry={vi.fn()}
      selectedAssetId={null}
      detailOpen={false}
      onView={vi.fn()}
      onEdit={vi.fn()}
      onDistribute={vi.fn()}
      onCollect={vi.fn()}
    />,
  );
}

/** 卡片整卡是 role=button + aria-label「查看 X 详情」，据此数卡片 */
function cardCount(): number {
  return screen.getAllByRole('button', { name: /详情$/ }).length;
}

describe('AssetListPanel 筛选', () => {
  it('类别筛选后数量实时可见，卡片同步收敛', () => {
    renderPanel();

    expect(screen.getByText('共 3 项资产')).toBeInTheDocument();
    expect(cardCount()).toBe(3);

    fireEvent.change(screen.getByLabelText('按类别筛选'), { target: { value: 'rule' } });

    expect(screen.getByText('共 2 项资产')).toBeInTheDocument();
    expect(cardCount()).toBe(2);
    expect(screen.queryByText('我的人设')).not.toBeInTheDocument();
  });

  it('同步状态筛选按分发索引判定，没有条目的资产不入选', () => {
    renderPanel({
      distributions: distIndex([
        { id: 'rules/a.md', toolId: 'trae-cn', status: 'synced' },
        { id: 'rules/b.md', toolId: 'trae-cn', status: 'pending' },
      ]),
    });

    fireEvent.change(screen.getByLabelText('按同步状态筛选'), { target: { value: 'synced' } });

    expect(screen.getByText('共 1 项资产')).toBeInTheDocument();
    expect(screen.getByText('规则A')).toBeInTheDocument();
    expect(screen.queryByText('规则B')).not.toBeInTheDocument();
  });

  it('URL 已锁定类别时不再给类别筛选（切换类别只有侧栏一处）', () => {
    renderPanel({ lockedCategory: 'rule' });

    expect(screen.queryByLabelText('按类别筛选')).not.toBeInTheDocument();
    expect(screen.getByLabelText('按同步状态筛选')).toBeInTheDocument();
  });

  it('筛选后一条不剩时说明原因并给出清除筛选，不谎称库是空的', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('按同步状态筛选'), { target: { value: 'conflict' } });

    expect(screen.getByText('没有符合筛选条件的资产')).toBeInTheDocument();
    expect(screen.queryByText('还没有资产')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getByText('共 3 项资产')).toBeInTheDocument();
  });
});

describe('AssetListPanel 分页', () => {
  const many = Array.from({ length: 120 }, (_, i) => makeAsset({ id: `rules/r${i}.md`, name: `规则${i}` }));

  it('120 项按 50 项/页分：首屏 50 张卡片，下一页换人，末页只剩余数', () => {
    renderPanel({ assets: many });

    expect(screen.getByText('共 120 项资产')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument();
    expect(cardCount()).toBe(50);
    expect(screen.getByText('规则0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument();
    expect(screen.getByText('规则50')).toBeInTheDocument();
    expect(screen.queryByText('规则0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('第 3 / 3 页')).toBeInTheDocument();
    expect(cardCount()).toBe(20);
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('翻页到第 2 页后切换筛选，回到第 1 页', () => {
    renderPanel({ assets: many });

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('按类别筛选'), { target: { value: 'rule' } });

    expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument();
    expect(cardCount()).toBe(50);
    expect(screen.getByText('规则0')).toBeInTheDocument();
  });

  it('不满一页时不出现分页控件', () => {
    renderPanel();

    expect(screen.queryByText(/第 \d+ \/ \d+ 页/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument();
  });
});

/**
 * spec: asset-center-consistency Scenario 8
 */
describe('AssetListPanel 空态与失败态', () => {
  it('库为空时说明「还没有资产」，只给一个主动作：从工具收藏到我的库', () => {
    renderPanel({ assets: [] });

    expect(screen.getByText('还没有资产')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从工具收藏到我的库' })).toBeInTheDocument();
    // 唯一主动作：空态区域不得再并列第二个按钮
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/共 \d+ 项资产/)).not.toBeInTheDocument();
  });

  it('请求失败时给出错误与重试，不显示「共 0 项」', () => {
    renderPanel({ error: new Error('boom') });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 项资产/)).not.toBeInTheDocument();
    expect(screen.queryByText('还没有资产')).not.toBeInTheDocument();
  });

  it('加载中用骨架屏占位，不提前报空库', () => {
    renderPanel({ assets: [], isLoading: true });

    expect(screen.queryByText('还没有资产')).not.toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 项资产/)).not.toBeInTheDocument();
  });

  it('索引降级时在列表上方给一句诚实提示', () => {
    renderPanel({ partial: true });

    expect(screen.getByText('部分工具状态暂不可用')).toBeInTheDocument();
  });
});

/**
 * spec: memory-visible Scenario 3（空态给唯一出口）+ Scenario 9（不回归）
 * 关联: add-memory-category tasks T11
 */
describe('AssetListPanel 类别页空态与失败态', () => {
  it('记忆类别页空态：文案说明库里没有记忆，唯一动作是从工具收藏记忆', () => {
    renderPanel({ assets: [], lockedCategory: 'memory', lockedCategoryLabel: '记忆' });

    expect(screen.getByText('我的库里还没有记忆')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从已安装的工具收藏记忆' })).toBeInTheDocument();
    // 唯一主动作：空态区域不得并列第二个按钮，也不谎称「共 0 项」
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/共 \d+ 项资产/)).not.toBeInTheDocument();
  });

  it('记忆类别页请求失败：给错误与重试，不显示空态文案与假计数', () => {
    renderPanel({ assets: [], lockedCategory: 'memory', lockedCategoryLabel: '记忆', error: new Error('boom') });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.queryByText('我的库里还没有记忆')).not.toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 项资产/)).not.toBeInTheDocument();
  });

  it('未锁定类别的空态文案不回归', () => {
    renderPanel({ assets: [] });

    expect(screen.getByText('还没有资产')).toBeInTheDocument();
    expect(screen.queryByText(/我的库里还没有/)).not.toBeInTheDocument();
  });
});
