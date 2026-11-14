/**
 * 步骤指示器（add-zero-config-onboarding T10，从 Import.tsx 抽取共用）
 *
 * 视觉重做：由「一排圆点 + 标签」改为分段进度轨——
 * 每段 = 序号/完成态 + 标签 + 一条进度线，当前段实心、已完成段浅色、未到段留白。
 * props 接口保持不变（labels / current / onSelect）；不传 onSelect 时纯展示。
 */

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StepIndicator({
  labels,
  current,
  onSelect,
}: {
  labels: string[];
  current: number;
  /** 点击阶段直达；不传则保持纯展示 */
  onSelect?: (step: number) => void;
}): JSX.Element {
  const clickable = onSelect !== undefined;

  return (
    <div className="flex w-full items-start gap-1.5 sm:gap-3">
      {labels.map((label, index) => {
        const step = index + 1;
        const active = step === current;
        const done = step < current;
        return (
          <button
            key={step}
            type="button"
            onClick={clickable ? () => onSelect(step) : undefined}
            disabled={!clickable}
            aria-current={active ? 'step' : undefined}
            aria-label={`第 ${step} 步：${label}${done ? '（已完成）' : ''}`}
            data-testid={`step-${step}`}
            className={cn(
              'group flex min-w-0 flex-1 flex-col gap-2 rounded-md text-left transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold tabular-nums transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-primary/25 bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : step}
              </span>
              <span
                className={cn(
                  'hidden truncate text-12 transition-colors sm:block',
                  active
                    ? 'font-semibold text-foreground'
                    : done
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/70',
                )}
              >
                {label}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'block h-1 w-full overflow-hidden rounded-full',
                active ? 'bg-primary/15' : 'bg-border/70',
              )}
            >
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-300',
                  active ? 'w-full bg-primary' : done ? 'w-full bg-primary/35' : 'w-0',
                )}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
