/**
 * 职能图例测试（spec skill-function-color「图例可查」）
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FunctionLegend } from './FunctionLegend';
import { FUNCTION_ORDER } from './skill-labels';

const COUNTS = {
  coding: 12,
  writing: 3,
  browser: 0,
  data: 5,
  devops: 1,
  'ai-integration': 4,
  design: 2,
  workflow: 6,
  other: 7,
} as const;

describe('FunctionLegend', () => {
  it('默认不渲染九行图例，不常驻占高度', () => {
    render(<FunctionLegend counts={COUNTS} />);
    expect(screen.queryByTestId('function-legend')).not.toBeInTheDocument();
  });

  it('点击「图例」展开九个职能的色点 + 名称 + 计数', () => {
    render(<FunctionLegend counts={COUNTS} />);
    fireEvent.click(screen.getByRole('button', { name: /图例/ }));
    const panel = screen.getByTestId('function-legend');
    expect(panel).toBeInTheDocument();
    for (const fn of FUNCTION_ORDER) {
      expect(panel.querySelector(`[data-function="${fn}"]`)).toBeTruthy();
    }
    expect(screen.getByText('编码开发')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('Esc 关闭，焦点回到「图例」按钮', () => {
    render(<FunctionLegend counts={COUNTS} />);
    const button = screen.getByRole('button', { name: /图例/ });
    fireEvent.click(button);
    expect(screen.getByTestId('function-legend')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('function-legend')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it('点击面板外部关闭', () => {
    render(<FunctionLegend counts={COUNTS} />);
    fireEvent.click(screen.getByRole('button', { name: /图例/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('function-legend')).not.toBeInTheDocument();
  });

  it('未传 counts 时计数按 0 展示，不抛错', () => {
    render(<FunctionLegend />);
    fireEvent.click(screen.getByRole('button', { name: /图例/ }));
    expect(screen.getByTestId('function-legend').textContent).toContain('0');
  });
});
