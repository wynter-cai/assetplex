import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

/**
 * P1 refactor-design-system / design-tokens.spec.md
 * 语义色徽章必须走"浅底深字"令牌（bg-*-soft + text-*），
 * 不再使用饱和原色白字（green-500/yellow-500 白字对比度仅 2.2~2.3:1）。
 */
describe('Badge 语义色令牌', () => {
  it('success 变体使用令牌软底深字而非饱和原色', () => {
    render(<Badge variant="success">已同步</Badge>);
    const el = screen.getByText('已同步');
    expect(el.className).toContain('bg-success-soft');
    expect(el.className).toContain('text-success');
    expect(el.className).not.toMatch(/green-\d00/);
    expect(el.className).not.toContain('text-white');
  });

  it('warning 变体使用令牌软底深字而非饱和原色', () => {
    render(<Badge variant="warning">待同步</Badge>);
    const el = screen.getByText('待同步');
    expect(el.className).toContain('bg-warning-soft');
    expect(el.className).toContain('text-warning');
    expect(el.className).not.toMatch(/yellow-\d00/);
    expect(el.className).not.toContain('text-white');
  });

  it('default 变体跟随品牌 primary 令牌', () => {
    render(<Badge>默认</Badge>);
    expect(screen.getByText('默认').className).toContain('bg-primary');
    expect(screen.getByText('默认').className).toContain('text-primary-foreground');
  });
});
