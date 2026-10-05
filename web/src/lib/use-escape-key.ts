import { useEffect } from 'react';

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

/**
 * 监听 Escape 键：active 为 true 时按下 Escape 触发回调。
 * 用于详情面板的键盘关闭；焦点在输入类元素内时不触发。
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handle = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (isEditableTarget(e.target)) return;
      onEscape();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, onEscape]);
}
