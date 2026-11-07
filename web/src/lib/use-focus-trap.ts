import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 轻量焦点陷阱（enhance-a11y-responsive T9/D4，keyboard Scenario 4）：
 * 启用时焦点进容器首个可聚焦元素，Tab/Shift+Tab 在容器内循环，Esc 触发 onEscape。
 * 关闭后的焦点归还由调用方负责；回调走 ref，避免内联函数导致重绑监听与重抢焦点。
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onEscape?: () => void,
): void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const items = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    (items()[0] ?? container).focus();

    const handle = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') return escapeRef.current?.();
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) return e.preventDefault();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const back = index <= 0 ? list.length - 1 : index - 1;
      const forward = index === -1 || index === list.length - 1 ? 0 : index + 1;
      // 拦下浏览器默认 Tab：否则焦点会跳出容器
      e.preventDefault();
      list[e.shiftKey ? back : forward].focus();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [containerRef, enabled]);
}
