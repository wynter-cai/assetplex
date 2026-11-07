import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** 输入类元素上按 Escape 不触发，避免误关正在编辑的面板 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

export interface EscapeKeyOptions {
  /**
   * 浮层关闭后把焦点归还给该元素（enhance-a11y-responsive T7，keyboard Scenario 5）。
   * hook 在「active 变 true」的渲染时刻记录当时的 document.activeElement 作为触发元素；
   * 调用方也可以在打开时刻直接写入本 ref（面板打开即抢焦点的场合）。
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * 监听 Escape 键：active 为 true 时按下 Escape 触发回调。
 * 用于详情面板的键盘关闭；焦点在输入类元素内时不触发。
 * 提供 returnFocusRef 时，关闭后焦点自动归还触发元素（元素已不在文档则跳过）。
 */
export function useEscapeKey(
  active: boolean,
  onEscape: () => void,
  options?: EscapeKeyOptions,
): void {
  const returnFocusRef = options?.returnFocusRef;
  // 只在「打开」瞬间记一次，后续重渲染不得覆盖（面板内焦点移动是常态）
  const wasActive = useRef(false);
  const capturedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (active && !wasActive.current) {
      capturedRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const handle = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (isEditableTarget(e.target)) return;
      onEscape();
      const target = returnFocusRef?.current ?? capturedRef.current;
      if (target && target.isConnected) {
        target.focus();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, onEscape, returnFocusRef]);
}
