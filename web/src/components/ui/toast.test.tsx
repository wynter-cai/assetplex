/**
 * Toaster 组件测试（fix-ui-trust-gaps T4）
 *
 * spec: feedback-toast.spec.md —— 三态渲染、明细折叠、手动关闭。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toaster } from './toast';
import { toast, useToastStore } from '@/lib/toast-store';

function renderToaster(): ReturnType<typeof render> {
  return render(<Toaster />);
}

beforeEach(() => {
  useToastStore.getState().reset();
});

describe('Toaster', () => {
  it('成功 toast 渲染标题与语义图标', () => {
    renderToaster();
    act(() => {
      toast.success('已保存');
    });
    expect(screen.getByText('已保存')).toBeInTheDocument();
    expect(screen.getByLabelText('成功')).toBeInTheDocument();
  });

  it('错误 toast 渲染错误语义与描述', () => {
    renderToaster();
    act(() => {
      toast.error('保存失败', { description: '网络异常，请稍后重试' });
    });
    expect(screen.getByText('保存失败')).toBeInTheDocument();
    expect(screen.getByText('网络异常，请稍后重试')).toBeInTheDocument();
    expect(screen.getByLabelText('错误')).toBeInTheDocument();
  });

  it('点关闭按钮移除该条 toast', () => {
    renderToaster();
    act(() => {
      toast.info('待关闭');
    });
    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }));
    expect(screen.queryByText('待关闭')).not.toBeInTheDocument();
  });

  it('明细超过 3 条时折叠，展开后显示全部', () => {
    renderToaster();
    act(() => {
      toast.error('收藏完成：成功 1 个，跳过 4 个', {
        details: ['a：已在我的库', 'b：已在我的库', 'c：冲突', 'd：404 未找到'],
      });
    });
    // 默认只显示前 3 条
    expect(screen.queryByText('d：404 未找到')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /查看详情/ });
    expect(toggle.textContent).toContain('还有 1 项');

    fireEvent.click(toggle);
    expect(screen.getByText('d：404 未找到')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument();
  });

  it('3 条以内明细不出现折叠按钮', () => {
    renderToaster();
    act(() => {
      toast.error('部分失败', { details: ['a：冲突', 'b：404'] });
    });
    expect(screen.queryByRole('button', { name: /查看详情|收起/ })).not.toBeInTheDocument();
    expect(screen.getByText('a：冲突')).toBeInTheDocument();
    expect(screen.getByText('b：404')).toBeInTheDocument();
  });

  it('带 action 时渲染动作按钮，点击后执行回调并移除 toast（spec inline-function-confirm）', () => {
    renderToaster();
    const onClick = vi.fn();
    act(() => {
      toast.success('已改为 数据处理', { action: { label: '撤销', onClick } });
    });
    const actionButton = screen.getByRole('button', { name: '撤销' });
    fireEvent.click(actionButton);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('已改为 数据处理')).not.toBeInTheDocument();
  });

  it('无 action 时不渲染动作按钮', () => {
    renderToaster();
    act(() => {
      toast.success('已保存');
    });
    expect(screen.queryByRole('button', { name: '撤销' })).not.toBeInTheDocument();
  });
});
