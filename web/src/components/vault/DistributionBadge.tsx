import type { AssetDistributionInfo, AssetSyncStatus } from '@/types/api';

interface DistributionBadgeProps {
  /** 分发索引里该资产的条目（真值来自 GET /api/distributions） */
  distributions: AssetDistributionInfo[];
}

/**
 * 状态五值闭集：圆点配色、文字配色与文案的唯一映射
 *
 * 卡片圆点与分发管理弹窗共用这一份，避免两处对 `pending` 一个写「待同步」一个写「待更新」。
 */
export const DISTRIBUTION_STATUS: Record<AssetSyncStatus, { dot: string; text: string; label: string }> = {
  synced: { dot: 'bg-success', text: 'text-success', label: '已同步' },
  pending: { dot: 'bg-warning', text: 'text-warning', label: '待同步' },
  conflict: { dot: 'bg-destructive', text: 'text-destructive', label: '冲突' },
  not_enabled: { dot: 'bg-slate-300', text: 'text-slate-400', label: '未启用' },
  not_installed: { dot: 'bg-slate-200', text: 'text-slate-400', label: '未安装' },
};

/** 单卡最多展示几个圆点，超出折叠为 +N */
const MAX_DOTS = 5;

/**
 * 分发状态圆点条
 *
 * spec: asset-distribution-truth Scenario 1/3/8/9：
 * - 状态只认五值闭集；判定失败的工具在索引里本就没有条目，这里也不会替它编一个灰点
 * - 没有条目就什么都不渲染——「未分发」是全站禁用词，空数组不等于未分发
 */
export function DistributionBadge({ distributions }: DistributionBadgeProps): JSX.Element | null {
  const known = distributions.filter((d): d is AssetDistributionInfo & { status: AssetSyncStatus } =>
    Object.prototype.hasOwnProperty.call(DISTRIBUTION_STATUS, d.status),
  );
  if (known.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {known.slice(0, MAX_DOTS).map((d) => {
        const style = DISTRIBUTION_STATUS[d.status];
        return (
          <span
            key={d.toolId}
            data-testid={`distribution-dot-${d.toolId}`}
            data-status={d.status}
            className={`inline-block h-2 w-2 rounded-full ${style.dot}`}
            title={`${d.toolName}：${style.label}`}
          />
        );
      })}
      {known.length > MAX_DOTS && (
        <span className="text-xs text-muted-foreground">+{known.length - MAX_DOTS}</span>
      )}
    </div>
  );
}
