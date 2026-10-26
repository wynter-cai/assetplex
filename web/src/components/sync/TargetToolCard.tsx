/**
 * 同步目标工具卡片（可勾选）
 *
 * spec Scenario 6：未安装工具呈禁用态、点不动、给出「安装后重新扫描即可启用」
 */

import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SyncPlan } from '@/types/api';
import { toolDisplayName, ACTION_META, actionableCount } from './sync-display';

interface Props {
  name: string;
  installed: boolean;
  enabled?: boolean;
  selected: boolean;
  onToggle: () => void;
  plan?: SyncPlan;
}

export function TargetToolCard({ name, installed, enabled, selected, onToggle, plan }: Props): JSX.Element {
  const display = toolDisplayName(name);
  const actionable = plan ? actionableCount(plan) : 0;
  const warnings = plan ? plan.items.filter((i) => i.warning).length : 0;

  const handleClick = (): void => {
    if (!installed) return;
    onToggle();
  };

  return (
    <button
      type="button"
      aria-disabled={!installed}
      onClick={handleClick}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:bg-accent/40'
      } ${!installed ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
          }`}
        >
          {selected && <CheckCircle2 className="h-3 w-3" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{display}</span>
            {!installed ? (
              <Badge variant="outline" className="text-xs shrink-0">未安装</Badge>
            ) : enabled === false ? (
              <Badge variant="secondary" className="text-xs shrink-0">未启用</Badge>
            ) : (
              <Badge variant="success" className="text-xs shrink-0">就绪</Badge>
            )}
          </div>

          {!installed && (
            <p className="mt-1 text-xs text-muted-foreground">安装后重新扫描即可启用</p>
          )}

          {plan && installed && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {actionable > 0 ? (
                <span className="font-medium text-primary">{actionable} 项待同步</span>
              ) : (
                <span className="text-muted-foreground">已是最新</span>
              )}
              {warnings > 0 && (
                <span className="flex items-center gap-0.5 text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  {warnings}
                </span>
              )}
              {Object.entries(
                plan.items.reduce<Record<string, number>>((acc, item) => {
                  acc[item.action] = (acc[item.action] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([action, n]) => {
                const meta = ACTION_META[action];
                if (!meta || action === 'skip') return null;
                return (
                  <Badge key={action} variant={meta.variant} className="text-xs px-1 py-0">
                    {meta.label} {n}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
