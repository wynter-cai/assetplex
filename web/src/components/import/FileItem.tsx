import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { DEFAULT_CATEGORY_ICON } from '@/config/asset-categories';
import { pickCategory, useAssetCategories } from '@/lib/use-asset-categories';
import type { DiscoveredItem } from '@/types/api';

interface Props {
  item: DiscoveredItem;
  selected: boolean;
  onToggle: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileItem({ item, selected, onToggle }: Props) {
  // 类别图标与中文名一律取声明源（接口清单优先，查不到回退 fallback 清单）
  const { categories } = useAssetCategories();
  const category = pickCategory(categories, item.category);
  const Icon = category?.icon ?? DEFAULT_CATEGORY_ICON;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 rounded-md transition-colors"
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 rounded accent-primary shrink-0"
      />
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.hubTargetPath}</span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {category?.label ?? item.category}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatSize(item.size)} · {item.tool}
        </div>
      </div>
      {item.conflict === 'differs' && (
        <Badge variant="outline" className="text-warning border-warning/40 text-xs shrink-0">
          <AlertTriangle className="h-3 w-3 mr-1" />
          冲突
        </Badge>
      )}
      {item.conflict === 'exists' && (
        <Badge variant="outline" className="text-info border-info/40 text-xs shrink-0">
          已存在
        </Badge>
      )}
      {item.conflict === 'none' && (
        <Badge variant="outline" className="text-success border-success/40 text-xs shrink-0">
          新文件
        </Badge>
      )}
    </div>
  );
}
