/**
 * 步骤指示器（add-zero-config-onboarding T10，从 Import.tsx 抽取共用）
 *
 * 视觉对齐首跑向导原型：圆形序号点 + 标签，done / active / 待执行三态。
 * 传入 onSelect 时每个阶段可点击直达（首跑向导用）；不传则保持纯展示。
 */

import { Check } from 'lucide-react';

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
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:gap-x-7">
      {labels.map((label, i) => {
        const step = i + 1;
        const active = step === current;
        const done = step < current;
        const clickable = onSelect !== undefined;
        const dotClass = active
          ? 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/10'
          : done
            ? 'border-success bg-success text-background'
            : 'border-border bg-background text-muted-foreground';
        const labelClass = active
          ? 'text-primary font-semibold'
          : done
            ? 'text-muted-foreground'
            : 'text-muted-foreground/80';
        return (
          <button
            key={step}
            type="button"
            onClick={clickable ? () => onSelect(step) : undefined}
            disabled={!clickable}
            aria-current={active ? 'step' : undefined}
            data-testid={`step-${step}`}
            className={`flex items-center gap-2 rounded-full px-1 py-1 transition-colors ${
              clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold tabular-nums transition-colors ${dotClass}`}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step}
            </span>
            <span className={`hidden text-12 transition-colors sm:inline ${labelClass}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
