/**
 * 健康分下钻问题清单测试（add-asset-governance H4）
 *
 * spec: specs/asset-health-score.spec.md Scenario 6
 * 断言：问题清单可读、点条目就地展开体检报告（自动发起诊断）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HealthIssuesPanel } from './HealthIssuesPanel';
import { api } from '@/lib/api';
import type { DiagnosisReport, GovernanceIssueList, HealthIssueRef } from '@/types/api';

function issue(overrides: Partial<HealthIssueRef> = {}): HealthIssueRef {
  return {
    id: 'quality:skills/demo-skill-a/SKILL.md:mechanical:description-empty:0',
    severity: 'high',
    title: 'description 为空',
    kind: 'skill',
    hubRelativePath: 'skills/demo-skill-a/SKILL.md',
    assetName: 'demo-skill-a',
    fixable: true,
    ...overrides,
  };
}

const issueList: GovernanceIssueList = {
  dimension: 'quality',
  total: 2,
  items: [
    issue(),
    issue({
      id: 'quality:skills/demo-skill-b/SKILL.md:criteria:clarity:0',
      severity: 'medium',
      title: '触发时机描述含糊',
      hubRelativePath: 'skills/demo-skill-b/SKILL.md',
      assetName: 'demo-skill-b',
      fixable: false,
    }),
  ],
};

const report: DiagnosisReport = {
  kind: 'skill',
  hubRelativePath: 'skills/demo-skill-a/SKILL.md',
  overall: 'needs-attention',
  issues: [
    {
      severity: 'high',
      criterion: 'mechanical:description-empty',
      finding: 'description 为空',
      suggestion: '补一句什么时候用它',
      fixable: true,
    },
  ],
  criteriaUsed: [],
  criteriaSkipped: 0,
  cached: false,
  mechanicalOnly: true,
  model: '',
  generatedAt: '2026-11-08T00:00:00.000Z',
};

function renderPanel(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HealthIssuesPanel dimension="quality" label="规范性" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('HealthIssuesPanel', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getGovernanceIssues').mockResolvedValue(issueList);
    vi.spyOn(api, 'doctorDiagnose').mockResolvedValue(report);
  });

  it('展示清单与严重度，可修复性明确标注', async () => {
    renderPanel();
    expect(await screen.findByText('规范性问题清单')).toBeInTheDocument();
    expect(await screen.findByText(/共 2 项/)).toBeInTheDocument();
    expect(screen.getByText('demo-skill-a')).toBeInTheDocument();
    expect(screen.getByText('可修复')).toBeInTheDocument();
    expect(screen.getByText('需人工判断')).toBeInTheDocument();
  });

  it('点条目就地展开体检报告（自动发起诊断）', async () => {
    renderPanel();
    await userEvent.click(await screen.findByText('demo-skill-a'));
    expect(api.doctorDiagnose).toHaveBeenCalledWith({
      kind: 'skill',
      hubRelativePath: 'skills/demo-skill-a/SKILL.md',
    });
    expect(await screen.findByRole('region', { name: '体检报告' })).toBeInTheDocument();
  });

  it('空清单给出「暂无问题」', async () => {
    vi.spyOn(api, 'getGovernanceIssues').mockResolvedValue({ dimension: 'quality', total: 0, items: [] });
    renderPanel();
    expect(await screen.findByText('这个维度暂无问题。')).toBeInTheDocument();
  });
});
