/**
 * 首跑向导页面测试（add-zero-config-onboarding T12–T16）
 *
 * spec Requirement 2/7/8：
 * - 盘点数量来自真实扫描
 * - 任一步跳过写 skipped 标记并进资产库
 * - 分发确认弹窗取消零写请求
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Onboarding from './Onboarding';
import { api } from '@/lib/api';
import type {
  AssetListResult,
  ImportResult,
  OnboardingStateResponse,
  ScanWithInsights,
} from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    getOnboardingState: vi.fn(),
    startOnboarding: vi.fn(),
    completeOnboarding: vi.fn(),
    scanToolsWithInsights: vi.fn(),
    executeImport: vi.fn(),
    listAssets: vi.fn(),
    getGovernanceHealth: vi.fn(),
    getAiClassifyConfig: vi.fn(),
    getTools: vi.fn(),
    getSyncPlan: vi.fn(),
    getDistributions: vi.fn(),
    runSync: vi.fn(),
  },
}));

function makeState(over: Partial<OnboardingStateResponse> = {}): OnboardingStateResponse {
  return {
    hubRoot: '/tmp/demo-hub',
    initialized: false,
    onboarded: false,
    autoEnter: true,
    assetCount: 0,
    lastOutcome: null,
    tools: [
      { toolId: 'trae-cn', displayName: 'TRAE CN', installed: true, configDir: '/tmp/demo/trae' },
    ],
    ...over,
  };
}

function makeScan(): ScanWithInsights {
  return {
    inventories: [
      {
        toolName: 'trae-cn',
        displayName: 'TRAE CN',
        installed: true,
        configDir: '/tmp/demo/trae',
        items: [
          {
            absolutePath: '/tmp/demo/trae/rules/a.md',
            relativePath: 'a.md',
            size: 10,
            modified: '2026-10-01T00:00:00.000Z',
            category: 'rule',
            hubTargetPath: 'rules/always/a.md',
            conflict: 'none',
            tool: 'trae-cn',
            binary: false,
          },
          {
            absolutePath: '/tmp/demo/trae/skills/b.md',
            relativePath: 'b.md',
            size: 10,
            modified: '2026-10-01T00:00:00.000Z',
            category: 'skill',
            hubTargetPath: 'skills/b.md',
            conflict: 'none',
            tool: 'trae-cn',
            binary: false,
          },
        ],
      },
    ],
    insights: {
      duplicateGroups: [],
      versionMismatchGroups: [],
      coverageGroups: [],
      installedTools: ['trae-cn'],
    },
  };
}

function makeImportResult(): ImportResult {
  return {
    success: true,
    created: 2,
    merged: 0,
    overwritten: 0,
    skipped: 0,
    errors: 0,
    items: [],
  };
}

function renderPage(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/vault" element={<div>vault-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getOnboardingState).mockReset();
  vi.mocked(api.startOnboarding).mockReset();
  vi.mocked(api.completeOnboarding).mockReset();
  vi.mocked(api.scanToolsWithInsights).mockReset();
  vi.mocked(api.executeImport).mockReset();
  vi.mocked(api.listAssets).mockReset();
  vi.mocked(api.getGovernanceHealth).mockReset();
  vi.mocked(api.getAiClassifyConfig).mockReset();
  vi.mocked(api.getTools).mockReset();
  vi.mocked(api.getSyncPlan).mockReset();
  vi.mocked(api.getDistributions).mockReset();
  vi.mocked(api.runSync).mockReset();

  vi.mocked(api.getOnboardingState).mockResolvedValue(makeState());
  vi.mocked(api.startOnboarding).mockResolvedValue({
    created: [],
    skipped: [],
    state: makeState({ initialized: true }),
  });
  vi.mocked(api.completeOnboarding).mockResolvedValue({
    ok: true,
    persisted: true,
    state: makeState({ onboarded: true, autoEnter: false }),
  });
  vi.mocked(api.scanToolsWithInsights).mockResolvedValue(makeScan());
  vi.mocked(api.executeImport).mockResolvedValue(makeImportResult());
  vi.mocked(api.listAssets).mockResolvedValue({ items: [], total: 2 } as AssetListResult);
});

describe('Onboarding 向导（T12–T16）', () => {
  it('盘点展示真实工具与数量，结果页显示真实总数', async () => {
    renderPage();
    await screen.findByTestId('onboarding-welcome');
    fireEvent.click(screen.getByTestId('onboarding-start'));

    await screen.findByTestId('onboarding-scan');
    await waitFor(() => expect(screen.getByTestId('scan-count-trae-cn')).toHaveTextContent('2'));
    fireEvent.click(await screen.findByTestId('onboarding-scan-next'));

    await screen.findByTestId('onboarding-result');
    expect(screen.getByText(/盘点完成，你有/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('2');
  });

  it('欢迎屏跳过：写 skipped 标记并进资产库', async () => {
    renderPage();
    await screen.findByTestId('onboarding-welcome');
    fireEvent.click(screen.getByText('跳过，直接进入资产库'));

    await screen.findByText('vault-page');
    expect(api.completeOnboarding).toHaveBeenCalledWith({ outcome: 'skipped', step: 'welcome' });
  });

  it('分发确认弹窗取消：零写请求且停留在分发屏', async () => {
    vi.mocked(api.getTools).mockResolvedValue({
      tools: [
        {
          name: 'claude',
          installed: true,
          configDirExists: true,
          configDir: '/tmp/demo/claude',
          enabled: true,
        },
      ],
    });
    vi.mocked(api.getSyncPlan).mockResolvedValue({
      plans: [
        {
          tool: 'claude',
          toolInstalled: true,
          items: [
            {
              item: {
                type: 'rule',
                relativePath: 'rules/always/a.md',
                absolutePath: '/tmp/demo-hub/rules/always/a.md',
              },
              target: {
                tool: 'claude',
                targetPath: '/tmp/demo/claude/rules/a.md',
                strategy: 'copy',
                isDirectory: false,
              },
              action: 'copy',
              targetExists: false,
            },
          ],
        },
      ],
    });
    vi.mocked(api.getDistributions).mockResolvedValue({
      generatedAt: '2026-10-01T00:00:00.000Z',
      cached: false,
      partial: false,
      failedTools: [],
      index: {},
      projectTools: [],
    });
    vi.mocked(api.getGovernanceHealth).mockRejectedValue(new Error('暂不可用'));
    vi.mocked(api.getAiClassifyConfig).mockRejectedValue(new Error('暂不可用'));

    renderPage();
    await screen.findByTestId('onboarding-welcome');
    fireEvent.click(screen.getByTestId('onboarding-start'));

    fireEvent.click(await screen.findByTestId('onboarding-scan-next'));
    fireEvent.click(await screen.findByTestId('onboarding-collect-start'));
    fireEvent.click(await screen.findByTestId('onboarding-collect-confirm'));

    fireEvent.click(await screen.findByTestId('onboarding-collect-next'));
    fireEvent.click(await screen.findByTestId('onboarding-doctor-next'));

    const openConfirm = await screen.findByTestId('distribute-open-confirm');
    await waitFor(() => expect(openConfirm).not.toBeDisabled());
    fireEvent.click(openConfirm);
    fireEvent.click(await screen.findByTestId('distribute-cancel'));

    expect(api.runSync).not.toHaveBeenCalled();
    expect(screen.getByTestId('onboarding-distribute')).toBeTruthy();
  });
});
