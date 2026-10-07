import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { PageHeader } from './PageHeader';

/**
 * 标准页头组件（spec refactor-design-system page-headers）：
 * 任一主要页面顶部呈现 H1 标题 + 一句话副标题 + 右侧操作区，H1 字号统一 20px 档。
 */
describe('PageHeader 标准页头', () => {
  it('渲染 H1 标题，字号统一 20px 档（text-20）', () => {
    render(<PageHeader title="技能" />);
    const h1 = screen.getByRole('heading', { level: 1, name: '技能' });
    expect(h1).toHaveClass('text-20');
  });

  it('有副标题时渲染在标题下方；无副标题时不渲染空段落', () => {
    const { rerender } = render(<PageHeader title="技能" subtitle="盘点与收藏技能" />);
    expect(screen.getByText('盘点与收藏技能')).toBeInTheDocument();
    rerender(<PageHeader title="技能" />);
    expect(screen.queryByText('盘点与收藏技能')).not.toBeInTheDocument();
  });

  it('操作区插槽渲染该页主操作', () => {
    render(<PageHeader title="技能" actions={<Button size="sm">新建技能</Button>} />);
    expect(screen.getByRole('button', { name: '新建技能' })).toBeInTheDocument();
  });
});
