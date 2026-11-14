/**
 * 首跑向导的页面骨架（视觉重做）
 *
 * 六屏共用同一套节奏：眉题 + 标题 + 一句说明 / 正文 / 底部动作区。
 * 只承载排版与语义，不接触业务数据——避免各屏再次各写一套、漂成不同产品。
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 屏内常规标题（24 档）；结果屏必须是 h2，标签由调用方决定 */
export const ONB_TITLE = 'text-24 font-semibold leading-8 tracking-tight text-foreground';

/** 开场/完成屏的 hero 标题：32→36px，比常规页头大一档，只给两个仪式性节点用 */
export const ONB_HERO_TITLE =
  'text-[32px] font-semibold leading-[1.22] tracking-[-0.02em] text-foreground md:text-[36px]';

/** 主按钮：桌面常态宽、右对齐；窄屏全宽（responsive 约束） */
export const ONB_PRIMARY = 'h-10 w-full rounded-lg px-5 text-14 font-semibold sm:w-auto';

/** 次动作（跳过类文字按钮）：低对比、可聚焦 */
export const ONB_SECONDARY =
  'rounded-sm text-13 text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function OnbScreen({
  testId,
  children,
  className,
}: {
  testId: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section data-testid={testId} className={cn('flex flex-col', className)}>
      {children}
    </section>
  );
}

export function OnbHeader({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <header className={cn('max-w-[720px]', className)}>
      {eyebrow !== undefined && (
        <p className="mb-2.5 inline-flex items-center gap-2 text-12 font-semibold text-muted-foreground">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
          {eyebrow}
        </p>
      )}
      {title}
      {description !== undefined && (
        <p className="mt-2.5 text-14 leading-6 text-muted-foreground">{description}</p>
      )}
    </header>
  );
}

export function OnbCard({
  children,
  className,
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}): JSX.Element {
  return (
    <div className={cn('rounded-lg border bg-card', muted && 'bg-muted/20', className)}>
      {children}
    </div>
  );
}

/**
 * 底部动作区：六屏形态一致——左侧次动作/提示，右侧主按钮。
 * 窄屏反转为「主按钮在上、提示在下」，主按钮全宽。
 */
export function OnbActions({
  primary,
  secondary,
  hint,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  hint?: ReactNode;
}): JSX.Element {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        {secondary}
        {hint !== undefined && (
          <span className="text-12 leading-relaxed text-muted-foreground">{hint}</span>
        )}
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        {primary}
      </div>
    </div>
  );
}
