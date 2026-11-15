/**
 * 首页工具与同步矩阵测试（refactor-home-action-panel T8）
 *
 * spec: specs/home-dashboard.spec.md Requirement 4
 * 断言重点：五种状态文案、漂移处数、未安装不可点、深链 /connections?tool=、
 * 无同步记录不冒充分数、一个工具都没有时的空态。
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToolSyncMatrix } from './ToolSyncMatrix';
import type { HomeToolRow } from '@/types/api';

function row(overrides: Partial<HomeToolRow> & { toolId: string }): HomeToolRow {
  return {
    toolName: overrides.toolId,
    state: 'synced',
    driftAssetCount: 0,
    lastSyncedAt: null,
    ...overrides,
  };
}

function renderMatrix(tools: HomeToolRow[]): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <ToolSyncMatrix tools={tools} />
    </MemoryRouter>,
  );
}

describe('ToolSyncMatrix — 工具与同步', () => {
  it('Scenario 4.1：五种状态各显示真实取值，漂移行带「N 处」', () => {
    renderMatrix([
      row({ toolId: 'a', toolName: '工具甲', state: 'synced' }),
      row({ toolId: 'b', toolName: '工具乙', state: 'drift', driftAssetCount: 3 }),
      row({ toolId: 'c', toolName: '工具丙', state: 'not_connected' }),
      row({ toolId: 'd', toolName: '工具丁', state: 'not_installed' }),
      row({ toolId: 'e', toolName: '工具戊', state: 'unknown', driftAssetCount: null }),
    ]);

    const syncedRow = screen.getByTestId('tool-row-a');
    expect(within(syncedRow).getByText('已同步')).toBeInTheDocument();

    const driftRow = screen.getByTestId('tool-row-b');
    expect(within(driftRow).getByText('有漂移')).toBeInTheDocument();
    expect(within(driftRow).getByText('3 处')).toBeInTheDocument();

    expect(within(screen.getByTestId('tool-row-c')).getByText('未连接')).toBeInTheDocument();
    expect(within(screen.getByTestId('tool-row-d')).getByText('未安装')).toBeInTheDocument();

    const unknownRow = screen.getByTestId('tool-row-e');
    expect(within(unknownRow).getByText('状态暂不可用')).toBeInTheDocument();
    expect(within(unknownRow).queryByText('0 处')).not.toBeInTheDocument();
    expect(screen.getByText('部分工具状态暂不可用')).toBeInTheDocument();
  });

  it('Scenario 4.2：最近同步时间取真实记录，从未同步显示「尚无同步记录」', () => {
    renderMatrix([
      row({ toolId: 'a', toolName: '工具甲', lastSyncedAt: '2026-11-13T09:20:00.000Z' }),
      row({ toolId: 'b', toolName: '工具乙', lastSyncedAt: null }),
    ]);

    expect(within(screen.getByTestId('tool-row-a')).getByText(/2026/)).toBeInTheDocument();
    expect(within(screen.getByTestId('tool-row-b')).getByText('尚无同步记录')).toBeInTheDocument();
  });

  it('Scenario 4.3：已安装行是链接，未安装行不可点', () => {
    renderMatrix([
      row({ toolId: 'trae-cn', toolName: '工具甲', state: 'drift', driftAssetCount: 2 }),
      row({ toolId: 'codex', toolName: '工具乙', state: 'not_installed' }),
    ]);

    expect(within(screen.getByTestId('tool-row-trae-cn')).getByRole('link')).toHaveAttribute(
      'href',
      '/connections?tool=trae-cn',
    );
    expect(within(screen.getByTestId('tool-row-codex')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('Scenario 4.4：底部「添加工具」跳 /connections', () => {
    renderMatrix([row({ toolId: 'a', toolName: '工具甲' })]);
    expect(screen.getByRole('link', { name: '添加工具' })).toHaveAttribute('href', '/connections');
  });

  it('Scenario 4.6：一个工具都没检测到显示空态与出口', () => {
    renderMatrix([]);
    expect(screen.getByText('未检测到已安装工具')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去连接工具' })).toHaveAttribute('href', '/connections');
  });
});
