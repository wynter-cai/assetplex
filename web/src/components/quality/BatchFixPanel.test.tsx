/**
 * 跨类别批量修复面板测试（refactor-governance-center T6）
 *
 * spec: governance-center.spec.md Scenario 4.1–4.6；
 * 断言：影响清单先出、二次确认才执行、汇总与整批撤销、执行中禁止重复发起。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BatchFixPanel, formatKindDistribution } from './BatchFixPanel';
import { api } from '@/lib/api';
import type { RemediationApplyResponse, RemediationPlan } from '@/types/api';

function plan(overrides: Partial<RemediationPlan> = {}): RemediationPlan {
  return {
    items: [
      {
        id: 'skill:skills/demo-a/SKILL.md',
        kind: 'skill',
        hubRelativePath: 'skills/demo-a/SKILL.md',
        assetName: 'demo-a',
        issueIndexes: [0],
        ruleIds: ['SK-03'],
        issueSummary: 'description 缺少触发子句',
        severity: 'high',
        estimatedCalls: 1,
        cached: false,
      },
    ],
    skipped: [{ hubRelativePath: 'skills/demo-b/SKILL.md', assetName: 'demo-b', reason: '仅建议，需人工判断' }],
    totalAssets: 1,
    estimatedCalls: 1,
    truncated: false,
    batchLimit: 20,
    kindDistribution: { skill: 1 },
    nonBatchableCount: 2,
    generatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

function applyResponse(): RemediationApplyResponse {
  return {
    batchId: 'batch-demo',
    results: [
      { itemId: 'skill:skills/demo-a/SKILL.md', hubRelativePath: 'skills/demo-a/SKILL.md', status: 'fixed' },
    ],
    succeeded: 1,
    failed: 0,
    skipped: 0,
    rollbackAvailable: true,
  };
}

function renderPanel(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BatchFixPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('formatKindDistribution', () => {
  it('按类别输出「技能 3 / 规则 2」', () => {
    expect(formatKindDistribution({ skill: 3, rule: 2 })).toBe('技能 3 / 规则 2');
  });
});

describe('BatchFixPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getRemediationPlan').mockResolvedValue(plan());
    vi.spyOn(api, 'applyRemediation').mockResolvedValue(applyResponse());
    vi.spyOn(api, 'undoRemediation').mockResolvedValue({ restored: ['skills/demo-a/SKILL.md'], failures: [] });
  });

  it('先出影响清单：资产数、预计调用、规则、跳过原因与过滤说明（Scenario 4.1 / 4.2）', async () => {
    renderPanel();
    expect(await screen.findByText('将处理 1 个资产')).toBeInTheDocument();
    expect(screen.getByText('预计调用 1 次')).toBeInTheDocument();
    expect(screen.getByText('（技能 1）')).toBeInTheDocument();
    expect(screen.getByText('规则：SK-03')).toBeInTheDocument();
    expect(screen.getByText(/2 个资产的可修复项不满足当前圈选条件/)).toBeInTheDocument();
    expect(screen.getByText(/仅建议，需人工判断/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /应用修复/ })).not.toBeInTheDocument();
  });

  it('二次确认后才执行，执行后给汇总与整批撤销（Scenario 4.3 / 4.4 / 4.5）', async () => {
    renderPanel();
    await screen.findByText('将处理 1 个资产');
    await userEvent.click(screen.getByRole('button', { name: '确认修复这 1 个资产' }));
    expect(await screen.findByText('确认执行批量修复？')).toBeInTheDocument();
    expect(api.applyRemediation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '确认执行' }));
    await waitFor(() => expect(api.applyRemediation).toHaveBeenCalledTimes(1));
    expect(api.applyRemediation).toHaveBeenCalledWith({
      itemIds: ['skill:skills/demo-a/SKILL.md'],
      distribute: false,
    });

    const resultCard = await screen.findByTestId('batch-fix-result');
    expect(within(resultCard).getByText(/成功 1 · 失败 0 · 跳过 0/)).toBeInTheDocument();

    await userEvent.click(within(resultCard).getByRole('button', { name: /撤销整批/ }));
    await waitFor(() => expect(api.undoRemediation).toHaveBeenCalledWith('batch-demo'));
  });

  it('无可修复项时禁用发起（Scenario 4.1）', async () => {
    vi.spyOn(api, 'getRemediationPlan').mockResolvedValue(
      plan({ items: [], totalAssets: 0, estimatedCalls: 0, kindDistribution: {}, nonBatchableCount: 0 }),
    );
    renderPanel();
    expect(await screen.findByText('当前圈选没有可自动修复的问题。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认修复这 0 个资产' })).toBeDisabled();
  });

  it('执行失败如实报错，不伪造成功（Scenario 4.4）', async () => {
    vi.spyOn(api, 'applyRemediation').mockRejectedValue(new Error('写库失败'));
    renderPanel();
    await screen.findByText('将处理 1 个资产');
    await userEvent.click(screen.getByRole('button', { name: '确认修复这 1 个资产' }));
    await userEvent.click(await screen.findByRole('button', { name: '确认执行' }));
    expect(await screen.findByText('写库失败')).toBeInTheDocument();
    expect(screen.queryByTestId('batch-fix-result')).not.toBeInTheDocument();
  });
});
