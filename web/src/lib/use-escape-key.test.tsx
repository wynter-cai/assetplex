import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEscapeKey } from './use-escape-key';

function Harness({ active, onEscape }: { active: boolean; onEscape: () => void }): JSX.Element {
  useEscapeKey(active, onEscape);
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
});
