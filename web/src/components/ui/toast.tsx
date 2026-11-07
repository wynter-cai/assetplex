/**
 * 全局 Toaster（fix-ui-trust-gaps T4）
 *
 * 基于 @radix-ui/react-toast；白底卡片 + 语义色图标/左条，
 * 文字保持近黑，不依赖语义色背景承载对比度（P1 已令牌化：success→--success，error→--destructive）。
 * 批量明细 >3 条折叠；自动关闭时长由 store 按 success/error 区分。
 */

import { useState, type ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, AlertTriangle, Info, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastItem, type ToastVariant } from '@/lib/toast-store';

/** 明细超过该条数时折叠 */
const DETAIL_PREVIEW_COUNT = 3;

const VARIANT_META: Record<
  ToastVariant,
  { icon: typeof Info; iconClass: string; barClass: string; ariaLabel: string }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-success',
    barClass: 'bg-success',
    ariaLabel: '成功',
  },
  error: {
    icon: AlertTriangle,
    iconClass: 'text-destructive',
    barClass: 'bg-destructive',
    ariaLabel: '错误',
  },
  info: {
    icon: Info,
    iconClass: 'text-primary',
    barClass: 'bg-primary',
    ariaLabel: '信息',
  },
};

function ToastCard({ item }: { item: ToastItem }): JSX.Element {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const dismiss = useToastStore((s) => s.dismiss);
  const meta = VARIANT_META[item.variant];
  const Icon = meta.icon;

  const visibleDetails = expanded ? item.details : item.details.slice(0, DETAIL_PREVIEW_COUNT);
  const hiddenCount = item.details.length - DETAIL_PREVIEW_COUNT;

  return (
    <ToastPrimitive.Root
      open={open}
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-label={meta.ariaLabel}
      duration={item.duration}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) dismiss(item.id);
      }}
      className={cn(
        'pointer-events-auto relative flex w-full items-start gap-2.5 overflow-hidden rounded-lg border bg-card p-3 pr-8 shadow-lg',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', meta.barClass)} aria-hidden="true" />
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <ToastPrimitive.Title className="text-sm font-medium text-foreground">
          {item.title}
        </ToastPrimitive.Title>
        {item.description && (
          <ToastPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
            {item.description}
          </ToastPrimitive.Description>
        )}
        {item.details.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 border-t pt-1.5">
            {visibleDetails.map((line) => (
              <li key={line} className="truncate text-xs text-muted-foreground" title={line}>
                {line}
              </li>
            ))}
          </ul>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            {expanded ? '收起' : `查看详情（还有 ${hiddenCount} 项）`}
            <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismiss(item.id);
            }}
            className="mt-1.5 text-xs font-medium text-primary hover:underline"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <ToastPrimitive.Close
        aria-label="关闭通知"
        className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

/** 挂载一次：App 根部渲染 <Toaster /> */
export function Toaster(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
      <ToastPrimitive.Viewport
        aria-label="通知"
        className="fixed bottom-4 right-4 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none"
      />
    </ToastPrimitive.Provider>
  );
}

/** 测试/故事用：便捷包裹（Provider 已含于 Toaster，此类型仅用于约束 children） */
export type ToasterProps = { children?: ReactNode };
