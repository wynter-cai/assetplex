/**
 * 技能页降级与空态测试（refactor-skill-catalog T16 / spec R7.1-R7.3）
 *
 * 断言：空库给两个下一步且不渲染分组骨架；全部未入库时诊断/分发禁用并说明；
 * 未配置 AI 端点时诊断预估标注仅机械检查并给配置入口。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsView } from './SkillsView';
import { SkillDiagnosisDialog } from './SkillDiagnosisDialog';
import { SkillDistributionDialog } from './SkillDistributionDialog';
import { api } from '@/lib/api';
import type { SkillCatalogOverview, SkillInfo, SkillListResult } from '@/types/api';

function skill(partial: Partial<SkillInfo> & { id: string; name: string }): SkillInfo {
  return {
    description: '',
    functionCategory: 'coding',
    provenance: 'self',
    inLibrary: false,
    tool: 'trae',
    path: `skills/${partial.id}/SKILL.md`,
    version: '',
    functionSource: 'keyword',
    variants: 0,
    provenanceGroup: 'self',
    provenanceBasis: 'directory',
    functionBasis: 'keyword',
    ...partial,
  };
}

const unCuratedItems: SkillInfo[] = [
  skill({ id: 'demo-a', name: 'demo-a' }),
  skill({ id: 'demo-b', name: 'demo-b' }),
];

function listResultOf(items: SkillInfo[], environment = 0): SkillListResult {
  return {
    total: items.length,
    items,
    countByFunction: {
      coding: items.length, writing: 0, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 0, other: 0,
    },
    countByProvenance: { self: items.length, marketplace: 0, plugin: 0, builtin: 0 },
    countByStatus: { in: items.filter((s) => s.inLibrary).length, out: items.filter((s) => !s.inLibrary).length },
    countByScope: { asset: items.length, environment },
  };
}

type CatalogFixture = SkillCatalogOverview & { items: SkillInfo[] };

function catalogOf(items: SkillInfo[]): CatalogFixture {
  const counts = {
    checked: 0,
    stale: 0,
    unchecked: items.length,
    atRisk: 0,
    needsAttention: 0,
    healthy: 0,
    issues: { high: 0, medium: 0, low: 0 },
  };
  return {
    generatedAt: '2026-11-18T02:00:00.000Z',
    scope: 'asset',
    total: items.length,
    groups: {
      provenance: [
        { key: 'self', label: '自建', count: items.length, latestModifiedAt: null, diagnosis: { unchecked: items.length, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
        { key: 'platform', label: '平台自带', count: 0, latestModifiedAt: null, diagnosis: { unchecked: 0, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
        { key: 'imported', label: '导入', count: 0, latestModifiedAt: null, diagnosis: { unchecked: 0, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
      ],
      function: [
        { key: 'coding', label: '编码开发', count: items.length, latestModifiedAt: null, diagnosis: { unchecked: items.length, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
      ],
    },
    countByProvenanceGroup: { self: items.length, platform: 0, imported: 0, unknown: 0 },
    recent: [],
    diagnosis: counts,
    aiClassify: { aiConfigured: false, pending: 0, cacheHits: 0, needCall: 0 },
    items,
  };
}

function renderView(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SkillsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('R7.1 一个技能都没有', () => {
  it('看板显示暂无技能，列表区给出扫描本机技能与新建技能两个下一步', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(listResultOf([], 0));
    vi.spyOn(api, 'getSkillCatalog').mockResolvedValue(catalogOf([]));

    renderView();

    expect(await screen.findByText('暂无技能')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '扫描本机技能' })).toBeInTheDocument();
    const createButtons = screen.getAllByRole('button', { name: /新建技能/ });
    expect(createButtons.length).toBeGreaterThan(0);
    // 不显示空分组骨架
    expect(screen.queryByRole('heading', { name: /自建/ })).not.toBeInTheDocument();
  });
});

describe('R7.2 有技能但全部未入库', () => {
  it('资产口径为 0 时诊断选中与分发选中禁用，并说明先收藏到我的库', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(listResultOf(unCuratedItems, 50));
    vi.spyOn(api, 'getSkillCatalog').mockResolvedValue(catalogOf(unCuratedItems));
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue({
      total: 2,
      diagnosable: 0,
      unDiagnosable: [],
      cacheHits: 0,
      willCall: 0,
      aiConfigured: false,
      mechanicalOnly: true,
      overSelectionLimit: false,
      overCallLimit: false,
      confirmRequired: false,
      limits: { maxSelection: 100, confirmThreshold: 50, maxCalls: 200 },
      targets: [],
    });

    renderView();

    await screen.findByText(/去重后共 2 个技能/);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择技能 demo-a' }));

    const diagnose = await screen.findByRole('button', { name: /诊断选中 1 个/ });
    const distribute = screen.getByRole('button', { name: /分发选中 1 个/ });
    expect(diagnose).toBeDisabled();
    expect(distribute).toBeDisabled();
    expect(screen.getByText(/先收藏到我的库/)).toBeInTheDocument();
    expect(api.estimateSkillDiagnosis).not.toHaveBeenCalled();
  });
});

describe('R7.4 批量超限', () => {
  it('分发超过 100 个时提示分批，且不发起预览请求', async () => {
    const previewSpy = vi.spyOn(api, 'previewSkillDistribution');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ids = Array.from({ length: 150 }, (_, i) => `demo-${i + 1}`);
    render(
      <QueryClientProvider client={queryClient}>
        <SkillDistributionDialog ids={ids} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/一次最多 100 个，请分批（当前选择 150 个）/)).toBeInTheDocument();
    expect(previewSpy).not.toHaveBeenCalled();
  });
});

describe('R7.3 未配置 AI 端点', () => {
  it('诊断预估标注仅机械检查，并提供 AI 配置入口', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue({
      total: 2,
      diagnosable: 2,
      unDiagnosable: [],
      cacheHits: 0,
      willCall: 0,
      aiConfigured: false,
      mechanicalOnly: true,
      overSelectionLimit: false,
      overCallLimit: false,
      confirmRequired: false,
      limits: { maxSelection: 100, confirmThreshold: 50, maxCalls: 200 },
      targets: [
        { id: 'demo-a', name: 'demo-a', hubRelativePath: 'skills/demo-a/SKILL.md' },
        { id: 'demo-b', name: 'demo-b', hubRelativePath: 'skills/demo-b/SKILL.md' },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SkillDiagnosisDialog ids={['demo-a', 'demo-b']} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/只跑机械检查/)).toBeInTheDocument();
    const configLink = screen.getByRole('link', { name: /去配置 AI 端点/ });
    expect(configLink).toHaveAttribute('href', '/settings');

    await waitFor(() => expect(screen.getByRole('button', { name: '发起诊断' })).toBeEnabled());
  });
});
