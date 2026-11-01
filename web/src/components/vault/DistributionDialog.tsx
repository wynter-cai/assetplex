import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pickCategory, useAssetCategories } from '@/lib/use-asset-categories';
import { DISTRIBUTION_STATUS } from './DistributionBadge';
import type { Asset, AssetDistributionInfo, AssetSyncStatus, SwapCategorySupport } from '@/types/api';

interface DistributionDialogProps {
  asset: Asset | null;
  open: boolean;
  /**
   * 分发索引里该资产的条目（真值，同资产卡）
   *
   * spec asset-distribution-truth：`asset.distributions` 已不再供数，继续读它会把
   * 每一个已安装工具都说成「未同步」。
   */
  distributions?: AssetDistributionInfo[];
  onOpenChange: (open: boolean) => void;
  onSync?: () => void;
}

/** 五值闭集之外的状态一律不编造，只说「状态未知」 */
function statusOf(status: string | undefined): { text: string; label: string } | undefined {
  return status && Object.prototype.hasOwnProperty.call(DISTRIBUTION_STATUS, status)
    ? DISTRIBUTION_STATUS[status as AssetSyncStatus]
    : undefined;
}

export function DistributionDialog({
  asset,
  open,
  distributions,
  onOpenChange,
  onSync,
}: DistributionDialogProps): JSX.Element {
  const { data: toolsData, isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
    enabled: open,
  });

  // 类别支持矩阵真值（与切换页同一份，后端按适配器 resolveHubItems 派生）：
  // 不支持的类别必须说出原因并禁用，不静默跳过（memory-visible Scenario 6、D6）
  const { data: swapData } = useQuery({
    queryKey: ['swap-tools'],
    queryFn: api.getSwapTools,
    enabled: open,
  });
  const { categories } = useAssetCategories();
  const categoryLabel = asset ? pickCategory(categories, asset.category)?.label ?? asset.category : '';
  // 矩阵拿不到（接口失败/未落地）时不编造「不支持」，只按安装状态处理
  const supportByTool = useMemo(() => {
    const map = new Map<string, Record<string, SwapCategorySupport>>();
    for (const candidate of swapData?.tools ?? []) {
      map.set(candidate.name, candidate.supportMatrix as Record<string, SwapCategorySupport>);
    }
    return map;
  }, [swapData]);

  // 本地维护哪些工具启用了同步（Phase 1 不持久化，Phase 2 实现）
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});

  if (!asset) return <></>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            同步管理: <span className="font-mono text-sm">{asset.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            toolsData?.tools.map((tool) => {
              const dist = (distributions ?? asset.distributions).find((d) => d.toolId === tool.name);
              const status = statusOf(dist?.status);
              const isEnabled = enabledTools[tool.name] ?? (dist?.status === 'synced' || tool.enabled === true);
              const support = supportByTool.get(tool.name)?.[asset.category];
              const unsupported = support?.supported === false;
              return (
                <div
                  key={tool.name}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {tool.name === 'trae-cn' ? 'TRAE 中国版' : tool.name}
                    </div>
                    <div className={`text-xs ${unsupported ? 'text-warning' : status?.text ?? 'text-muted-foreground'}`}>
                      {unsupported
                        ? `此工具不支持${categoryLabel}类别，无法同步`
                        : tool.installed
                          ? status?.label ?? '状态未知'
                          : '未安装'}
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled && !unsupported}
                    onCheckedChange={(v) => setEnabledTools((prev) => ({ ...prev, [tool.name]: v }))}
                    disabled={!tool.installed || unsupported}
                  />
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSync?.();
              onOpenChange(false);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            立即同步
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
