/**
 * 步骤指示器（add-zero-config-onboarding T10，从 Import.tsx 抽取共用）
 *
 * 横向步骤胶囊：done / active / 待执行三态，与既有导入向导视觉一致。
 */

import { CheckCircle, ChevronRight } from 'lucide-react';

export function StepIndicator({ labels, current }: { labels: string[]; current: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const step = i + 1;
        const active = step === current;
        const done = step < current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : done
                    ? 'bg-success-soft text-success'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {done ? <CheckCircle className="h-3.5 w-3.5" /> : <span className="text-xs">{step}</span>}
              {label}
            </div>
            {i < labels.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            )}
          </div>
        );
      })}
    </div>
  );
}
