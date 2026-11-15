/**
 * 首页最近变化测试（refactor-home-action-panel T9）
 *
 * spec: specs/home-dashboard.spec.md Requirement 5
 * 断言重点：固定最多 5 条、时间倒序、类型与摘要、空态保留「查看全部」。
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecentChanges } from './RecentChanges';
import type { ActivityEntry, ActivityType } from '@/types/api';

function entry(
  id: string,
  at: string,
  type: ActivityType = 'sync',
  summary = `记录 ${id}`,
): ActivityEntry {
  return { id, at, type, actor: 'web', summary };
}

function renderChanges(activities: ActivityEntry[]): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <RecentChanges activities={activities} />
    </MemoryRouter>,
  );
}

describe('RecentChanges — 最近变化', () => {
  it('Scenario 5.1 / 5.2：最多 5 条、时间倒序、含时间与类型摘要', () => {
    renderChanges([
      entry('a', '2026-11-10T08:00:00.000Z', 'import'),
      entry('b', '2026-11-14T08:00:00.000Z', 'sync'),
      entry('c', '2026-11-12T08:00:00.000Z', 'edit'),
      entry('d', '2026-11-15T08:00:00.000Z', 'create'),
      entry('e', '2026-11-11T08:00:00.000Z', 'sync'),
      entry('f', '2026-11-09T08:00:00.000Z', 'sync'),
      entry('g', '2026-11-13T08:00:00.000Z', 'sync'),
    ]);

    const rows = screen.getAllByTestId(/^recent-change-/);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'recent-change-d',
      'recent-change-b',
      'recent-change-g',
      'recent-change-c',
      'recent-change-e',
    ]);
    expect(within(rows[0]).getByText('新建')).toBeInTheDocument();
    expect(within(rows[1]).getByText('同步')).toBeInTheDocument();
    expect(within(rows[1]).getByText('记录 b')).toBeInTheDocument();
    expect(rows[0].textContent).toMatch(/2026/);
    expect(screen.queryByText('加载更多')).not.toBeInTheDocument();
  });

  it('Scenario 5.3：无记录显示空态，仍保留「查看全部」', () => {
    renderChanges([]);
    expect(screen.getByText('还没有操作记录')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看全部' })).toHaveAttribute('href', '/activities');
  });

  it('Scenario 5.1：有记录时「查看全部」跳 /activities', () => {
    renderChanges([entry('a', '2026-11-15T08:00:00.000Z')]);
    expect(screen.getByRole('link', { name: '查看全部' })).toHaveAttribute('href', '/activities');
  });
});
