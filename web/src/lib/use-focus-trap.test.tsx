import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { useFocusTrap } from './use-focus-trap';

/**
 * enhance-a11y-responsive T9（keyboard Scenario 4）：
 * 不能引第三方依赖，40 行内实现「Tab 在容器内循环 + Esc 回调」。
 */
function Drawer({
  enabled,
  onEscape,
}: {
  enabled: boolean;
  onEscape?: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, enabled, onEscape);
  return (
    <div>
      <button type="button" data-testid="outside">
        外部按钮
      </button>
      <div ref={ref} data-testid="drawer" tabIndex={-1}>
        <a href="#first" data-testid="first">
          第一个
        </a>
        <button type="button" data-testid="second">
          第二个
        </button>
        <button type="button" data-testid="last">
          最后一个
        </button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('启用时焦点自动落到容器内第一个可聚焦元素', () => {
    render(<Drawer enabled />);
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('Tab 到最后一个后循环回第一个，焦点不逃出容器', () => {
    render(<Drawer enabled />);
    const last = screen.getByTestId('last');
    last.focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('Shift+Tab 在第一个上循环到最后一个', () => {
    render(<Drawer enabled />);
    screen.getByTestId('first').focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId('last'));
  });

  it('普通 Tab 前进到下一个元素', () => {
    render(<Drawer enabled />);
    screen.getByTestId('first').focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('second'));
  });

  it('按下 Escape 触发回调', () => {
    const onEscape = vi.fn();
    render(<Drawer enabled onEscape={onEscape} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('未启用时不抢焦点、不拦截 Tab', () => {
    render(<Drawer enabled={false} />);
    const outside = screen.getByTestId('outside');
    outside.focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(outside);
  });
});
