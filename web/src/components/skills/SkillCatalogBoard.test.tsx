/**
 * 技能分类看板测试（refactor-skill-catalog T8 / spec R1、R3）
 *
 * 断言：两组分类行计数与最近更新、默认收起、展开只影响本行、键盘可达、
 * 空组不可展开、统计接口失败时局部降级且不影响列表（由父页面保证）。
 */

import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillCatalogBoard } from './SkillCatalogBoard';
import type { SkillCatalogGroup, SkillCatalogOverview, SkillInfo } from '@/types/api';

function group(partial: Partial<SkillCatalogGroup> & { key: string; label: string; count: number }): SkillCatalogGroup {
  return {
    latestModifiedAt: null,
    diagnosis: { unchecked: 0, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 },
    ...partial,
  };
}

const overview: SkillCatalogOverview = {
  generatedAt: '2026-11-17T02:00:00.000Z',
  scope: 'asset',
  total: 4,
  groups: {
    provenance: [
      group({ key: 'self', label: '自建', count: 2, latestModifiedAt: '2026-11-14T08:00:00.000Z' }),
      group({
        key: 'platform',
        label: '平台自带',
        count: 1,
        latestModifiedAt: '2026-11-10T08:00:00.000Z',
        diagnosis: { unchecked: 0, stale: 1, healthy: 0, needsAttention: 1, atRisk: 0 },
      }),
      group({ key: 'imported', label: '导入', count: 1, latestModifiedAt: '2026-11-02T08:00:00.000Z' }),
    ],
    function: [
      group({ key: 'coding', label: '编码开发', count: 3 }),
      group({ key: 'writing', label: '文档写作', count: 1 }),
    ],
  },
  countByProvenanceGroup: { self: 2, platform: 1, imported: 1, unknown: 0 },
  recent: [],
  diagnosis: { checked: 2, stale: 1, unchecked: 2, atRisk: 0, needsAttention: 1, healthy: 1, issues: { high: 1, medium: 0, low: 0 } },
  aiClassify: { aiConfigured: false, pending: 0, cacheHits: 0, needCall: 0 },
};

