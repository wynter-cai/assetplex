/**
 * DiagnosisSummaryBar 测试（refactor-asset-pipeline T7）
 *
 * 四态文案、成本提示、未配置 AI 时的配置入口，以及「不点按钮不发请求」的纯展示约束。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosisSummaryBar } from './DiagnosisSummaryBar';
import type { DoctorSummaryResponse } from '@/types/api';

function summary(overrides: Partial<DoctorSummaryResponse> = {}): DoctorSummaryResponse {
  return {
    kind: 'identity',
    hubRelativePath: 'identity/profile.md',
    available: true,
    state: 'never',
    lastRun: null,
    staleReasons: [],
    aiConfigured: true,
    willCallModel: false,
    ...overrides,
  };
}

function renderBar(value: DoctorSummaryResponse | null, loading = false): { onDiagnose: ReturnType<typeof vi.fn>; onConfigureAi: ReturnType<typeof vi.fn> } {
  const onDiagnose = vi.fn();
  const onConfigureAi = vi.fn();
  render(
    <DiagnosisSummaryBar
      summary={value}
      loading={loading}
      diagnosing={false}
      onDiagnose={onDiagnose}
      onConfigureAi={onConfigureAi}
    />,
  );
  return { onDiagnose, onConfigureAi };
}

describe('DiagnosisSummaryBar', () => {
  it('never：说清没诊断过 + 主按钮叫「开始诊断」', () => {
    const { onDiagnose } = renderBar(summary());
    expect(screen.getByText('还没有诊断过这个资产')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));
    expect(onDiagnose).toHaveBeenCalledTimes(1);
  });

  it('有效：结论徽标 + 问题数 + 「结果有效（不会调用模型）」', () => {
    renderBar(
      summary({
        state: 'valid',
        lastRun: {
          overall: 'needs-attention',
          issueCount: 4,
          highSeverityCount: 1,
          fixableCount: 2,
          ignoredCount: 0,
          mechanicalOnly: false,
          rulesVersion: 'v1',
          model: 'demo-model',
          generatedAt: new Date().toISOString(),
        },
      }),
    );
    expect(screen.getByText('需关注')).toBeInTheDocument();
    expect(screen.getByText(/4 个问题（高 1）/)).toBeInTheDocument();
    expect(screen.getByText('结果有效（不会调用模型）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新诊断' })).toBeInTheDocument();
  });

  it('过期：逐项说明变化原因，仍展示上次结论', () => {
    renderBar(
      summary({
        state: 'stale',
        staleReasons: ['content', 'model'],
        lastRun: {
          overall: 'healthy',
          issueCount: 0,
          highSeverityCount: 0,
          fixableCount: 0,
          ignoredCount: 0,
          mechanicalOnly: false,
          rulesVersion: 'v1',
          model: 'demo-model',
          generatedAt: new Date().toISOString(),
        },
      }),
    );
    expect(screen.getByText(/上次结果，已过期（正文已变更 \/ 模型已更换）/)).toBeInTheDocument();
    expect(screen.getByText('健康')).toBeInTheDocument();
  });

  it('读取失败：摘要不可用不影响正文，按未诊断展示', () => {
    renderBar(summary({ available: false }));
    expect(screen.getByText(/摘要暂不可用/)).toBeInTheDocument();
  });

  it('将调用模型时明示成本；未配置 AI 时说明只跑机械与静态规则', () => {
    renderBar(summary({ state: 'stale', staleReasons: ['content'], willCallModel: true, aiConfigured: true }));
    expect(screen.getByText('本次将调用 1 次模型')).toBeInTheDocument();

    const { onConfigureAi } = renderBar(summary({ aiConfigured: false }));
    expect(screen.getByText(/语义未评估：仅机械与静态规则/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '配置 AI 端点' }));
    expect(onConfigureAi).toHaveBeenCalledTimes(1);
  });

  it('加载中：显示读取上次诊断，不显示假结论', () => {
    renderBar(null, true);
    expect(screen.getByText('读取上次诊断…')).toBeInTheDocument();
    expect(screen.queryByText('还没有诊断过这个资产')).not.toBeInTheDocument();
  });
});
