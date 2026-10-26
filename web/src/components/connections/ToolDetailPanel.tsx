/**
 * 连接页右侧工具详情
 *
 * 关联: fix-trust-and-consistency tasks I4
 * spec: asset-center-consistency Scenario 2/3 —— 三口径数字全部来自接口
 * `assetCounts`，本组件不再为了计数去请求资产清单。
 */

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Box } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useAssetCategories } from '@/lib/use-asset-categories';
import { useToolActions } from './useToolActions';
import { StatusDot, TOOL_DISPLAY_NAME } from './tool-display';
import ToolAssetSummary from './ToolAssetSummary';

export default function ToolDetailPanel({ toolName }: { toolName: string }): JSX.Element {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['tool-detail', toolName],
    queryFn: () => api.getToolDetail(toolName),
  });
  const { categories } = useAssetCategories();
  const displayName = TOOL_DISPLAY_NAME[toolName] ?? toolName;
  const { toggle, detect } = useToolActions(toolName, displayName);

  if (isLoading || !detail) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const tool = detail.tool;
  // 请求进行中显示期望值；settle 后（成功/失败）回到服务端实际值
  const switchChecked = toggle.isPending
    ? (toggle.variables ?? tool.enabled ?? false)
    : (tool.enabled ?? false);

  return (
    <div className="h-full overflow-y-auto">
      {/* 头部信息 */}
      <div className="border-b p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <StatusDot installed={tool.installed} enabled={tool.enabled} />
              {displayName}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">{tool.configDir}</p>
          </div>
          <Badge variant={tool.installed ? (tool.enabled ? 'default' : 'secondary') : 'outline'}>
            {tool.installed ? (tool.enabled ? '已连接' : '已安装·未启用') : '未安装'}
          </Badge>
        </div>
        {tool.version && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Box className="h-3 w-3" />
            版本 {tool.version}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <Switch
            checked={switchChecked}
            disabled={!tool.installed || toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate(checked)}
            aria-label={`开启或关闭「${displayName}」同步`}
          />
          <span className="text-sm">启用同步</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            disabled={detect.isPending}
            onClick={() => detect.mutate()}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${detect.isPending ? 'animate-spin' : ''}`} />
            {detect.isPending ? '检测中…' : '重新检测'}
          </Button>
        </div>
      </div>

      {/* 三口径：同步情况 + 可收藏的新文件 */}
      <ToolAssetSummary
        installed={tool.installed}
        counts={detail.assetCounts ?? null}
        discovered={detail.discovered}
        categories={categories}
      />
    </div>
  );
}