function skill(partial: Partial<SkillInfo> & { id: string; name: string }): SkillInfo {
  return {
    description: '',
    functionCategory: 'coding',
    provenance: 'self',
    inLibrary: true,
    tool: 'hub',
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
  skill({ id: 'demo-a', name: 'demo-a', lastModifiedAt: '2026-11-14T08:00:00.000Z' }),
  skill({ id: 'demo-b', name: 'demo-b', lastModifiedAt: '2026-11-12T08:00:00.000Z' }),
  skill({
    id: 'demo-c',
    name: 'demo-c',
    provenance: 'plugin',
    provenanceGroup: 'platform',
    lastModifiedAt: '2026-11-10T08:00:00.000Z',
    diagnosis: {
      overall: 'needs-attention',
      issueCounts: { high: 1, medium: 0, low: 0 },
      mechanicalOnly: true,
      rulesVersion: '1.0.0',
      model: '',
      checkedAt: '2026-11-10T09:00:00.000Z',
      stale: true,
    },
  }),
  skill({ id: 'demo-d', name: 'demo-d', provenance: 'marketplace', provenanceGroup: 'imported', functionCategory: 'writing' }),
];

function renderBoard(overrides: Partial<ComponentProps<typeof SkillCatalogBoard>> = {}): ReturnType<typeof render> {
  return render(<SkillCatalogBoard overview={overview} items={items} {...overrides} />);
}

describe('SkillCatalogBoard 分类行（R1）', () => {
  it('两组分类行展示数量与最近更新，合计与列表 total 一致', () => {
    renderBoard();
    expect(screen.getByText('资产技能 4 个')).toBeInTheDocument();
    expect(screen.getByText('按来源')).toBeInTheDocument();
    expect(screen.getByText('按用途')).toBeInTheDocument();
    // 来源组
    const self = screen.getByTestId('catalog-group-provenance-self');
    expect(self).toHaveTextContent('自建');
    expect(self).toHaveTextContent('2');
    expect(self).toHaveTextContent('最近更新 2026-11-14');
    expect(screen.getByTestId('catalog-group-provenance-platform')).toHaveTextContent('最近更新 2026-11-10');
    // 问题数分布（含已过期单列）
    expect(screen.getByTestId('catalog-group-provenance-platform')).toHaveTextContent('需关注 1');
    expect(screen.getByTestId('catalog-group-provenance-platform')).toHaveTextContent('已过期 1');
    // 用途组
    expect(screen.getByTestId('catalog-group-function-coding')).toHaveTextContent('编码开发');
    expect(screen.getByTestId('catalog-group-function-coding')).toHaveTextContent('3');
  });

  it('摘要统计不可用时显示「统计暂不可用」，不填 0 冒充', () => {
    renderBoard({ overview: { ...overview, partial: { diagnosisUnavailable: true } } });
    expect(screen.getByTestId('catalog-group-provenance-self')).toHaveTextContent('诊断分布统计暂不可用');
  });
});

describe('SkillCatalogBoard 展开与收起（R3.1）', () => {
  it('默认收起；点一行只展开该行，再点收起', () => {
    renderBoard();
    const platform = screen.getByRole('button', { name: '展开平台自带分组' });
    expect(platform).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('demo-c')).not.toBeInTheDocument();

    fireEvent.click(platform);
    expect(screen.getByRole('button', { name: '收起平台自带分组' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('demo-c')).toBeInTheDocument();
    // 其余组保持收起
    expect(screen.getByRole('button', { name: '展开自建分组' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: '收起平台自带分组' }));
    expect(screen.queryByText('demo-c')).not.toBeInTheDocument();
  });

  it('键盘可达：焦点在分组行时 Enter / Space 均可展开', async () => {
    const user = userEvent.setup();
    renderBoard();
    const self = screen.getByRole('button', { name: '展开自建分组' });
    self.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: '收起自建分组' })).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: '展开自建分组' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('展开列表按最近更新倒序，并展示摘要状态', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: '展开自建分组' }));
    const names = screen
      .getAllByRole('button', { name: /demo-/ })
      .map((el) => el.textContent ?? '');
    expect(names[0]).toContain('demo-a');
    expect(names[1]).toContain('demo-b');
  });

  it('空组数量 0 且不可展开，不撑高', () => {
    const withEmpty: SkillCatalogOverview = {
      ...overview,
      groups: {
        provenance: overview.groups.provenance.map((g) =>
          g.key === 'imported' ? { ...g, count: 0, latestModifiedAt: null } : g,
        ),
        function: overview.groups.function,
      },
    };
    renderBoard({ overview: withEmpty });
    const emptyRow = screen.getByRole('button', { name: '展开导入分组' });
    expect(emptyRow).toBeDisabled();
    fireEvent.click(emptyRow);
    expect(screen.queryByText('demo-d')).not.toBeInTheDocument();
  });
});

describe('SkillCatalogBoard 降级与分组操作（R1.4 / T10）', () => {
  it('统计接口失败只降级看板：显示原因与重试入口', () => {
    const onRetry = vi.fn();
    renderBoard({ overview: undefined, error: new Error('network down'), onRetry });
    expect(screen.getByText(/统计暂不可用/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('分组行动作把本组技能交给回调（未入库项不在此层过滤）', () => {
    const onDiagnoseGroup = vi.fn();
    const onDistributeGroup = vi.fn();
    renderBoard({ onDiagnoseGroup, onDistributeGroup });
    fireEvent.click(screen.getAllByRole('button', { name: /诊断本类/ })[0]);
    expect(onDiagnoseGroup).toHaveBeenCalledTimes(1);
    expect(onDiagnoseGroup.mock.calls[0][0]).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: /分发本类/ })[0]);
    expect(onDistributeGroup.mock.calls[0][0].map((s: SkillInfo) => s.id)).toEqual(['demo-a', 'demo-b']);
  });
});
