import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './AppLayout';

/**
 * enhance-a11y-responsive T5（keyboard Scenario 1，决策 D2）：
 * skip-link 是布局骨架的一部分，默认隐藏、聚焦可见、回车后焦点进主内容区。
 */
function renderLayout(): ReturnType<typeof render> {
  // Sidebar 依赖 useAssetCategories（react-query），测试壳必须带 QueryClientProvider
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/vault']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route path="vault" element={<div>资产库内容</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppLayout skip-link 与主内容地标', () => {
  it('存在「跳到主内容」链接，默认视觉隐藏（sr-only 1px 盒不占布局）', () => {
    renderLayout();

    const skip = screen.getByRole('link', { name: '跳到主内容' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(skip).toHaveClass('sr-only');
  });

  it('聚焦时弹为可见按钮（not-sr-only 重置裁剪与尺寸）', () => {
    renderLayout();

    const skip = screen.getByRole('link', { name: '跳到主内容' });
    expect(skip).toHaveClass('focus:not-sr-only');
    expect(skip).toHaveClass('focus:fixed');
  });

  it('激活 skip-link 后焦点落在主内容区，且主内容区有名字', () => {
    renderLayout();

    const skip = screen.getByRole('link', { name: '跳到主内容' });
    fireEvent.click(skip);

    const main = screen.getByRole('main', { name: '主内容' });
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(main);
  });
});
