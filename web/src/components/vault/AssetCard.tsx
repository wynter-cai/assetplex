import { Eye, Pencil, Settings2, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCategoryConfig } from '@/config/asset-categories';
import { cn } from '@/lib/utils';
import { DistributionBadge } from './DistributionBadge';
import type { Asset } from '@/types/api';

interface AssetCardProps {
  asset: Asset;
  /** 是否为当前展开详情的卡片（右侧详情面板对应项） */
  active?: boolean;
  onView: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDistribute: (asset: Asset) => void;
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 格式化时间为相对时间 */
function formatRelativeTime(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}小时前`;
  const diffDay = Math.floor(diffMin / 60 / 24);
  if (diffDay === 1) return '昨天';
  if (diffDay < 7) return `${diffDay}天前`;
  return d.toLocaleDateString('zh-CN');
}

/** 来源标签 */
function SourceBadge({ source }: { source: Asset['source'] }): JSX.Element | null {
  if (source === 'manual') return null;
  const labels: Record<string, string> = {
    trae: 'TRAE',
    workbuddy: 'WorkBuddy',
    claude: 'Claude Code',
    codex: 'Codex',
    qoder: 'Qoder',
    merged: '合并',
  };
  return (
    <Badge variant="secondary" className="text-xs h-5 px-1">
      {labels[source] ?? source}
    </Badge>
  );
}

/** 资产卡：整卡可点击查看/收起详情（再次点击同一卡片关闭右侧面板） */
export function AssetCard({ asset, active = false, onView, onEdit, onDistribute }: AssetCardProps): JSX.Element {
  const cat = getCategoryConfig(asset.category);
  const CatIcon = cat?.icon ?? FileText;

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${active ? '收起' : '查看'} ${asset.name} 详情`}
      onClick={() => onView(asset)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView(asset);
        }
      }}
      className={cn(
        'cursor-pointer hover:border-primary/30 transition-colors text-left',
        active && 'border-primary bg-accent/30',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
            <CatIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium truncate">{asset.name}</h3>
              <SourceBadge source={asset.source} />
            </div>
            <p className="text-xs text-muted-foreground truncate mb-2">
              {formatSize(asset.size)} · {formatRelativeTime(asset.lastModifiedAt)}
            </p>
            <DistributionBadge distributions={asset.distributions} />
          </div>
        </div>
        <div className="flex gap-1 mt-3 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onView(asset);
            }}
          >
            <Eye className="h-3 w-3 mr-1" />
            查看
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(asset);
            }}
          >
            <Pencil className="h-3 w-3 mr-1" />
            编辑
          </Button>
          <Button
            variant={asset.distributions.length === 0 ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2 text-xs flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onDistribute(asset);
            }}
          >
            <Settings2 className="h-3 w-3 mr-1" />
            分发
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
