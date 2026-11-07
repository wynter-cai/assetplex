import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { AssetCard } from './AssetCard';
import { AssetFilterBar } from './AssetFilterBar';
import {
  ALL_FILTER_VALUE,
  DEFAULT_ASSET_FILTER,
  filterAssets,
  filterKey,
  isAssetFilterActive,
  paginate,
} from '@/lib/asset-filter';
import type { AssetCategoryOption, AssetFilter } from '@/lib/asset-filter';
import { distributionsFor } from '@/lib/use-distributions';
import type { DistributionsView } from '@/lib/use-distributions';
import type { Asset } from '@/types/api';

interface AssetListPanelProps {
  /** 已按 URL 类别与搜索取回的库内资产（分页与状态筛选在这里完成） */
  assets: Asset[];
  categoryOptions: AssetCategoryOption[];
  /** URL 锁定的类别；非空时不再提供类别下拉 */
  lockedCategory: string | null;
  /** 锁定类别的中文名（取声明源）；空态文案据此说出「我的库里还没有记忆」这类具体话 */
  lockedCategoryLabel?: string;
  search: string;
  distributions: DistributionsView;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  selectedAssetId: string | null;
  detailOpen: boolean;
  onView: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDistribute: (asset: Asset) => void;
  /** 空态主动作：去收藏页 */
  onCollect: () => void;
}

const GRID_CLASS = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]';

/** 居中的状态区块（空态 / 无匹配结果共用骨架） */
function StateBlock({
  icon,
  title,
  children,
}: {
  icon: JSX.Element;
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-muted-foreground">{icon}</div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      {children}
    </div>
  );
}

/** 分页行：仅多于一页时出现 */
function PaginationRow({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}): JSX.Element | null {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2" data-testid="asset-pagination">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        上一页
      </Button>
      <span className="text-xs text-muted-foreground">
        第 {page} / {totalPages} 页
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        下一页
      </Button>
    </div>
  );
}

/**
 * 资产列表区：筛选、分页、空态与失败态
 *
 * spec: asset-center-consistency Scenario 6（类别 + 同步状态筛选、50 项/页、切换筛选回第 1 页）
 *   + Scenario 8（空态一个主动作；失败态给重试，不给「共 0 项」）
 */
export function AssetListPanel({
  assets,
  categoryOptions,
  lockedCategory,
  lockedCategoryLabel,
  search,
  distributions,
  isLoading,
  error,
  onRetry,
  onSearchChange,
  selectedAssetId,
  detailOpen,
  onView,
  onEdit,
  onDistribute,
  onCollect,
}: AssetListPanelProps): JSX.Element {
  const [filter, setFilter] = useState<AssetFilter>(DEFAULT_ASSET_FILTER);
  // URL 已锁定类别时，类别维度由接口负责，页内不再叠一层同类筛选
  const effectiveFilter: AssetFilter = lockedCategory
    ? { ...filter, category: ALL_FILTER_VALUE }
    : filter;
  const key = filterKey(effectiveFilter, search, lockedCategory);
  // 页码与筛选指纹同行：指纹变了就当第 1 页处理，无需 effect，翻页也不会被误判
  const [paging, setPaging] = useState<{ key: string; page: number }>({ key, page: 1 });
  const page = paging.key === key ? paging.page : 1;

  const filtered = useMemo(
    () => filterAssets(assets, distributions.index, effectiveFilter),
    [assets, distributions.index, effectiveFilter.category, effectiveFilter.status],
  );
  const paged = paginate(filtered, page);
  const filterActive = isAssetFilterActive(effectiveFilter);

  if (error) return <ErrorState onRetry={onRetry} />;

  if (isLoading) {
    return (
      <div className={GRID_CLASS}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-md" />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    if (search) {
      return (
        <StateBlock icon={<Search className="h-12 w-12" />} title="未找到匹配的资产">
          <p className="text-sm text-muted-foreground mb-4">试试其他关键词</p>
          <Button variant="outline" size="sm" onClick={() => onSearchChange('')}>
            清除搜索
          </Button>
        </StateBlock>
      );
    }
    // 类别页空态说具体话（memory-visible Scenario 3）：说清缺哪类，出口仍只有一个
    const scopedLabel = lockedCategory ? lockedCategoryLabel : undefined;
    return (
      <StateBlock
        icon={<Package className="h-12 w-12" />}
        title={scopedLabel ? `我的库里还没有${scopedLabel}` : '还没有资产'}
      >
        <p className="text-sm text-muted-foreground mb-4">
          {scopedLabel
            ? `从已安装的工具里把${scopedLabel}收藏进我的库，换工具也能带走`
            : '从已安装的工具里把资产收藏进我的库'}
        </p>
        <Button size="sm" onClick={onCollect}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {scopedLabel ? `从已安装的工具收藏${scopedLabel}` : '从工具收藏到我的库'}
        </Button>
      </StateBlock>
    );
  }

  return (
    <div className="min-w-0">
      <AssetFilterBar
        categoryOptions={categoryOptions}
        showCategoryFilter={lockedCategory === null}
        filter={effectiveFilter}
        search={search}
        showClearFilter={filterActive && paged.items.length > 0}
        onFilterChange={setFilter}
        onSearchChange={onSearchChange}
        onClearFilter={() => setFilter(DEFAULT_ASSET_FILTER)}
      />

      {/* 索引降级：失败的工具在索引里没有条目，也不拿它名字冒充状态，只给一句诚实提示（Scenario 8） */}
      {distributions.partial && (
        <p className="text-xs text-warning mb-2" data-testid="distributions-partial-hint">
          部分工具状态暂不可用
        </p>
      )}

      {/* 结果数变化可被屏幕阅读器播报（enhance-a11y-responsive T8，keyboard Scenario 8，拍板点 C） */}
      <p
        className="text-xs text-muted-foreground mb-2"
        data-testid="asset-count"
        role="status"
        aria-live="polite"
      >
        共 {filtered.length} 项资产
      </p>

      {paged.items.length === 0 ? (
        <StateBlock icon={<Search className="h-12 w-12" />} title="没有符合筛选条件的资产">
          <p className="text-sm text-muted-foreground mb-4">换个类别或换个同步状态试试</p>
          <Button variant="outline" size="sm" onClick={() => setFilter(DEFAULT_ASSET_FILTER)}>
            清除筛选
          </Button>
        </StateBlock>
      ) : (
        <>
          <div className={GRID_CLASS}>
            {paged.items.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                distributions={distributionsFor(distributions, asset.id)}
                active={selectedAssetId === asset.id && detailOpen}
                onView={onView}
                onEdit={onEdit}
                onDistribute={onDistribute}
              />
            ))}
          </div>
          <PaginationRow page={paged.page} totalPages={paged.totalPages} onPageChange={(p) => setPaging({ key, page: p })} />
        </>
      )}
    </div>
  );
}
