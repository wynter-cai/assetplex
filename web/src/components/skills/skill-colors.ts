/**
 * 九职能色彩编码（spec skill-function-color / refine-skill-cards-wizard T2）
 *
 * 颜色值只在 index.css 的 `--fn-*` 定义一次；这里只做「职能 → 固定类名」映射。
 * 类名必须写成字面量，Tailwind JIT 才能扫到（不要改成 `bg-fn-${fn}` 拼接）。
 */

import type { SkillFunction } from '@/types/api';

export interface FunctionColorMeta {
  /** CSS 变量名（单测/图例说明用，样式统一走 dotClass） */
  token: `--fn-${string}`;
  /** 色相（°，与 spec 色相表一致；用于避开语义色区间） */
  hue: number;
  /** 色点背景类名（字面量，供 Tailwind 提取） */
  dotClass: string;
}

export const FUNCTION_COLORS: Record<SkillFunction, FunctionColorMeta> = {
  coding: { token: '--fn-coding', hue: 243, dotClass: 'bg-fn-coding' },
  writing: { token: '--fn-writing', hue: 36, dotClass: 'bg-fn-writing' },
  browser: { token: '--fn-browser', hue: 199, dotClass: 'bg-fn-browser' },
  data: { token: '--fn-data', hue: 165, dotClass: 'bg-fn-data' },
  devops: { token: '--fn-devops', hue: 12, dotClass: 'bg-fn-devops' },
  'ai-integration': { token: '--fn-ai', hue: 285, dotClass: 'bg-fn-ai-integration' },
  design: { token: '--fn-design', hue: 330, dotClass: 'bg-fn-design' },
  workflow: { token: '--fn-workflow', hue: 178, dotClass: 'bg-fn-workflow' },
  other: { token: '--fn-other', hue: 210, dotClass: 'bg-fn-other' },
};

/** 色点类名：未分类与非法值一律兜底到 other（灰），不抛错 */
export function functionDotClass(fn: SkillFunction | undefined): string {
  const meta = fn !== undefined ? FUNCTION_COLORS[fn] : undefined;
  return meta?.dotClass ?? FUNCTION_COLORS.other.dotClass;
}
