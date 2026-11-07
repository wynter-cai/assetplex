/**
 * 全局 toast 队列（fix-ui-trust-gaps T4）
 *
 * 零新依赖：zustand 已在 web 依赖中。
 * 三态：success（3s）/ info（3.5s）/ error（6s 长驻，可手动关闭）。
 * 同 变体+标题+描述 自动去重；队列上限 5 条。
 * 视图组件见 @/components/ui/toast。
 */

import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

/** toast 内动作按钮（refine-skill-cards-wizard T6，spec inline-function-confirm） */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** 带动作的 toast 最短存活时长：动作是「可撤销」入口，不能 3 秒就消失 */
export const ACTION_MIN_DURATION = 30_000;

export interface ToastOptions {
  description?: string;
  /** 批量操作的逐项明细（如失败项名称：原因），视图默认展示前 3 条 */
  details?: string[];
  /** 覆盖默认自动关闭时长（毫秒） */
  duration?: number;
  /** 动作按钮（如「撤销」）；给定后时长下限为 ACTION_MIN_DURATION */
  action?: ToastAction;
}

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  details: string[];
  duration: number;
  action?: ToastAction;
}

export const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3000,
  info: 3500,
  error: 6000,
};

/** 队列同时保留的最大条数（超出丢弃最早的） */
const MAX_TOASTS = 5;

interface ToastStore {
  toasts: ToastItem[];
  push: (variant: ToastVariant, title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  reset: () => void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `toast-${Date.now()}-${seq}`;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (variant, title, options) => {
    const id = nextId();
    const action = options?.action;
    // 有动作时取「30 秒下限」与显式 duration 的较大值；无动作维持三态默认时长
    const duration =
      action === undefined
        ? (options?.duration ?? DEFAULT_DURATION[variant])
        : Math.max(options?.duration ?? 0, ACTION_MIN_DURATION);
    const item: ToastItem = {
      id,
      variant,
      title,
      description: options?.description,
      details: options?.details ?? [],
      duration,
      ...(action !== undefined ? { action } : {}),
    };
    set((state) => {
      // 同内容去重：移除旧的同款 toast，以新实例顶替
      const deduped = state.toasts.filter(
        (t) =>
          !(
            t.variant === variant &&
            t.title === title &&
            (t.description ?? '') === (item.description ?? '')
          ),
      );
      return { toasts: [...deduped, item].slice(-MAX_TOASTS) };
    });
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  reset: () => set({ toasts: [] }),
}));

/** 命令式调用入口（在 React 组件外也可用，如 mutation 回调） */
export const toast = {
  success: (title: string, options?: ToastOptions): string =>
    useToastStore.getState().push('success', title, options),
  error: (title: string, options?: ToastOptions): string =>
    useToastStore.getState().push('error', title, options),
  info: (title: string, options?: ToastOptions): string =>
    useToastStore.getState().push('info', title, options),
};
