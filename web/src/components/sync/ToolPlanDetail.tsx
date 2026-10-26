/**
 * 单个工具的同步计划详情
 */

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SyncPlan } from '@/types/api';
import { toolDisplayName, ACTION_META, FALLBACK_ACTION_META } from './sync-display';

export function ToolPlanDetail({ plan }: { plan: SyncPlan }): JSX.Element | null {
  const display = toolDisplayName(plan.tool);
  if (plan.items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">{display}</span>
        <Badge variant={plan.toolInstalled ? 'success' : 'secondary'}>
          {plan.toolInstalled ? '已安装' : '未安装'}
        </Badge>
      </div>
      <div className="divide-y">
        {plan.items.map((item, i) => {
          const meta = ACTION_META[item.action] ?? FALLBACK_ACTION_META;
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-start gap-2.5 px-3 py-2 text-xs">
              <Badge variant={meta.variant} className="shrink-0 gap-1 px-1.5 py-0">
                <Icon className="h-3 w-3" />
                {meta.label}
              </Badge>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="font-mono truncate">{item.item.relativePath || '(根)'}</div>
                {item.reason && <div className="text-muted-foreground">→ {item.reason}</div>}
                {item.warning && (
                  <div className="flex items-center gap-1 text-warning">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {item.warning}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
