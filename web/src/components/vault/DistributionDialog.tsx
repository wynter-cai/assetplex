import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Asset } from '@/types/api';

interface DistributionDialogProps {
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSync?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  synced: '已同步',
  pending: '待更新',
  conflict: '冲突',
  not_enabled: '未启用',
  not_installed: '未安装',
};

const STATUS_COLOR: Record<string, string> = {
  synced: 'text-green-600 dark:text-green-400',
  pending: 'text-amber-600 dark:text-amber-400',
  conflict: 'text-red-600 dark:text-red-400',
  not_enabled: 'text-slate-400',
  not_installed: 'text-slate-400',
};

export function DistributionDialog({ asset, open, onOpenChange, onSync }: DistributionDialogProps): JSX.Element {
  const { data: toolsData, isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
    enabled: open,
  });

  // 本地维护哪些工具启用了同步（Phase 1 不持久化，Phase 2 实现）
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});

  if (!asset) return <></>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            分发管理: <span className="font-mono text-sm">{asset.name}</span>
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
              const dist = asset.distributions.find((d) => d.toolId === tool.name);
              const isEnabled = (enabledTools[tool.name] ?? ((dist?.status === 'synced') || tool.enabled)) ?? false;
              return (
                <div
                  key={tool.name}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {tool.name === 'trae-cn' ? 'TRAE 中国版' : tool.name}
                    </div>
                    <div className={`text-xs ${STATUS_COLOR[dist?.status ?? 'not_enabled']}`}>
                      {tool.installed ? (
                        <>
                          {dist?.status ? STATUS_LABEL[dist.status] : '未同步'}
                          {dist?.lastSyncedAt && ` · ${new Date(dist.lastSyncedAt).toLocaleDateString('zh-CN')}`}
                        </>
                      ) : (
                        '未安装'
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(v) => setEnabledTools((prev) => ({ ...prev, [tool.name]: v }))}
                    disabled={!tool.installed}
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
