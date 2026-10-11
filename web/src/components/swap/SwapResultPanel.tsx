/**
 * 切换执行结果面板（enable-tool-hot-swap T9）
 *
 * 诚实文案：通过回读验证的项报"已写入并校验(存在/可解析/与源一致)"，
 * 不代表工具已加载；失败项如实展示原因。spec: swap-verify-rollback。
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SwapExecuteResult, SwapItemResult } from '@/types/api';
import { SWAP_CATEGORY_LABELS } from './swap-labels';

interface SwapResultPanelProps {
  result: SwapExecuteResult;
  onRollback: (swapId: string) => void;
  rollingBack: boolean;
}

/** 单项结果行 */
function ItemRow({ item }: { item: SwapItemResult }): JSX.Element {
  const label = SWAP_CATEGORY_LABELS[item.category] ?? item.category;
  return (
    <li className="flex items-center gap-2 rounded border bg-background px-3 py-1.5 text-xs">
      <Badge variant="outline">{label}</Badge>
      <span className="flex-1 truncate font-mono">{item.hubRelativePath}</span>
      {item.action === 'written' && (
        <span className="text-emerald-600">已写入并校验（存在/可解析/与源一致）</span>
      )}
      {item.action === 'skipped' && (
        <span className="text-muted-foreground">已跳过：{item.reason ?? '无需处理'}</span>
      )}
      {item.action === 'failed' && <span className="text-destructive">失败：{item.reason ?? '未知原因'}</span>}
    </li>
  );
}

export function SwapResultPanel({ result, onRollback, rollingBack }: SwapResultPanelProps): JSX.Element {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <header className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">
          切换结果：写入 {result.counts.written} · 跳过 {result.counts.skipped} · 失败 {result.counts.failed}
        </h3>
        {result.success ? (
          <Badge className="bg-emerald-100 text-emerald-800">成功</Badge>
        ) : (
          <Badge variant="destructive">部分失败</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          验证仅表示文件已写入并通过回读检查，不代表工具已加载
        </span>
      </header>

      {result.items.length > 0 && (
        <ul className="space-y-1">
          {result.items.map((item) => (
            <ItemRow key={`${item.category}-${item.hubRelativePath}`} item={item} />
          ))}
        </ul>
      )}

      {result.rollbackAvailable && (
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => onRollback(result.swapId)} disabled={rollingBack}>
            {rollingBack ? '撤销中…' : '撤销本次切换'}
          </Button>
          <span className="text-xs text-muted-foreground">覆盖项将从备份恢复，本次新增项会被移除</span>
        </div>
      )}
    </section>
  );
}
