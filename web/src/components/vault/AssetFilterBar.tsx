import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DISTRIBUTION_STATUS } from './DistributionBadge';
import { ALL_FILTER_VALUE } from '@/lib/asset-filter';
import type { AssetCategoryOption, AssetFilter } from '@/lib/asset-filter';
import type { AssetSyncStatus } from '@/types/api';

interface AssetFilterBarProps {
  /** 可筛选的类别：只含当前列表里真正出现的类别（categoryOptionsFor 算出） */
  categoryOptions: AssetCategoryOption[];
  /** URL 已锁定类别时隐藏类别下拉：切换类别只有侧栏一处 */
  showCategoryFilter: boolean;
  filter: AssetFilter;
  search: string;
  /** 有结果时才在工具条里给「清除筛选」小链接；零结果时由空态的大按钮负责，避免同名两个按钮 */
  showClearFilter: boolean;
  onFilterChange: (next: AssetFilter) => void;
  onSearchChange: (value: string) => void;
  onClearFilter: () => void;
}

const selectClass = 'h-9 rounded-md border bg-background px-2 text-xs cursor-pointer';

/**
 * 资产列表工具条：搜索 + 类别筛选 + 同步状态筛选
 *
 * 状态档位直接复用 `DISTRIBUTION_STATUS` 那一份映射，不另建文案表
 * （spec asset-distribution-truth：五值闭集只有一套叫法）。
 */
export function AssetFilterBar({
  categoryOptions,
  showCategoryFilter,
  filter,
  search,
  showClearFilter,
  onFilterChange,
  onSearchChange,
  onClearFilter,
}: AssetFilterBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索资产..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {showCategoryFilter && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          类别
          <select
            aria-label="按类别筛选"
            className={selectClass}
            value={filter.category}
            onChange={(e) => onFilterChange({ ...filter, category: e.target.value })}
          >
            <option value={ALL_FILTER_VALUE}>全部类别</option>
            {categoryOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        同步状态
        <select
          aria-label="按同步状态筛选"
          className={selectClass}
          value={filter.status}
          onChange={(e) => onFilterChange({ ...filter, status: e.target.value as AssetSyncStatus | typeof ALL_FILTER_VALUE })}
        >
          <option value={ALL_FILTER_VALUE}>全部状态</option>
          {(Object.keys(DISTRIBUTION_STATUS) as AssetSyncStatus[]).map((status) => (
            <option key={status} value={status}>
              {DISTRIBUTION_STATUS[status].label}
            </option>
          ))}
        </select>
      </label>

      {showClearFilter && (
        <button type="button" onClick={onClearFilter} className="text-xs text-muted-foreground underline">
          清除筛选
        </button>
      )}
    </div>
  );
}
