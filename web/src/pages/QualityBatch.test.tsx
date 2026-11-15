/**
 * 质量中心「跨类别批量诊断」页测试（refactor-governance-center T5）
 *
 * spec: governance-center.spec.md Scenario 3.1–3.6 / 8.2；
 * 断言：预估拆分（缓存命中/需调用）、缺字段与超限禁用、>50 二次确认、
 * 执行与聚合、失败项单独重试、无 AI 时照常可跑并披露语义未评估。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QualityBatch, { startBlockReason } from './QualityBatch';
import { api } from '@/lib/api';
import type {
  BatchDiagnoseEstimate,
  DiagnosisReport,
  QualityIssueCluster,
  QualityOverview,
  RuleFinding,
} from '@/types/api';

function estimate(overrides: Partial<BatchDiagnoseEstimate> = {}): BatchDiagnoseEstimate {
  return {
    totalAssets: 24,
    cacheHits: 10,
    willCall: 14,
    semanticSkipped: 0,
    unDiagnosable: [{ hubRelativePath: 'd:/elsewhere/SKILL.md', kind: 'skill', reason: 'env-asset' }],
    ruleCoverage: [{ kind: 'skill', evaluatedRules: 22, skippedRules: 0 }],
    rulesVersion: '1.0.0',
    targets: [{ kind: 'skill', hubRelativePath: 'skills/demo/SKILL.md' }],
    limits: { maxAssets: 100, confirmAboveCalls: 50, hardMaxCalls: 200 },
    estimatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

function finding(): RuleFinding {
  return {
    id: 'SK-03:a',
    ruleId: 'SK-03',
    severity: 'medium',
    confidence: 'high',
    source: 'rule',
    title: '技能 description 缺少触发子句',
    finding: '描述不含触发语',
    impact: '不易触发',
    suggestion: '补 Use when 子句',
    evidence: [],
    insufficientEvidence: false,
    fixable: true,
    ignored: false,
  };
}

function report(): DiagnosisReport {
  return {
    kind: 'skill',
    hubRelativePath: 'skills/demo/SKILL.md',
    overall: 'needs-attention',
    findings: [finding()],
    issues: [],
    rulesVersion: '1.0.0',
    coverage: { evaluatedRules: 15, skippedRules: 0, skippedReasons: [] },
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: false,
    aiEvaluated: true,
    rejected: 0,
    model: 'demo-model',
    generatedAt: '2026-11-15T00:00:00.000Z',
  };
}

function overview(clusters: QualityIssueCluster[] = []): QualityOverview {
  return {
    generatedAt: '2026-11-15T00:00:00.000Z',
    pendingTotal: clusters.length,
    sortRule: 'impact-desc-calls-asc',
    cached: false,
    clusters,
    health: {
      score: 80,
      grade: 'needs-attention',
      totalAssets: 5,
      dimensions: [],
      qualityMode: 'mechanical-only',
      computedAt: '2026-11-15T00:00:00.000Z',
      cached: false,
    },
    coverage: {
      rulesVersion: '1.0.0',
      evaluatedRules: 15,
      skippedRules: 0,
      skippedReasons: [],
      noChannelRules: 0,
      semanticEvaluated: false,
      ignoredCount: 0,
    },
  };
}

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/quality/batch']}>
        <QualityBatch />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('startBlockReason', () => {
  it('缺成本字段 / 超上限 / 零资产时给出禁用原因', () => {
    expect(startBlockReason(null, false)).toContain('正在估算');
    expect(startBlockReason({ ...estimate(), willCall: undefined as unknown as number }, false)).toContain(
      '无法估算成本',
    );
    expect(startBlockReason(estimate({ totalAssets: 150 }), false)).toContain('单次最多 100');
    expect(startBlockReason(estimate({ willCall: 260 }), false)).toContain('上限 200');
    expect(startBlockReason(estimate({ totalAssets: 0, willCall: 0, cacheHits: 0 }), false)).toContain(
      '没有可诊断',
    );
    expect(startBlockReason(estimate(), false)).toBeNull();
  });
});

describe('QualityBatch 跨类别批量诊断', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getQualityOverview').mockResolvedValue(overview());
    vi.spyOn(api, 'estimateBatchDiagnosis').mockResolvedValue(estimate());
    vi.spyOn(api, 'doctorDiagnose').mockResolvedValue(report());
    vi.spyOn(api, 'getRemediationPlan').mockResolvedValue({
      items: [],
      skipped: [],
      totalAssets: 0,
      estimatedCalls: 0,
      truncated: false,
      batchLimit: 20,
      kindDistribution: {},
      nonBatchableCount: 0,
      generatedAt: '2026-11-15T00:00:00.000Z',
    });
  });

  it('按类别与问题类型圈选，预估同时显示缓存命中与需调用（Scenario 3.1 / 3.2）', async () => {
    renderPage();
    expect(await screen.findByText('共 24 个资产')).toBeInTheDocument();
    expect(screen.getByText('缓存命中 10 个')).toBeInTheDocument();
    expect(screen.getByText('需调用 14 次')).toBeInTheDocument();
    expect(screen.getByText(/不在库内的环境条目/)).toBeInTheDocument();
    // MCP 不可诊断：标注并禁用勾选
    const mcp = screen.getByText('MCP（暂不支持诊断）');
    expect(mcp).toBeInTheDocument();
  });

  it('预估失败时禁用发起并说明原因（Scenario 3.2 缺字段口径）', async () => {
    vi.spyOn(api, 'estimateBatchDiagnosis').mockRejectedValue(new Error('规则集未加载'));
    renderPage();
    expect(await screen.findByText(/预估失败/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /发起批量诊断/ })).toBeDisabled();
  });

  it('超硬上限时禁用发起并提示分批，不静默截断（Scenario 3.3）', async () => {
    vi.spyOn(api, 'estimateBatchDiagnosis').mockResolvedValue(estimate({ totalAssets: 150, willCall: 150 }));
    renderPage();
    expect((await screen.findAllByText(/单次最多 100 个资产/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /发起批量诊断/ })).toBeDisabled();
  });

  it('预计调用超过 50 次时先二次确认，再逐个执行并聚合结果（Scenario 3.3 / 3.4）', async () => {
    vi.spyOn(api, 'estimateBatchDiagnosis').mockResolvedValue(estimate({ willCall: 60, cacheHits: 0 }));
    renderPage();
    await screen.findByText('共 24 个资产');
    await userEvent.click(screen.getByRole('button', { name: /发起批量诊断/ }));
    expect(await screen.findByText('确认发起批量诊断？')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '确认发起' }));
    await waitFor(() => expect(api.doctorDiagnose).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('batch-diagnosis-results')).toBeInTheDocument();
    expect(screen.getByText('技能 description 缺少触发子句')).toBeInTheDocument();
  });

  it('无 AI 时仍可发起，并披露本次不评估语义质量（Scenario 3.6）', async () => {
    vi.spyOn(api, 'estimateBatchDiagnosis').mockResolvedValue(
      estimate({ willCall: 0, cacheHits: 0, semanticSkipped: 7 }),
    );
    renderPage();
    expect(await screen.findByText(/本轮跳过 7 条语义规则/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /发起批量诊断/ })).toBeEnabled();
  });
});
