/**
 * 同步页底部操作栏
 *
 * 由 derivePrimaryAction 驱动：未选目标 → 禁用 + hint；
 * 无内容 → 禁用 + hint；有内容 → 可执行 + 影响范围。
 *
 * spec: product-surface-hygiene Scenario 3 / 4 / 5
 */

import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { derivePrimaryAction, impactText, modeCaption, type SyncImpact } from '@/lib/sync-impact';

interface Props {
  selectedCount: number;
  impact: SyncImpact;
  dryRun: boolean;
  pending: boolean;
  onRun: () => void;
}

export function SyncActionBar({ selectedCount, impact, dryRun, pending, onRun }: Props): JSX.Element {
  const action = derivePrimaryAction({ selectedCount, impact, dryRun, pending });

  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border bg-card/95 p-3 backdrop-blur">
      <div className="flex items-center gap-3 text-sm">
        {/* 模式说明（Scenario 5：开关状态变化时此处文案跟着变） */}
        <span className="text-muted-foreground">{modeCaption(dryRun)}</span>

        {/* 影响范围（Scenario 4：仅在有内容时显示） */}
        {action.showImpact && (
          <span data-testid="impact-line">{impactText(impact)}</span>
        )}

        {/* 紧邻按钮的解释（Scenario 3: 未选目标 / 无内容） */}
        {action.hint && (
          <span className="text-sm italic text-muted-foreground">{action.hint}</span>
        )}

        {selectedCount > 0 && action.showImpact && (
          <>
            {impact.changes > 0 && <Badge variant="default">{impact.changes} 项变更</Badge>}
            {impact.conflicts > 0 && <Badge variant="secondary">{impact.conflicts} 项冲突</Badge>}
          </>
        )}
      </div>

      <Button className="ml-auto" onClick={onRun} disabled={action.disabled}>
        <Play className="h-4 w-4 mr-1.5" />
        {action.label}
      </Button>
    </div>
  );
}
