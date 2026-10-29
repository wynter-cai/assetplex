import { Download, RefreshCw, Edit, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActivityItem } from '@/types/api';

interface RecentActivityProps {
  activities: ActivityItem[];
}

const ACTIVITY_ICONS = {
  import: { icon: Download, color: 'text-info', bg: 'bg-info-soft' },
  sync: { icon: RefreshCw, color: 'text-success', bg: 'bg-success-soft' },
  edit: { icon: Edit, color: 'text-warning', bg: 'bg-warning-soft' },
  create: { icon: Plus, color: 'text-primary', bg: 'bg-primary/10' },
} as const;

/** 将 ISO 时间或相对时间字符串格式化为"今天 HH:MM"或"昨天" */
function formatTime(isoString: string): string {
  // Phase 1: 后端返回空数组，这个函数在有数据时会被使用
  // 简单格式化为"刚刚"或日期
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return '昨天';
    return d.toLocaleDateString('zh-CN');
  } catch {
    return isoString;
  }
}

export function RecentActivity({ activities }: RecentActivityProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">最近活动</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            还没有活动记录，开始收藏资产后会显示在这里
          </p>
        ) : (
          <div className="space-y-3">
            {activities.slice(0, 5).map((activity) => {
              const config = ACTIVITY_ICONS[activity.type] ?? ACTIVITY_ICONS.create;
              const Icon = config.icon;
              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${config.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatTime(activity.occurredAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
