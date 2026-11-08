/**
 * 一键整改弹窗测试（add-asset-governance I4）
 *
 * spec: specs/asset-health-score.spec.md Scenario 7/8/9
 * 断言重点：先计划后执行（未点确认绝不写库）、只提交勾选项且默认只改库、
 * 执行后给成功/失败/跳过汇总、可撤销本批。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemediationDialog } from './RemediationDialog';
import { api } from '@/lib/api';
import type { RemediationApplyResponse, RemediationPlan } from '@/types/api';

function planFixture(): RemediationPlan {
  return {
    items: [
      {
        id: 'item-a',
        kind: 'skill',
        hubRelativePath: 'skills/demo-skill-a/SKILL.md',
        assetName: 'demo-skill-a',
        issueIndexes: [0],
        issueSummary: 'description 为空',
        severity: 'high',
        estimatedCalls: 1,
        cached: false,
      },
      {
        id: 'item-b',
        kind: 'rule',
        hubRelativePath: 'rules/demo-rule.md',
        assetName: 'demo-rule',
        issueIndexes: [1],
        issueSummary: '缺少优先级说明',
        severity: 'medium',
        estimatedCalls: 0,
        cached: true,
      },
    ],
    skipped: [
      { hubRelativePath: 'skills/demo-skill-b/SKILL.md', assetName: 'demo-skill-b', reason: '仅建议，需人工判断' },
    ],
    totalAssets: 3,
    estimatedCalls: 1,
    truncated: false,
    batchLimit: 20,
    generatedAt: '2026-11-08T00:00:00.000Z',
  };
}

const applyResponse: RemediationApplyResponse = {
  batchId: 'abcdef12-3456-7890',
  results: [
    { itemId: 'item-a', hubRelativePath: 'skills/demo-skill-a/SKILL.md', status: 'fixed', backupRef: 'demo-backup' },
    { itemId: 'item-b', hubRelativePath: 'rules/demo-rule.md', status: 'failed', reason: '草案生成失败' },
  ],
  succeeded: 1,
  failed: 1,
  skipped: 0,
  rollbackAvailable: true,
};

function renderDialog(onCompleted = vi.fn()): ReturnType<typeof render> {
  return render(<RemediationDialog onClose={vi.fn()} onCompleted={onCompleted} />);
}

describe('RemediationDialog', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getRemediationPlan').mockResolvedValue(planFixture());
    vi.spyOn(api, 'applyRemediation').mockResolvedValue(applyResponse);
    vi.spyOn(api, 'undoRemediation').mockResolvedValue({ restored: ['skills/demo-skill-a/SKILL.md'], failures: [] });
  });

  it('Scenario 7：先出计划（默认全选、估算调用、不可修复项折叠），未点确认前不写库', async () => {
    renderDialog();
    expect(await screen.findByText('demo-skill-a')).toBeInTheDocument();
    expect(screen.getByText(/共 3 个资产可整改/)).toBeInTheDocument();
    expect(screen.getByText(/1 项不在本批范围/)).toBeInTheDocument();
    expect(screen.getByText('已选 2 项 · 预计调用 1 次模型')).toBeInTheDocument();
    expect(api.applyRemediation).not.toHaveBeenCalled();
  });

  it('Scenario 7：取消勾选的资产不进本批；确认后默认只改库（distribute=false）', async () => {
    renderDialog();
    await screen.findByText('demo-skill-a');
    await userEvent.click(screen.getByRole('checkbox', { name: '选择 demo-skill-a' }));
    expect(screen.getByText('已选 1 项 · 预计调用 0 次模型')).toBeInTheDocument();

    await userEvent.click(screen.getByText('确认执行（只改库）'));
    await waitFor(() => expect(api.applyRemediation).toHaveBeenCalledTimes(1));
    expect(api.applyRemediation).toHaveBeenCalledWith({ itemIds: ['item-b'], distribute: false });
  });

  it('Scenario 8：执行后汇总成功/失败/跳过，并通知首页刷新', async () => {
    const onCompleted = vi.fn();
    renderDialog(onCompleted);
    await screen.findByText('demo-skill-a');
    await userEvent.click(screen.getByText('确认执行（只改库）'));

    expect(await screen.findByText('成功 1 / 失败 1 / 跳过 0')).toBeInTheDocument();
    expect(screen.getByText(/rules\/demo-rule\.md · 失败：草案生成失败/)).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('Scenario 9：可撤销本批，撤销后展示恢复结果', async () => {
    renderDialog();
    await screen.findByText('demo-skill-a');
    await userEvent.click(screen.getByText('确认执行（只改库）'));
    await userEvent.click(await screen.findByText('撤销本批'));

    await waitFor(() => expect(api.undoRemediation).toHaveBeenCalledWith('abcdef12-3456-7890'));
    expect(await screen.findByRole('button', { name: '已恢复 1 项' })).toBeInTheDocument();
  });
});
