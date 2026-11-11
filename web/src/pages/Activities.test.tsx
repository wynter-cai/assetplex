/**
 * 活动页测试（add-activity-log）
 *
 * spec: 设计文档/changes/add-activity-log/specs/activity-feed.spec.md Scenario 6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Activities from './Activities';
import { api } from '@/lib/api';
import type { ActivityEntry } from '@/types/api';

const SYNC_ENTRY: ActivityEntry = {
  id: 'a1',
  at: '2026-11-11T10:00:00.000Z',
  type: 'sync',
  actor: 'web',
  summary: '同步完成：1 个工具成功、3 个条目已分发',
};

const IMPORT_ENTRY: ActivityEntry = {
  id: 'a2',
  at: '2026-11-10T09:00:00.000Z',
  type: 'import',
  actor: 'web',
  summary: '导入完成：新建 2、合并 0、覆盖 0、跳过 1',
};

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Activities />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('活动页', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getActivity').mockResolvedValue({ items: [SYNC_ENTRY, IMPORT_ENTRY], nextCursor: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('渲染时间线摘要与类型标签', async () => {
    renderPage();
    expect(await screen.findByText('同步完成：1 个工具成功、3 个条目已分发')).toBeInTheDocument();
    expect(screen.getByText('导入完成：新建 2、合并 0、覆盖 0、跳过 1')).toBeInTheDocument();
    expect(screen.getByText(/同步 · /)).toBeInTheDocument();
  });

  it('空日志展示空态文案，不伪造数据', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText(/还没有活动记录/)).toBeInTheDocument();
  });

  it('切换类型筛选后按 type 重新请求', async () => {
    renderPage();
    await screen.findByText(SYNC_ENTRY.summary);
    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    await waitFor(() => {
      expect(api.getActivity).toHaveBeenCalledWith({ limit: 20, type: 'import' });
    });
  });

  it('有更早记录时可加载更多并追加', async () => {
    vi.spyOn(api, 'getActivity')
      .mockResolvedValueOnce({ items: [SYNC_ENTRY], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [IMPORT_ENTRY], nextCursor: null });

    renderPage();
    expect(await screen.findByText(SYNC_ENTRY.summary)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

    expect(await screen.findByText(IMPORT_ENTRY.summary)).toBeInTheDocument();
    expect(api.getActivity).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-2' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
    });
  });
});
