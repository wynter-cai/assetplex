/**
 * 首页状态条测试（refactor-home-action-panel T6）
 *
 * spec: specs/home-dashboard.spec.md Requirement 1
 * 断言重点：四个数字、三个下钻、上次备份不可点、单块不可用不填 0、库为空显示「待盘点」。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatusBar } from './StatusBar';
import type { HomeStatusNumbers } from '@/types/api';

function status(overrides: Partial<HomeStatusNumbers> = {}): HomeStatusNumbers {
  return {
    healthScore: 78,
    healthGrade: 'good',
    totalAssets: 20,
    unsyncedCount: 3,
    lastBackupAt: '2026-11-14T08:30:00.000Z',
    backupState: 'recorded',
    ...overrides,
  };
}

function renderBar(props: {
  status: HomeStatusNumbers;
  pendingCount: number | null;
}): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <StatusBar {...props} />
    </MemoryRouter>,
  );
}

describe('StatusBar — 状态条', () => {
  it('Scenario 1.1：一行渲染健康分 / 待治理 / 未同步 / 上次备份', () => {
    renderBar({ status: status(), pendingCount: 12 });
    expect(screen.getByTestId('status-health-score')).toHaveTextContent('78');
    expect(screen.getByText('状态良好')).toBeInTheDocument();
    expect(screen.getByTestId('status-pending')).toHaveTextContent('12');
    expect(screen.getByTestId('status-unsynced')).toHaveTextContent('3');
    expect(screen.getByTestId('status-last-backup')).toHaveTextContent('2026');
    // 不出现资产总数
    expect(screen.queryByText(/资产总数/)).not.toBeInTheDocument();
  });

  it('Scenario 1.2：健康分与待治理下钻 /quality，未同步下钻 /sync', () => {
    renderBar({ status: status(), pendingCount: 12 });
    expect(screen.getByRole('link', { name: /健康分/ })).toHaveAttribute('href', '/quality');
    expect(screen.getByRole('link', { name: /待治理/ })).toHaveAttribute('href', '/quality');
    expect(screen.getByRole('link', { name: /未同步/ })).toHaveAttribute('href', '/sync');
  });

  it('Scenario 1.2：上次备份是只读文本，不渲染成链接', () => {
    renderBar({ status: status(), pendingCount: 12 });
    const backup = screen.getByTestId('status-last-backup');
    expect(backup.closest('a')).toBeNull();
    expect(screen.queryByRole('link', { name: /上次备份/ })).not.toBeInTheDocument();
  });

  it('Scenario 1.4：单个数字不可用显示「暂不可用」，其余正常', () => {
    renderBar({ status: status({ unsyncedCount: null }), pendingCount: 12 });
    expect(screen.getByTestId('status-unsynced')).toHaveTextContent('暂不可用');
    expect(screen.getByTestId('status-unsynced')).not.toHaveTextContent('0');
    expect(screen.getByTestId('status-health-score')).toHaveTextContent('78');
    expect(screen.getByTestId('status-pending')).toHaveTextContent('12');
  });

  it('待治理不可用显示「暂不可用」，不填 0', () => {
    renderBar({ status: status(), pendingCount: null });
    expect(screen.getByTestId('status-pending')).toHaveTextContent('暂不可用');
    expect(screen.getByTestId('status-pending')).not.toHaveTextContent('0');
  });

  it('Scenario 1.3：库为空显示「待盘点」，不显示 0 分', () => {
    renderBar({
      status: status({ healthScore: null, healthGrade: 'empty', totalAssets: 0 }),
      pendingCount: null,
    });
    expect(screen.getByTestId('status-health')).toHaveTextContent('待盘点');
    expect(screen.queryByTestId('status-health-score')).not.toBeInTheDocument();
  });

  it('健康分读取失败显示「暂不可用」，不显示默认分', () => {
    renderBar({
      status: status({ healthScore: null, healthGrade: 'at-risk' }),
      pendingCount: 5,
    });
    expect(screen.getByTestId('status-health')).toHaveTextContent('暂不可用');
    expect(screen.queryByTestId('status-health-score')).not.toBeInTheDocument();
  });

  it('从未备份显示「尚无备份」，备份读取失败显示「暂不可用」', () => {
    const { unmount } = renderBar({
      status: status({ backupState: 'none', lastBackupAt: null }),
      pendingCount: 0,
    });
    expect(screen.getByTestId('status-last-backup')).toHaveTextContent('尚无备份');
    unmount();

    renderBar({
      status: status({ backupState: 'unavailable', lastBackupAt: null }),
      pendingCount: 0,
    });
    expect(screen.getByTestId('status-last-backup')).toHaveTextContent('暂不可用');
  });
});
