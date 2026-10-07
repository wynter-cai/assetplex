/**
 * ErrorState 组件测试（fix-ui-trust-gaps T5）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('渲染默认的用户语言文案（不出现任何技术异常）', () => {
    render(<ErrorState />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('加载失败')).toBeInTheDocument();
    expect(screen.getByText(/请检查 AssetPlex 服务/)).toBeInTheDocument();
  });

  it('支持自定义标题与说明', () => {
    render(<ErrorState title="同步计划获取失败" description="服务暂时不可用" />);
    expect(screen.getByText('同步计划获取失败')).toBeInTheDocument();
    expect(screen.getByText('服务暂时不可用')).toBeInTheDocument();
  });

  it('点击重试触发 onRetry', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('未提供 onRetry 时不渲染按钮', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
