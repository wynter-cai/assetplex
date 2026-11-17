/**
 * 技能页「本次所选」与批量诊断/分发入口测试（refactor-skill-catalog T10）
 *
 * 断言：勾选计数进入批量条、未入库项不被拦截（由预估解释）、
 * 筛选变化清空旧选择、分组行「诊断本类」把本组技能带入。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsView } from './SkillsView';
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

const items: SkillInfo[] = [
  skill({ id: 'demo-a', name: 'demo-a', inLibrary: true, tool: 'hub' }),
  skill({ id: 'demo-b', name: 'demo-b' }),
];

const listResult: SkillListResult = {
  total: 2,
  items,
  countByFunction: {
    coding: 2, writing: 0, browser: 0, data: 0, devops: 0,
    'ai-integration': 0, design: 0, workflow: 0, other: 0,
  },
  countByProvenance: { self: 2, marketplace: 0, plugin: 0, builtin: 0 },
  countByStatus: { in: 1, out: 1 },
  countByScope: { asset: 2, environment: 0 },
};

const emptyGroups = {
  provenance: [
    { key: 'self', label: '自建', count: 2, latestModifiedAt: null, diagnosis: { unchecked: 2, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
    { key: 'platform', label: '平台自带', count: 0, latestModifiedAt: null, diagnosis: { unchecked: 0, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
    { key: 'imported', label: '导入', count: 0, latestModifiedAt: null, diagnosis: { unchecked: 0, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
  ],
  function: [
    { key: 'coding', label: '编码开发', count: 2, latestModifiedAt: null, diagnosis: { unchecked: 2, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 } },
  ],
};

const catalog: SkillCatalogOverview & { items: SkillInfo[] } = {
  generatedAt: '2026-11-17T02:00:00.000Z',
  scope: 'asset',
  total: 2,
  groups: emptyGroups,
  countByProvenanceGroup: { self: 2, platform: 0, imported: 0, unknown: 0 },
  recent: [],
  diagnosis: { checked: 0, stale: 0, unchecked: 2, atRisk: 0, needsAttention: 0, healthy: 0, issues: { high: 0, medium: 0, low: 0 } },
  aiClassify: { aiConfigured: false, pending: 0, cacheHits: 0, needCall: 0 },
  items,
};

function renderView(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SkillsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(api, 'listSkills').mockResolvedValue(listResult);
  vi.spyOn(api, 'getSkillCatalog').mockResolvedValue(catalog);
  vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue({
    total: 2,
    diagnosable: 2,
    unDiagnosable: [],
    cacheHits: 0,
    willCall: 2,
    aiConfigured: true,
    mechanicalOnly: false,
    overSelectionLimit: false,
    overCallLimit: false,
    confirmRequired: false,
    limits: { maxSelection: 100, confirmThreshold: 50, maxCalls: 200 },
    targets: [
      { id: 'demo-a', name: 'demo-a', hubRelativePath: 'skills/demo-a/SKILL.md' },
      { id: 'demo-b', name: 'demo-b', hubRelativePath: 'skills/demo-b/SKILL.md' },
    ],
  });
});

describe('SkillsView 本次所选（T10）', () => {
  it('勾选计数进入批量条：诊断/分发入口显示 N 个且未入库项不被禁用', async () => {
    renderView();
    await screen.findByText(/去重后共 2 个技能/);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择技能 demo-a' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择技能 demo-b' }));

    const diagnose = await screen.findByRole('button', { name: /诊断选中 2 个/ });
    const distribute = screen.getByRole('button', { name: /分发选中 2 个/ });
    expect(diagnose).toBeEnabled();
    expect(distribute).toBeEnabled();

    fireEvent.click(diagnose);
    expect(await screen.findByRole('heading', { name: /诊断选中 2 个技能/ })).toBeInTheDocument();
    await waitFor(() => expect(api.estimateSkillDiagnosis).toHaveBeenCalledWith(['demo-a', 'demo-b']));
  });

  it('筛选变化清空旧选择，批量条随勾选消失', async () => {
    renderView();
    await screen.findByText(/去重后共 2 个技能/);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择技能 demo-b' }));
    await screen.findByRole('button', { name: /诊断选中 1 个/ });

    fireEvent.click(screen.getByRole('button', { name: '我的库 1' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /诊断选中/ })).not.toBeInTheDocument();
    });
  });

  it('分组行「诊断本类」把本组全部技能带入（未入库不静默剔除）', async () => {
    renderView();
    await screen.findByText(/去重后共 2 个技能/);
    fireEvent.click(screen.getAllByRole('button', { name: /诊断本类/ })[0]);
    expect(await screen.findByRole('heading', { name: /诊断选中 2 个技能/ })).toBeInTheDocument();
  });
});
