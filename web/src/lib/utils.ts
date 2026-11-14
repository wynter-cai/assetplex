import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * 项目字号档位是数字键（text-12/13/14/16/18/20/24），tailwind-merge 默认不识别，
 * 会把 text-14 当成颜色类，合并时误删 text-primary-foreground 等颜色。
 * 显式登记为 font-size 组，保证「蓝底白字」不被 className 里的字号覆盖掉。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['12', '13', '14', '16', '18', '20', '24'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
