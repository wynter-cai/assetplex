/**
 * 质量中心「全局体检报告」页测试（refactor-governance-center T3）
 *
 * spec: governance-center.spec.md Scenario 2.1–2.6 / 7.1–7.2
 * 断言重点：四维分数与构成、聚类计数与样例、展开只影响本条、深链、
 * 五种空态与覆盖度披露、接口失败重试、页面零诊断/零修复入口。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QualityCenter from './QualityCenter';
import { api } from '@/lib/api';
import type {
  DiagnosisReport,
  GovernanceHealth,
  HealthDimension,
  HealthDimensionId,
  QualityClusterAssetRef,
  QualityIssueCluster,
  QualityOverview,
} from '@/types/api';

function dimension(
  id: HealthDimensionId,
  label: string,
  overrides: Partial<HealthDimension> = {},
): HealthDimension {
  return {
    id,
    label,
    applicability: 'applicable',
    weight: 25,
    effectiveWeight: 25,
    score: 70,
    evaluatedAssets: 6,
    issueCount: 1,
    topIssues: [],
    ...overrides,
  };
}

const health: GovernanceHealth = {
  score: 72,
  grade: 'needs-attention',
  totalAssets: 18,
  dimensions: [
    dimension('completeness', '完整性', { weight: 30, score: 60, issueCount: 9, evaluatedAssets: 18 }),
    dimension('quality', '规范性', { weight: 30, score: 68, issueCount: 4 }),
    dimension('distribution', '分发一致性', { weight: 25, score: 80, issueCount: 2 }),
    dimension('uniqueness', '唯一性', { weight: 15, score: 92, issueCount: 0 }),
  ],
  qualityMode: 'mechanical-only',
  computedAt: '2026-11-08T00:00:00.000Z',
  cached: false,
};

function sample(overrides: Partial<QualityClusterAssetRef> = {}): QualityClusterAssetRef {
  return {
    hubRelativePath: 'skills/demo-skill-a/SKILL.md',
    assetName: 'demo-skill-a',
    kind: 'skill',
    severity: 'medium',
    confidence: 'high',
    source: 'rule',
    fixable: true,
    ignored: false,
    deepLink: '/vault/skill?asset=skills/demo-skill-a/SKILL.md',
    ...overrides,
  };
}

function cluster(overrides: Partial<QualityIssueCluster> = {}): QualityIssueCluster {
  return {
    key: 'rule:skill-missing-description',
    keySource: 'rule',
    ruleId: 'SKILL-001',
    title: '技能缺 description',
    category: 'skill',
    severity: 'high',
    mode: 'static',
    assetCount: 9,
    hitCount: 12,
    severityDistribution: { high: 0, medium: 9, low: 3 },
    fixableAssetCount: 8,
    estimatedCalls: 0,
    cachedCount: 9,
    impactScore: 27,
    samples: [
      sample(),
      sample({
        hubRelativePath: 'skills/demo-skill-b/SKILL.md',
        assetName: 'demo-skill-b',
        deepLink: '/vault/skill?asset=skills/demo-skill-b/SKILL.md',
      }),
      sample({
        hubRelativePath: 'skills/demo-skill-c/SKILL.md',
        assetName: 'demo-skill-c',
        deepLink: '/vault/skill?asset=skills/demo-skill-c/SKILL.md',
      }),
      sample({
        hubRelativePath: 'skills/demo-skill-d/SKILL.md',
        assetName: 'demo-skill-d',
        deepLink: '/vault/skill?asset=skills/demo-skill-d/SKILL.md',
      }),
    ],
    ...overrides,
  };
}

const boundaryCluster = cluster({
  key: 'title:identity-boundary',
  keySource: 'title',
  ruleId: null,
  title: '人设边界模糊',
  category: 'identity',
  severity: 'medium',
  mode: 'llm',
  assetCount: 3,
  hitCount: 3,
  severityDistribution: { high: 0, medium: 3, low: 0 },
  fixableAssetCount: 0,
  estimatedCalls: 3,
  cachedCount: 0,
  impactScore: 6,
  samples: [
    sample({
      hubRelativePath: 'identity/profile.md',
      assetName: 'demo-identity',
      kind: 'identity',
      deepLink: '/vault/identity?asset=identity/profile.md',
    }),
  ],
});

function overview(overrides: Partial<QualityOverview> = {}): QualityOverview {
  return {
    health,
    clusters: [cluster(), boundaryCluster],
    sortRule: 'impact-desc-calls-asc',
    pendingTotal: 15,
    coverage: {
      rulesVersion: '2026.11.0',
      evaluatedRules: 42,
      skippedRules: 3,
      skippedReasons: [],
      noChannelRules: 2,
      ignoredCount: 0,
      aiConfigured: true,
      semanticEvaluated: true,
    },
    generatedAt: '2026-11-08T00:00:00.000Z',
    cached: false,
    ...overrides,
  };
}

const report: DiagnosisReport = {
  kind: 'skill',
  hubRelativePath: 'skills/demo-skill-a/SKILL.md',
  overall: 'needs-attention',
  issues: [],
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
      <MemoryRouter initialEntries={['/quality']}>
        <QualityCenter />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QualityCenter 全局体检报告', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(overview());
    vi.spyOn(api, 'doctorDiagnose').mockResolvedValue(report);
  });

  it('渲染总分、等级与四维分值构成（含权重与受影响资产数）', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: '体检报告' })).toBeInTheDocument();
    expect(await screen.findByTestId('health-score')).toHaveTextContent('72');

    const completeness = screen.getByTestId('dimension-completeness');
    expect(within(completeness).getByText('完整性')).toBeInTheDocument();
    expect(within(completeness).getByText(/权重 30%/)).toBeInTheDocument();
    expect(within(completeness).getByText(/受影响 18 个/)).toBeInTheDocument();
    expect(within(completeness).getByText(/9 个问题/)).toBeInTheDocument();
    expect(screen.getByTestId('dimension-quality')).toHaveTextContent('规范性');
    expect(screen.getByTestId('dimension-distribution')).toHaveTextContent('分发一致性');
    expect(screen.getByTestId('dimension-uniqueness')).toHaveTextContent('唯一性');
  });

  it('聚类显示影响资产数、命中次数、严重度、可修复性与聚合依据', async () => {
    renderPage();
    expect(await screen.findByText('技能缺 description')).toBeInTheDocument();
    expect(screen.getByText(/影响 9 个资产 · 命中 12 次/)).toBeInTheDocument();
    expect(screen.getByText('高 0 / 中 9 / 低 3')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-fixable-rule:skill-missing-description')).toHaveTextContent(
      '可修复 8 个',
    );
    expect(screen.getByTestId('cluster-fixable-title:identity-boundary')).toHaveTextContent(
      '需人工判断',
    );
    expect(screen.getByText('按规则编号聚合')).toBeInTheDocument();
    expect(screen.getByText('按规则标题聚合')).toBeInTheDocument();
  });

  it('样例最多 3 条，提供资产名、类别与深链', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('cluster-toggle-rule:skill-missing-description'));

    const panel = screen.getByTestId('cluster-panel-rule:skill-missing-description');
    expect(within(panel).getByText('demo-skill-a')).toBeInTheDocument();
    expect(within(panel).getAllByText('技能').length).toBeGreaterThan(0);
    expect(within(panel).queryByText('demo-skill-d')).toBeNull();

    const links = within(panel).getAllByRole('link', { name: '在资产库中打开' });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/vault/skill?asset=skills/demo-skill-a/SKILL.md');
  });

  it('展开只影响本条，Enter / Space 可切换并带 aria-expanded', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('技能缺 description');

    const first = screen.getByTestId('cluster-toggle-rule:skill-missing-description');
    const second = screen.getByTestId('cluster-toggle-title:identity-boundary');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'false');

    first.focus();
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('cluster-panel-rule:skill-missing-description')).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-panel-title:identity-boundary')).toBeNull();

    await user.keyboard(' ');
    expect(first).toHaveAttribute('aria-expanded', 'false');
  });

  it('前端不自行重排聚类，按接口返回顺序渲染', async () => {
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(
      overview({ clusters: [boundaryCluster, cluster()] }),
    );
    renderPage();
    await screen.findByText('人设边界模糊');
    const titles = within(screen.getByTestId('cluster-list'))
      .getAllByTestId('cluster-title')
      .map((node) => node.textContent);
    expect(titles).toEqual(['人设边界模糊', '技能缺 description']);
  });

  it('给出一句话排序依据，并可点开完整说明', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/按影响面降序/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '排序依据' }));
    expect(
      screen.getByText(
        '影响面 = 受影响资产数 × 严重度权重（高 3 / 中 2 / 低 1），同分按预计调用升序；仍相同按规则集声明顺序，前端不重排。',
      ),
    ).toBeInTheDocument();
  });

  it('零资产空态：不展示健康分，给出资产库与新手引导两个出口', async () => {
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(
      overview({
        health: { ...health, score: 0, grade: 'empty', totalAssets: 0 },
        clusters: [],
        pendingTotal: 0,
      }),
    );
    renderPage();
    expect(await screen.findByTestId('quality-empty-assets')).toBeInTheDocument();
    expect(screen.getByText('先把资产收进库再体检')).toBeInTheDocument();
    expect(screen.queryByTestId('health-score')).toBeNull();
    expect(screen.getByRole('link', { name: '去资产库' })).toHaveAttribute('href', '/vault');
    expect(screen.getByRole('link', { name: '去新手引导' })).toHaveAttribute('href', '/onboarding');
  });

  it('全部健康空态：给出规则集版本与最近一次体检时间', async () => {
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(
      overview({ clusters: [], pendingTotal: 0 }),
    );
    renderPage();
    const empty = await screen.findByTestId('empty-healthy');
    expect(empty).toHaveTextContent('未发现违反规则集的问题');
    expect(empty).toHaveTextContent('规则集版本 v2026.11.0');
    expect(empty).toHaveTextContent('最近一次体检');
  });

  it('覆盖度披露：语义未评估时如实标注', async () => {
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(
      overview({
        coverage: {
          rulesVersion: '2026.11.0',
          evaluatedRules: 30,
          skippedRules: 12,
          skippedReasons: [{ reason: 'semantic-disabled', count: 12 }],
          noChannelRules: 2,
          ignoredCount: 0,
          aiConfigured: false,
          semanticEvaluated: false,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText('语义未评估')).toBeInTheDocument();
    expect(screen.getByText(/语义规则本轮未评估/)).toBeInTheDocument();
    expect(screen.queryByText(/全部健康/)).toBeNull();
  });

  it('AI 已配置但尚未语义评估：不再提示去配置，改指资产详情（T11）', async () => {
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(
      overview({
        coverage: {
          rulesVersion: '2026.11.0',
          evaluatedRules: 45,
          skippedRules: 0,
          skippedReasons: [],
          noChannelRules: 2,
          ignoredCount: 0,
          aiConfigured: true,
          semanticEvaluated: false,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText('语义未评估')).toBeInTheDocument();
    expect(screen.getByText(/在资产详情运行一次体检即可补充语义检查/)).toBeInTheDocument();
    expect(screen.queryByText(/配置 AI 端点后可补充语义检查/)).toBeNull();
  });

  it('覆盖度披露：已忽略条目单列，不算作健康', async () => {
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(
      overview({
        coverage: {
          rulesVersion: '2026.11.0',
          evaluatedRules: 42,
          skippedRules: 3,
          skippedReasons: [],
          noChannelRules: 2,
          ignoredCount: 3,
          aiConfigured: true,
          semanticEvaluated: true,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText('已忽略 3 条')).toBeInTheDocument();
    expect(screen.queryByText(/全部健康/)).toBeNull();
  });

  it('接口失败展示失败说明与重试，点重试重新请求', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, 'getQualityOverview');
    spy.mockRejectedValueOnce(new Error('overview failed'));
    spy.mockResolvedValue(overview());

    renderPage();
    expect(await screen.findByText('体检报告读取失败')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('技能缺 description')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('待处理数直接取 pendingTotal', async () => {
    renderPage();
    expect(await screen.findByTestId('pending-total')).toHaveTextContent('待处理 15 项');
  });

  it('页面无诊断 / 修复入口，展开聚类不触发诊断请求', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('cluster-toggle-rule:skill-missing-description'));

    expect(screen.queryByText('应用修复')).toBeNull();
    expect(screen.queryByText('重新诊断')).toBeNull();
    expect(screen.queryByRole('button', { name: /应用修复|重新诊断|重新体检|一键整改|批量修复/ })).toBeNull();
    expect(screen.queryByRole('region', { name: '体检报告' })).toBeNull();

    const panel = screen.getByTestId('cluster-panel-rule:skill-missing-description');
    expect(within(panel).queryByRole('button', { name: /修复|诊断/ })).toBeNull();
    expect(api.doctorDiagnose).not.toHaveBeenCalled();
  });
});
