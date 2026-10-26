/**
 * 同步执行结果卡片
 */

import { Badge } from '@/components/ui/badge';
import type { SyncResult } from '@/types/api';
import { toolDisplayName } from './sync-display';

export function SyncResultCard({ result }: { result: SyncResult }): JSX.Element {
  const display = toolDisplayName(result.tool);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{display}</span>
        <Badge variant={result.success ? 'success' : 'destructive'}>
          {result.success ? '成功' : '失败'}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        同步 {result.itemCount} 项，跳过 {result.skippedCount} 项，耗时 {result.durationMs}ms
      </div>
      {result.errors.map((e, i) => (
        <div key={i} className="mt-1 text-xs text-destructive">错误：{e}</div>
      ))}
      {result.warnings.map((w, i) => (
        <div key={i} className="mt-1 text-xs text-warning">警告：{w}</div>
      ))}
    </div>
  );
}
