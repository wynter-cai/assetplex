/**
 * 职能色点（spec skill-function-color Scenario: 卡面 / chips / 详情颜色一致）
 *
 * 纯装饰元素：aria-hidden，职能名始终以文字并存——不靠颜色单独传达信息。
 * 颜色值来自 index.css 的 --fn-*（经 skill-colors 的固定类名映射）。
 */

import { cn } from '@/lib/utils';
import { functionDotClass } from './skill-colors';
import type { SkillFunction } from '@/types/api';

export function FunctionDot({
  fn,
  className,
}: {
  fn: SkillFunction | undefined;
  className?: string;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-function={fn ?? 'other'}
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', functionDotClass(fn), className)}
    />
  );
}
