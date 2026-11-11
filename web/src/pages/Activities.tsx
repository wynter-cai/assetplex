/**
 * 活动页（add-activity-log）
 *
 * 时间线：同步 / 导入 / 编辑 / 新建四类操作，支持类型筛选与游标翻页。
 * spec: 设计文档/changes/add-activity-log/specs/activity-feed.spec.md Scenario 6
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Edit, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { ActivityEntry, ActivityType } from '@/types/api';

const PAGE_SIZE = 20;

type FilterValue = 'all' | ActivityType;

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'sync', label: '同步' },
  { value: 'import', label: '导入' },
  { value: 'edit', label: '编辑' },
  { value: 'create', label: '新建' },
];

const TYPE_META = {
  import: { icon: Download, className: 'bg-info-soft text-info', label: '导入' },
  sync: { icon: RefreshCw, className: 'bg-success-soft text-success', label: '同步' },
  edit: { icon: Edit, className: 'bg-warning-soft text-warning', label: '编辑' },
  create: { icon: Plus, className: 'bg-primary/10 text-primary', label: '新建' },
} as const;

/** 绝对时间（活动页要求可回溯，不再用「几分钟前」） */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function Activities(): JSX.Element {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [extra, setExtra] = useState<ActivityEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['activity', filter],
    queryFn: () =>
      api.getActivity({
        limit: PAGE_SIZE,
        ...(filter === 'all' ? {} : { type: filter }),
      }),
  });

  // 换筛选或首页数据刷新时，重置「加载更多」的累积状态
  useEffect(() => {
    setExtra([]);
    setCursor(query.data?.nextCursor ?? null);
    setMoreError(null);
  }, [query.data]);

  const items = [...(query.data?.items ?? []), ...extra];

  const loadMore = async (): Promise<void> => {
    if (cursor === null) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.getActivity({
        limit: PAGE_SIZE,
        ...(filter === 'all' ? {} : { type: filter }),
        cursor,
      });
      setExtra((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">活动</h1>
        <p className="text-sm text-muted-foreground">
          同步、导入、编辑与新建操作的本地时间线，只保留最近 6 个月。
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="活动类型筛选">
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={filter === item.value ? 'default' : 'outline'}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          {query.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
          ) : query.isError ? (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm text-destructive">
                {query.error instanceof Error ? query.error.message : '活动加载失败'}
              </p>
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
                重试
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              还没有活动记录。同步、导入或编辑资产后，这里会出现时间线。
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((entry) => {
                const meta = TYPE_META[entry.type];
                const Icon = meta.icon;
                return (
                  <li key={entry.id} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.className}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{entry.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {meta.label} · {formatTime(entry.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {moreError !== null && <p className="text-center text-xs text-destructive">{moreError}</p>}
          {cursor !== null && (
            <div className="flex justify-center">
              <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? '加载中…' : '加载更多'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Activities;
