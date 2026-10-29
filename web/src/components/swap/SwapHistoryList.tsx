/**
 * 切换历史列表（enable-tool-hot-swap T9）
 *
 * 数据来自 Hub 本机 .swap-backup/history.json，最新在前；
 * rollbackAvailable 由后端按备份目录实际存在给出，可撤销项提供"撤销"入口。
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TOOL_DISPLAY_NAME } from '@/components/connections/tool-display';
import type { SwapHistoryEntry } from '@/types/api';

interface SwapHistoryListProps {
  history: SwapHistoryEntry[];
  onRollback: (swapId: string) => void;
  rollingBackId: string | null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function SwapHistoryList({ history, onRollback, rollingBackId }: SwapHistoryListProps): JSX.Element {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold">切换历史</h3>
      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无切换记录。每次执行切换都会在这里留痕，覆盖前的备份保留最近几次。</p>
      ) : (
        <ul className="space-y-1.5">
          {history.map((entry) => (
            <li key={entry.swapId} className="flex items-center gap-2 rounded border bg-background px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{formatTime(entry.createdAt)}</span>
              <span className="font-medium">{TOOL_DISPLAY_NAME[entry.tool] ?? entry.tool}</span>
              <span>
                写入 {entry.counts.written} · 跳过 {entry.counts.skipped} · 失败 {entry.counts.failed}
              </span>
              {entry.rolledBack && <Badge variant="secondary">已撤销</Badge>}
              <span className="ml-auto">
                {!entry.rolledBack && entry.rollbackAvailable && (
                  <Button variant="ghost" size="sm" onClick={() => onRollback(entry.swapId)} disabled={rollingBackId === entry.swapId}>
                    {rollingBackId === entry.swapId ? '撤销中…' : '撤销'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
