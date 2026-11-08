/**
 * 首页健康卡测试（add-asset-governance H4）
 *
 * spec: specs/asset-health-score.spec.md Scenario 1/2/3/4/6
 * 断言重点：真实分数与构成、零资产不显示 0 分、维度不适用不伪造 0、维度可下钻。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeHero } from './HomeHero';
import type { GovernanceHealth, HealthDimension } from '@/types/api';

function dimension(overrides: Partial<HealthDimension> = {}): HealthDimension {
  return {
    id: 'completeness',
    label: '完整性',
    applicability: 'applicable',
    weight: 30,
    effectiveWeight: 30,
    score: 100,
    evaluatedAssets: 10,
    issueCount: 0,
    topIssues: [],
    ...overrides,
  };
}

function health(overrides: Partial<GovernanceHealth> = {}): GovernanceHealth {
  return {
    score: 52,
    grade: 'at-risk',
    totalAssets: 30,
    dimensions: [
      dimension({ id: 'completeness', label: '完整性', score: 45, issueCount: 2, weight: 30 }),
      dimension({ id: 'quality', label: '规范性', score: 33, issueCount: 3, weight: 30 }),
      dimension({ id: 'distribution', label: '分发一致性', score: 70, issueCount: 1, weight: 25 }),
      dimension({ id: 'uniqueness', label: '唯一性', score: 100, weight: 15 }),
    ],
    qualityMode: 'mechanical-only',
    computedAt: '2026-11-08T00:00:00.000Z',
    cached: false,
    ...overrides,
  };
}

const baseProps = {
  hubInitialized: true,
  health: health(),
  healthLoading: false,
  healthError: false,
};

describe('HomeHero — 健康卡', () => {
  it('Scenario 1：展示真实总分、四维构成与最大扣分项一句话', () => {
    render(<HomeHero {...baseProps} />);
    expect(screen.getByTestId('health-score')).toHaveTextContent('52');
    expect(screen.getByText('最大扣分项：规范性（33 分，3 个问题）')).toBeInTheDocument();
    expect(screen.getByText('完整性')).toBeInTheDocument();
    expect(screen.getByText('规范性')).toBeInTheDocument();
    expect(screen.getByText('分发一致性')).toBeInTheDocument();
    expect(screen.getByText('唯一性')).toBeInTheDocument();
    expect(screen.getByText(/共 30 项/)).toBeInTheDocument();
  });

  it('Scenario 6：点击维度触发下钻', async () => {
    const onOpenIssues = vi.fn();
    render(<HomeHero {...baseProps} onOpenIssues={onOpenIssues} />);
    await userEvent.click(screen.getByTestId('dimension-quality'));
    expect(onOpenIssues).toHaveBeenCalledWith('quality');
  });

  it('Scenario 3：零资产不显示 0 分，改为导入引导', () => {
    render(
      <HomeHero
        {...baseProps}
        health={health({ grade: 'empty', score: 0, totalAssets: 0, dimensions: [] })}
        onStartOnboarding={vi.fn()}
      />,
    );
    expect(screen.getByTestId('health-card-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('health-score')).not.toBeInTheDocument();
    expect(screen.getByText('先把你的家底搬进来')).toBeInTheDocument();
  });

  it('Scenario 4：无评估对象的维度显示「不适用」，不显示 0', () => {
    render(
      <HomeHero
        {...baseProps}
        health={health({
          score: 100,
          grade: 'excellent',
          dimensions: [
            dimension({ id: 'completeness', label: '完整性', score: 100 }),
            dimension({ id: 'quality', label: '规范性', score: 100 }),
            dimension({
              id: 'distribution',
              label: '分发一致性',
              applicability: 'not-applicable',
              score: null,
              effectiveWeight: 0,
              issueCount: 0,
            }),
            dimension({ id: 'uniqueness', label: '唯一性', score: 100, weight: 15 }),
          ],
        })}
      />,
    );
    expect(screen.getByText('不适用')).toBeInTheDocument();
    expect(screen.getByText('家底干净，未发现明显短板')).toBeInTheDocument();
  });

  it('数据缺失的维度显示「数据缺失」，不展示伪造分数', () => {
    render(
      <HomeHero
        {...baseProps}
        health={health({
          dimensions: [
            dimension({ id: 'completeness', label: '完整性', score: 80 }),
            dimension({
              id: 'quality',
              label: '规范性',
              applicability: 'data-missing',
              score: null,
              effectiveWeight: 0,
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText('数据缺失')).toBeInTheDocument();
  });

  it('Scenario 5：机械模式标注语义质量未评估，并提供配置入口', async () => {
    const onConfigureAi = vi.fn();
    render(<HomeHero {...baseProps} onConfigureAi={onConfigureAi} />);
    expect(screen.getByText('语义质量未评估')).toBeInTheDocument();
    await userEvent.click(screen.getByText('去配置'));
    expect(onConfigureAi).toHaveBeenCalled();
  });

  it('刷新中禁用「重新体检」，缓存结果打「来自缓存」标', async () => {
    const onRefreshHealth = vi.fn();
    render(<HomeHero {...baseProps} health={health({ cached: true })} onRefreshHealth={onRefreshHealth} />);
    expect(screen.getByText('来自缓存')).toBeInTheDocument();
    await userEvent.click(screen.getByText('重新体检'));
    expect(onRefreshHealth).toHaveBeenCalled();
  });

  it('健康分加载失败不显示假分数', () => {
    render(<HomeHero {...baseProps} health={null} healthError />);
    expect(screen.getByText('健康分暂不可用')).toBeInTheDocument();
    expect(screen.queryByTestId('health-score')).not.toBeInTheDocument();
  });

  it('「一键整改」只是入口，点击交给弹窗做二次确认', async () => {
    const onStartRemediation = vi.fn();
    render(<HomeHero {...baseProps} onStartRemediation={onStartRemediation} />);
    await userEvent.click(screen.getByText('一键整改'));
    expect(onStartRemediation).toHaveBeenCalledTimes(1);
  });
});
