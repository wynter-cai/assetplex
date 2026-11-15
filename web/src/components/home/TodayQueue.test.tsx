/**
 * 首页今日待办队列测试（refactor-home-action-panel T7）
 *
 * spec: specs/home-dashboard.spec.md Requirement 2
 * 断言重点：严重度排序与截断、total 与状态条同源、就地展开体检报告、Esc 归还焦点、
 * 0 条交给上层空态、不出现治理中心才有的动作。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TodayQueue } from './TodayQueue';
import { api } from '@/lib/api';
import type { DiagnosisReport, HealthIssueRef, HomeIssueQueue } from '@/types/api';

function issue(overrides: Partial<HealthIssueRef> & { id: string }): HealthIssueRef {
  return {
    severity: 'medium',
    title: `问题 ${overrides.id}`,
    kind: 'identity',
    hubRelativePath: `identity/${overrides.id}.md`,
    assetName: overrides.id,
    fixable: false,
    ...overrides,
  };
}

function queue(items: HealthIssueRef[], total = items.length): HomeIssueQueue {
  return {
    available: true,
    total,
    bySeverity: { high: 0, medium: 0, low: 0 },
    items,
  };
}

const report: DiagnosisReport = {
  kind: 'identity',
  hubRelativePath: 'identity/A.md',
  overall: 'needs-attention',
  issues: [],
  criteriaUsed: [],
  criteriaSkipped: 0,
  cached: false,
  mechanicalOnly: true,
  model: '',
  generatedAt: '2026-11-15T00:00:00.000Z',
};

function renderQueue(issues: HomeIssueQueue): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TodayQueue issues={issues} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'doctorDiagnose').mockResolvedValue(report);
});

describe('TodayQueue — 今日待办', () => {
  it('Scenario 2.1：高危在前、同严重度按资产名排序，只展示前 5 条', () => {
    renderQueue(
      queue([
        issue({ id: 'e', assetName: 'E', severity: 'low' }),
        issue({ id: 'b', assetName: 'B', severity: 'high' }),
        issue({ id: 'c', assetName: 'C', severity: 'medium' }),
        issue({ id: 'd', assetName: 'A', severity: 'high' }),
        issue({ id: 'f', assetName: 'F', severity: 'medium' }),
        issue({ id: 'g', assetName: 'G', severity: 'high' }),
        issue({ id: 'h', assetName: 'D', severity: 'low' }),
      ]),
    );

    const rows = screen.getAllByTestId('queue-item');
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => within(row).getByText(/^[A-G]$/).textContent)).toEqual([
      'A',
      'B',
      'G',
      'C',
      'F',
    ]);
    // total 是全量去重后的 7，不是当前渲染的 5 条
    expect(screen.getByRole('link', { name: /查看全部 7 项/ })).toHaveAttribute('href', '/governance');
  });

  it('Scenario 2.2：行内含严重度、标题、资产名与「查看」，不出现治理中心动作', () => {
    renderQueue(queue([issue({ id: 'A', severity: 'high', title: '人设缺少边界' })]));
    const row = screen.getByTestId('queue-item');
    expect(within(row).getByText('高')).toBeInTheDocument();
    expect(within(row).getByText('人设缺少边界')).toBeInTheDocument();
    expect(within(row).getByText('A')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '查看' })).toBeInTheDocument();
    expect(screen.queryByText('忽略')).not.toBeInTheDocument();
    expect(screen.queryByText('稍后')).not.toBeInTheDocument();
    expect(screen.queryByText('一键修复')).not.toBeInTheDocument();
  });

  it('Scenario 2.2 / 2.4：可修复项额外给出「去资产库修改」，类别不可映射回退 /vault', () => {
    renderQueue(
      queue([
        issue({ id: 'A', kind: 'rule', fixable: true }),
        issue({ id: 'B', kind: 'command', fixable: true }),
        issue({ id: 'C', kind: 'rule', fixable: false }),
      ]),
    );
    const rows = screen.getAllByTestId('queue-item');
    expect(within(rows[0]).getByRole('link', { name: '去资产库修改' })).toHaveAttribute(
      'href',
      '/vault/rule',
    );
    expect(within(rows[1]).getByRole('link', { name: '去资产库修改' })).toHaveAttribute(
      'href',
      '/vault',
    );
    expect(within(rows[2]).queryByRole('link', { name: '去资产库修改' })).not.toBeInTheDocument();
  });

  it('Scenario 2.3：点「查看」就地展开体检报告，不跳页', async () => {
    renderQueue(queue([issue({ id: 'A' })]));
    await userEvent.click(screen.getByRole('button', { name: '查看' }));
    expect(await screen.findByRole('region', { name: '体检报告' })).toBeInTheDocument();
    expect(api.doctorDiagnose).toHaveBeenCalledWith({
      kind: 'identity',
      hubRelativePath: 'identity/A.md',
    });
  });

  it('Scenario 2.6：Esc 关闭报告并把焦点还给触发它的条目', async () => {
    renderQueue(queue([issue({ id: 'A' })]));
    const trigger = screen.getByRole('button', { name: '查看' });
    await userEvent.click(trigger);
    await screen.findByRole('region', { name: '体检报告' });

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: '体检报告' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '查看' }));
  });

  it('Scenario 2.6：上下方向键在条目间移动焦点', async () => {
    renderQueue(queue([issue({ id: 'A' }), issue({ id: 'B' })]));
    const [first, second] = screen.getAllByRole('button', { name: '查看' });
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(second);
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(first);
  });

  it('0 条或数据不可用时交给上层空态，不渲染队列', () => {
    const { unmount } = renderQueue(queue([]));
    expect(screen.queryByTestId('today-queue')).not.toBeInTheDocument();
    unmount();

    renderQueue({ available: false, total: null, bySeverity: null, items: [] });
    expect(screen.queryByTestId('today-queue')).not.toBeInTheDocument();
  });
});
