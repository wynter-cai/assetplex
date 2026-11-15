import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { pickCategory, useAssetCategories } from '@/lib/use-asset-categories';
import { TOOL_DISPLAY_NAME } from '@/components/connections/tool-display';
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
  const { data: distributionToolsData } = useQuery({
    queryKey: ['distribution-tools'],
    queryFn: api.getDistributionTools,
    enabled: open,
  });
  const { categories } = useAssetCategories();
  const categoryLabel = asset ? pickCategory(categories, asset.category)?.label ?? asset.category : '';
  // 矩阵拿不到（接口失败/未落地）时不编造「不支持」，只按安装状态处理
  const supportByTool = useMemo(() => {
    const map = new Map<string, Record<string, SwapCategorySupport>>();
    for (const candidate of distributionToolsData?.tools ?? []) {
      map.set(candidate.name, candidate.supportMatrix as Record<string, SwapCategorySupport>);
    }
    return map;
  }, [distributionToolsData]);

  // 本地维护哪些工具启用了同步（Phase 1 不持久化，Phase 2 实现）
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  // 每个工具一行：状态/开关/类别支持算一次，渲染与同步目标共用，避免两处判断漂移
  const rows = useMemo(() => {
    const entries = distributions ?? asset?.distributions ?? [];
    return (toolsData?.tools ?? []).map((tool) => {
      const dist = entries.find((d) => d.toolId === tool.name);
      const unsupported = supportByTool.get(tool.name)?.[asset?.category ?? '']?.supported === false;
      const isEnabled = enabledTools[tool.name] ?? (dist?.status === 'synced' || tool.enabled === true);
      return { tool, status: statusOf(dist?.status), unsupported, isEnabled };
    });
  }, [toolsData, distributions, asset, supportByTool, enabledTools]);

  // 目标 = 开关开启 + 已安装 + 类别支持；空目标不发请求（无工具过滤等于全量分发）
  const targets = rows.filter((row) => row.tool.installed && !row.unsupported && row.isEnabled).map((row) => row.tool.name);

  const handleSync = async (): Promise<void> => {
    if (syncing || targets.length === 0) return;
    setSyncing(true);
    try {
      const result = await api.runSync(targets, false, { backup: true });
      const failed = result.results.filter((r) => !r.success);
      if (failed.length > 0) {
        toast.error('同步未全部成功', {
          details: failed.map((r) => `${TOOL_DISPLAY_NAME[r.tool] ?? r.tool}：${r.errors[0] ?? '未知原因'}`),
        });
      } else {
        const written = result.results.reduce((sum, r) => sum + r.itemCount, 0);
        toast.success('同步完成', {
          description: `${result.results.length} 个工具，写入 ${written} 个文件`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['distributions'] });
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
      onSync?.();
    } catch (err) {
      toast.error('同步失败', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncing(false);
    }
  };

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
            rows.map(({ tool, status, unsupported, isEnabled }) => (
              <div
                key={tool.name}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {TOOL_DISPLAY_NAME[tool.name] ?? tool.name}
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
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          {!isLoading && targets.length === 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              没有可同步的工具：需已安装、类别支持且开关已开启
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            size="sm"
            disabled={targets.length === 0 || syncing}
            onClick={() => {
              void handleSync();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {syncing ? '同步中…' : '立即同步'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
