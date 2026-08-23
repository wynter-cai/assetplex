import type { AssetDistribution } from '@/types/api';

interface DistributionBadgeProps {
  distributions: AssetDistribution[];
}

/**
 * 分发状态圆点条
 *
 * 显示资产分发到哪些工具的状态：
 * - 绿色圆: 已同步
 * - 黄色圆: 待同步
 * - 红色圆: 冲突
 * - 灰色圆: 未启用
 */
export function DistributionBadge({ distributions }: DistributionBadgeProps): JSX.Element {
  if (distributions.length === 0) {
    return <span className="text-xs text-muted-foreground">未分发</span>;
  }

  const statusColor: Record<string, string> = {
    synced: 'bg-green-500',
    pending: 'bg-amber-500',
    conflict: 'bg-red-500',
    not_enabled: 'bg-slate-300 dark:bg-slate-600',
    not_installed: 'bg-slate-200 dark:bg-slate-700',
  };

  const statusTitle: Record<string, string> = {
    synced: '已同步',
    pending: '待更新',
    conflict: '冲突',
    not_enabled: '未启用',
    not_installed: '未安装',
  };

  return (
    <div className="flex items-center gap-1">
      {distributions.slice(0, 5).map((d) => (
        <span
          key={d.toolId}
          className={`inline-block h-2 w-2 rounded-full ${statusColor[d.status] ?? statusColor.not_enabled}`}
          title={`${d.toolName}: ${statusTitle[d.status] ?? d.status}`}
        />
      ))}
      {distributions.length > 5 && (
        <span className="text-xs text-muted-foreground">+{distributions.length - 5}</span>
      )}
    </div>
  );
}
