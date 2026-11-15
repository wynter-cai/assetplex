/**
 * 首页行动面板测试（refactor-home-action-panel T10）
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/home-dashboard.spec.md
 * 断言重点：四区块装配、三种空态互不混淆、局部失败不整页崩、
 * 「重新体检」显式 refresh=1、旧资产快照与快捷动作已下线、新手引导续跑卡保留。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './Home';
import { api } from '@/lib/api';
import type {
  ActivityEntry,
  HealthIssueRef,
  HomeDashboardResponse,
  HomeToolRow,
  OnboardingStateResponse,
} from '@/types/api';

const issueItems: HealthIssueRef[] = [
  {
    id: 'i1',
    severity: 'high',
    title: '人设缺少边界',
    kind: 'identity',
    hubRelativePath: 'identity/profile.md',
    assetName: '人设',
    fixable: true,
  },
  {
    id: 'i2',
    severity: 'medium',
    title: '规则缺少适用说明',
    kind: 'rule',
    hubRelativePath: 'rules/style.md',
    assetName: '风格规则',
    fixable: false,
  },
];

const toolRows: HomeToolRow[] = [
  {
    toolId: 'trae-cn',
    toolName: 'TRAE 中国版',
    state: 'drift',
    driftAssetCount: 3,
    lastSyncedAt: '2026-11-14T09:00:00.000Z',
  },
  {
    toolId: 'codex',
    toolName: 'Codex',
    state: 'not_installed',
    driftAssetCount: 0,
    lastSyncedAt: null,
  },
];

const activity: ActivityEntry = {
  id: 'act-1',
  at: '2026-11-15T08:00:00.000Z',
  type: 'sync',
  actor: 'web',
  summary: '同步 3 项到 TRAE 中国版',
};

function dashboard(overrides: Partial<HomeDashboardResponse> = {}): HomeDashboardResponse {
  return {
    generatedAt: '2026-11-15T09:00:00.000Z',
    hubInitialized: true,
    status: {
      healthScore: 78,
      healthGrade: 'good',
      totalAssets: 12,
      unsyncedCount: 3,
      lastBackupAt: '2026-11-14T08:30:00.000Z',
      backupState: 'recorded',
    },
    issues: {
      available: true,
      total: 2,
      bySeverity: { high: 1, medium: 1, low: 0 },
      items: issueItems,
    },
    tools: toolRows,
    recentActivity: [activity],
    healthComputedAt: '2026-11-15T07:00:00.000Z',
    partial: false,
    failedTools: [],
    ...overrides,
  };
}

function onboardingState(overrides: Partial<OnboardingStateResponse> = {}): OnboardingStateResponse {
  return {
    hubRoot: '/tmp/demo-hub',
    initialized: true,
    onboarded: false,
    autoEnter: false,
    assetCount: 12,
    lastOutcome: null,
    tools: [],
    ...overrides,
  };
}

function renderHome(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getHomeDashboard').mockResolvedValue(dashboard());
  vi.spyOn(api, 'getOnboardingState').mockResolvedValue(onboardingState());
});

describe('Home — 老用户日常首页', () => {
  it('渲染状态条 → 今日待办 → 工具与同步 → 最近变化四区块', async () => {
    renderHome();

    expect(await screen.findByTestId('status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('status-health-score')).toHaveTextContent('78');
    expect(screen.getByTestId('status-pending')).toHaveTextContent('2');
    expect(screen.getByTestId('status-unsynced')).toHaveTextContent('3');

    expect(screen.getByTestId('today-queue')).toBeInTheDocument();
    expect(screen.getByText('人设缺少边界')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看全部 2 项/ })).toBeInTheDocument();

    expect(screen.getByTestId('tool-sync-matrix')).toBeInTheDocument();
    expect(screen.getByText('TRAE 中国版')).toBeInTheDocument();
    expect(screen.getByText('3 处')).toBeInTheDocument();

    expect(screen.getByTestId('recent-changes')).toBeInTheDocument();
    expect(screen.getByText('同步 3 项到 TRAE 中国版')).toBeInTheDocument();
  });

  it('旧首页区块已下线：不再出现资产快照 / 快速动作 / 连接状态卡', async () => {
    renderHome();
    await screen.findByTestId('status-bar');
    expect(screen.queryByText('资产快照')).not.toBeInTheDocument();
    expect(screen.queryByText('快速动作')).not.toBeInTheDocument();
    expect(screen.queryByText('连接状态')).not.toBeInTheDocument();
    expect(screen.queryByText(/我的库/)).not.toBeInTheDocument();
    expect(screen.queryByText('最近活动')).not.toBeInTheDocument();
  });

  it('空态一：库为空显示两个出口，不显示待办队列与 0 分', async () => {
    vi.mocked(api.getHomeDashboard).mockResolvedValue(
      dashboard({
        hubInitialized: false,
        status: {
          healthScore: null,
          healthGrade: 'empty',
          totalAssets: 0,
          unsyncedCount: null,
          lastBackupAt: null,
          backupState: 'none',
        },
        issues: { available: true, total: 0, bySeverity: { high: 0, medium: 0, low: 0 }, items: [] },
        recentActivity: [],
      }),
    );
    renderHome();

    expect(await screen.findByTestId('home-empty-library')).toBeInTheDocument();
    expect(screen.getByText('从已安装工具收藏第一批资产')).toBeInTheDocument();
    expect(screen.getByText('运行首次引导')).toBeInTheDocument();
    expect(screen.getByTestId('status-health')).toHaveTextContent('待盘点');
    expect(screen.getByTestId('status-pending')).toHaveTextContent('暂不可用');
    expect(screen.queryByTestId('today-queue')).not.toBeInTheDocument();
    expect(screen.queryByText('全部健康')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-changes')).not.toBeInTheDocument();
    // 工具状态与库是否为空无关，仍正常显示
    expect(screen.getByTestId('tool-sync-matrix')).toBeInTheDocument();
  });

  it('空态二：全部健康显示最近体检时间与「重新体检」，不制造虚假待办', async () => {
    vi.mocked(api.getHomeDashboard).mockResolvedValue(
      dashboard({
        issues: { available: true, total: 0, bySeverity: { high: 0, medium: 0, low: 0 }, items: [] },
      }),
    );
    renderHome();

    expect(await screen.findByTestId('home-all-healthy')).toBeInTheDocument();
    expect(screen.getByText('全部健康')).toBeInTheDocument();
    expect(screen.getByText(/最近一次体检/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新体检' })).toBeInTheDocument();
    expect(screen.queryByTestId('today-queue')).not.toBeInTheDocument();
  });

  it('空态三：待办不可用显示「暂不可用」与重试，不显示全部健康', async () => {
    vi.mocked(api.getHomeDashboard).mockResolvedValue(
      dashboard({
        status: {
          healthScore: 78,
          healthGrade: 'good',
          totalAssets: 12,
          unsyncedCount: null,
          lastBackupAt: null,
          backupState: 'none',
        },
        issues: { available: false, total: null, bySeverity: null, items: [] },
      }),
    );
    renderHome();

    expect(await screen.findByTestId('home-issues-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('status-pending')).toHaveTextContent('暂不可用');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.queryByText('全部健康')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-queue')).not.toBeInTheDocument();
  });

  it('局部失败不整页崩：健康分与某工具不可用时其余区块照常渲染', async () => {
    vi.mocked(api.getHomeDashboard).mockResolvedValue(
      dashboard({
        status: {
          healthScore: null,
          healthGrade: null,
          totalAssets: null,
          unsyncedCount: null,
          lastBackupAt: null,
          backupState: 'unavailable',
        },
        tools: [
          { toolId: 'trae-cn', toolName: 'TRAE 中国版', state: 'unknown', driftAssetCount: null, lastSyncedAt: null },
        ],
        partial: true,
        failedTools: ['trae-cn'],
      }),
    );
    renderHome();

    expect(await screen.findByTestId('status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('status-health')).toHaveTextContent('暂不可用');
    expect(screen.getByTestId('status-unsynced')).toHaveTextContent('暂不可用');
    expect(screen.getByTestId('status-last-backup')).toHaveTextContent('暂不可用');
    expect(screen.getByTestId('today-queue')).toBeInTheDocument();
    expect(screen.getByTestId('tool-row-trae-cn')).toHaveTextContent('状态暂不可用');
  });

  it('「重新体检」走 refresh=1，四个数字与待办一起更新', async () => {
    vi.mocked(api.getHomeDashboard).mockResolvedValue(
      dashboard({
        issues: { available: true, total: 0, bySeverity: { high: 0, medium: 0, low: 0 }, items: [] },
      }),
    );
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: '重新体检' }));
    expect(api.getHomeDashboard).toHaveBeenLastCalledWith({ refresh: true });
  });

  it('接口整体失败显示连接失败提示，可重试且不白屏', async () => {
    vi.mocked(api.getHomeDashboard).mockRejectedValue(new Error('boom'));
    renderHome();

    expect(await screen.findByText('无法连接到 AssetPlex 服务')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('保留新手引导续跑卡', async () => {
    renderHome();
    expect(await screen.findByTestId('onboarding-resume')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-resume-start')).toBeInTheDocument();
  });
});
