/**
 * Step 3 无冲突确认清单（queued-import-preview）
 *
 * 导入执行前预览待写条目与各自预期动作（新增/跳过），纯展示不触发任何写入；
 * 动作词与 Step 4 结果徽标同词，保持「预览 → 结果」口径一致。
 */
import { Badge } from '@/components/ui/badge';
import type { DiscoveredItem } from '@/types/api';

interface Props {
  items: DiscoveredItem[];
}

/** 预期动作：与后端 execute-import 语义对齐（一致即跳过，其余写入） */
function expectedAction(item: DiscoveredItem): { label: string; className: string } {
  if (item.conflict === 'exists') {
    return { label: '跳过', className: 'text-muted-foreground border-muted' };
  }
  return { label: '新增', className: 'text-success border-success/40' };
}

export function ImportConfirmList({ items }: Props): JSX.Element {
  const willCreate = items.filter((i) => i.conflict !== 'exists').length;
  const willSkip = items.length - willCreate;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        共 {items.length} 个文件：{willCreate} 个将写入资产库，{willSkip} 个因内容一致将跳过；点「开始导入」前不会有任何变化。
      </p>
      <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
        {items.map((item) => {
          const action = expectedAction(item);
          return (
            <div key={`${item.tool}:${item.absolutePath}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.hubTargetPath}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.tool}</span>
              <Badge variant="outline" className={`shrink-0 text-xs ${action.className}`}>
                {action.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
