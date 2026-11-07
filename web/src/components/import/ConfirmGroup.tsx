/**
 * Step 3 确认屏的分组折叠容器（refine-skill-cards-wizard T17）
 *
 * spec import-wizard-noise「确认屏按状态分组折叠」：
 * 三组按状态拆开，冲突组默认展开，其余折叠只留一句摘要；
 * 0 项的组由调用方直接不渲染，这里不处理空态。
 */
import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ConfirmGroupProps {
  /** 稳定锚点，e2e 与 RTL 用它定位，不依赖文案（风险 5） */
  testId: string;
  title: string;
  count: number;
  /** 折叠态右侧的一句话摘要 */
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ConfirmGroup({
  testId,
  title,
  count,
  summary,
  defaultOpen = false,
  children,
}: ConfirmGroupProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${testId}-body`;

  return (
    <section data-testid={testId} className="rounded-md border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${title}（${count}）`}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
        {!open && <span className="ml-auto text-xs text-muted-foreground">{summary}</span>}
      </button>
      {open && (
        <div id={bodyId} className="space-y-2 border-t px-3 py-2">
          {children}
        </div>
      )}
    </section>
  );
}

/** 库内已存在 / 新增文件两组的只读行：单行路径 + 固定语义，不出现策略选择 */
export function ConfirmGroupRow({
  path,
  tool,
  label,
  className,
}: {
  path: string;
  tool: string;
  label: string;
  className: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-1 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate">{path}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{tool}</span>
      <Badge variant="outline" className={cn('shrink-0 text-xs', className)}>
        {label}
      </Badge>
    </div>
  );
}
