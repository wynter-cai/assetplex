/**
 * 首页最近变化（refactor-home-action-panel T9）
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/home-dashboard.spec.md
 * Requirement 5：固定最多 5 条、时间倒序、每条含时间 + 类型 + 摘要；
 * 永远保留「查看全部」→ /activities（含空态，不留死链）。
 */

import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { formatHomeTimestamp } from '@/lib/use-home-dashboard';
import type { ActivityEntry, ActivityType } from '@/types/api';

const TYPE_LABEL: Record<ActivityType, string> = {
  import: '导入',
  sync: '同步',
  edit: '编辑',
  create: '新建',
};

const LIMIT = 5;

function timeValue(entry: ActivityEntry): number {
  const value = new Date(entry.at).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/** 时间倒序后取前 5 条（后端已倒序，这里防御性再排一次） */
function recentFive(activities: readonly ActivityEntry[]): ActivityEntry[] {
  return [...activities].sort((a, b) => timeValue(b) - timeValue(a)).slice(0, LIMIT);
}

export interface RecentChangesProps {
  activities: ActivityEntry[];
}

export function RecentChanges({ activities }: RecentChangesProps): JSX.Element {
  const items = recentFive(activities);

  return (
    <section aria-label="最近变化" data-testid="recent-changes" className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-14 font-semibold">最近变化</h2>
        <Link
          to="/activities"
          className="rounded text-12 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          查看全部
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="px-4 pb-4 text-13 text-muted-foreground">还没有操作记录</p>
      ) : (
        <ul>
          {items.map((entry) => (
            <li
              key={entry.id}
              data-testid={`recent-change-${entry.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2"
            >
              <span className="w-[150px] shrink-0 text-12 text-muted-foreground">
                {formatHomeTimestamp(entry.at)}
              </span>
              <Badge variant="outline">{TYPE_LABEL[entry.type]}</Badge>
              <span className="min-w-0 flex-1 text-13">{entry.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
