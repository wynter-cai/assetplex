/**
 * 治理临时容器页测试（refactor-home-action-panel T11）
 *
 * spec: specs/navigation.spec.md Requirement 7 Scenario 7.1
 * 断言：健康分与四维清单可见；点条目就地展开体检报告；不提供筛选/批量/忽略/一键修复。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Governance from './Governance';
import { api } from '@/lib/api';
import type {
  DiagnosisReport,
  GovernanceHealth,
  GovernanceIssueList,
  HealthDimension,
  HealthDimensionId,
  HealthIssueRef,
} from '@/types/api';

function dimension(id: HealthDimensionId, label: string, issueCount = 0): HealthDimension {
  return {
    id,
    label,
    applicability: 'applicable',
    weight: 0.25,
    effectiveWeight: 0.25,
    score: 70,
    evaluatedAssets: 6,
    issueCount,
    topIssues: [],
  };
}

const health: GovernanceHealth = {
  score: 72,
  grade: 'needs-attention',
  totalAssets: 6,
  dimensions: [
    dimension('completeness', '完整性', 1),
    dimension('quality', '规范性'),
    dimension('distribution', '分发一致性'),
    dimension('uniqueness', '唯一性'),
  ],
  qualityMode: 'mechanical-only',
  computedAt: '2026-11-08T00:00:00.000Z',
  cached: false,
};

const issue: HealthIssueRef = {
  id: 'completeness:skills/demo-skill-a/SKILL.md:mechanical:description-empty:0',
  severity: 'high',
  title: 'description 为空',
  kind: 'skill',
  hubRelativePath: 'skills/demo-skill-a/SKILL.md',
  assetName: 'demo-skill-a',
  fixable: true,
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

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/governance']}>
        <Governance />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Governance 临时容器页', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getGovernanceHealth').mockResolvedValue(health);
    vi.spyOn(api, 'getGovernanceIssues').mockImplementation(
      ({ dimension: dimensionId }): Promise<GovernanceIssueList> =>
        Promise.resolve(
          dimensionId === 'completeness'
            ? { dimension: dimensionId, total: 1, items: [issue] }
            : { dimension: dimensionId, total: 0, items: [] },
        ),
    );
    vi.spyOn(api, 'doctorDiagnose').mockResolvedValue(report);
  });

  it('标注「治理中心建设中」，并说明当前为体检与待办视图', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: '治理中心建设中' })).toBeInTheDocument();
    expect(screen.getByText(/体检与待办视图/)).toBeInTheDocument();
  });

  it('渲染健康分与四维问题清单', async () => {
    renderPage();
    expect((await screen.findByTestId('health-score')).textContent).toBe('72');
    expect(await screen.findByText('完整性问题清单')).toBeInTheDocument();
    expect(await screen.findByText('规范性问题清单')).toBeInTheDocument();
    expect(await screen.findByText('分发一致性问题清单')).toBeInTheDocument();
    expect(await screen.findByText('唯一性问题清单')).toBeInTheDocument();
  });

  it('点条目就地展开体检报告', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('demo-skill-a'));
    expect(api.doctorDiagnose).toHaveBeenCalledWith({
      kind: 'skill',
      hubRelativePath: 'skills/demo-skill-a/SKILL.md',
    });
    expect(await screen.findByRole('region', { name: '体检报告' })).toBeInTheDocument();
  });

  it('不提供筛选、批量、忽略与一键修复类操作', async () => {
    renderPage();
    await screen.findByText('完整性问题清单');
    expect(screen.queryByRole('button', { name: /一键修复|一键整改|批量|忽略|稍后/ })).toBeNull();
  });
});
