import { describe, it, expect, vi } from 'vitest';
import { useRef } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEscapeKey } from './use-escape-key';

function Harness({
  active,
  onEscape,
  captureReturnFocus,
}: {
  active: boolean;
  onEscape: () => void;
  /** 开关变 true 时记录当时的 document.activeElement（enhance-a11y-responsive T7） */
  captureReturnFocus?: boolean;
}): JSX.Element {
  const returnRef = useRef<HTMLElement | null>(null);
  useEscapeKey(active, onEscape, { returnFocusRef: returnRef });
  if (captureReturnFocus) {
    // 模拟调用方在「打开」时刻记录触发元素
    returnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  return <div data-testid="harness" />;
}

describe('useEscapeKey', () => {
  it('active 时按下 Escape 触发回调', () => {
    const onEscape = vi.fn();
    render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('非 active 时不触发', () => {
    const onEscape = vi.fn();
    render(<Harness active={false} onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('焦点在输入框时按 Escape 不触发（避免误关正在编辑的面板）', () => {
    const onEscape = vi.fn();
    render(
      <div>
        <input data-testid="field" />
        <Harness active onEscape={onEscape} />
      </div>,
    );
    const field = screen.getByTestId('field');
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('卸载后按键不再触发（监听器已移除）', () => {
    const onEscape = vi.fn();
    const { unmount } = render(<Harness active onEscape={onEscape} />);
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('active 从 false 变为 true 后开始监听', () => {
    const onEscape = vi.fn();
    const { rerender } = render(<Harness active={false} onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
    rerender(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  // enhance-a11y-responsive T7（keyboard Scenario 5）：Esc 关闭后焦点归还触发元素
  it('提供 returnFocusRef 时，Esc 关闭后焦点归还触发元素', () => {
    const onEscape = vi.fn();
    const { rerender } = render(
      <div>
        <button type="button" data-testid="trigger">
          打开详情
        </button>
        <button type="button" data-testid="other">其它按钮</button>
        <Harness active={false} onEscape={onEscape} captureReturnFocus />
      </div>,
    );
    screen.getByTestId('trigger').focus();
    // 触发元素已聚焦时面板打开（active 变 true）：此时记录到 ref 的就是触发元素
    rerender(
      <div>
        <button type="button" data-testid="trigger">
          打开详情
        </button>
        <button type="button" data-testid="other">其它按钮</button>
        <Harness active onEscape={onEscape} captureReturnFocus />
      </div>,
    );
    // 模拟面板打开后焦点已移走：归还必须显式回到触发元素，而不是停在别处
    screen.getByTestId('other').focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });

  it('未记录触发元素（ref 为空）时 Esc 不报错、不抓焦点', () => {
    const onEscape = vi.fn();
    render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.body);
  });
});
