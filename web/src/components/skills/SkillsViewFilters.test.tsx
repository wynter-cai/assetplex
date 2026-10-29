/**
 * SkillsView 出处 × 库状态组合筛选测试（spec refactor-skill-origin-taxonomy）
 *
 * 基线形态：442 = 自建 99 + 市场安装 292 + 插件自带 27 + 官方内置 24；我的库 31 / 未收藏 411
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsView } from './SkillsView';
import { api } from '@/lib/api';
import type { SkillInfo, SkillListResult } from '@/types/api';

function skill(partial: Partial<SkillInfo> & { id: string; name: string; functionCategory: SkillInfo['functionCategory']; provenance: SkillInfo['provenance'] }): SkillInfo {
  return {
    description: '',
    tool: 'trae',
    path: `/x/${partial.id}/SKILL.md`,
    version: '',
    functionSource: 'keyword',
    variants: 0,
    inLibrary: false,
    ...partial,
  };
}

const fullResult: SkillListResult = {
  total: 442,
  items: [
    skill({ id: 'mycode', name: 'mycode', functionCategory: 'coding', provenance: 'self', inLibrary: true, tool: 'hub' }),
    skill({ id: 'airbnb', name: 'airbnb', functionCategory: 'other', provenance: 'marketplace' }),
  ],
  countByFunction: {
    coding: 1, writing: 0, browser: 0, data: 0, devops: 0,
    'ai-integration': 0, design: 0, workflow: 0, other: 1,
  },
  countByProvenance: { self: 99, marketplace: 292, plugin: 27, builtin: 24 },
  countByStatus: { in: 31, out: 411 },
  countByScope: { asset: 99, environment: 343 },
};

const libraryResult: SkillListResult = {
  total: 31,
  items: [fullResult.items[0]],
  countByFunction: {
    coding: 1, writing: 0, browser: 0, data: 0, devops: 0,
    'ai-integration': 0, design: 0, workflow: 0, other: 0,
  },
  countByProvenance: { self: 31, marketplace: 0, plugin: 0, builtin: 0 },
  countByStatus: { in: 31, out: 0 },
  countByScope: { asset: 31, environment: 0 },
};

function renderView(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SkillsView />
    </QueryClientProvider>,
  );
}

describe('SkillsView 出处与库状态组合筛选', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockImplementation((params) => {
      if (params?.status === 'in') return Promise.resolve(libraryResult);
      return Promise.resolve(fullResult);
    });
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: fullResult.items[1], rawContent: '# airbnb' });
  });

  it('状态分段三档计数（全部=我的库+未入库），出处 chips 单行四类且合计等于总数', async () => {
    renderView();
    expect(await screen.findByText(/去重后共 442 个技能/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部 442' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我的库 31' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '未收藏 411' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '自建 99' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '市场安装 292' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '插件自带 27' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '官方内置 24' })).toBeInTheDocument();
  });

  it('未入库 × 市场安装：正交组合查询（待收藏候选）', async () => {
    renderView();
    await screen.findByText(/去重后共 442 个技能/);
    fireEvent.click(screen.getByRole('button', { name: '未收藏 411' }));
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenLastCalledWith({ scope: 'asset', function: undefined, provenance: undefined, status: 'out', search: undefined });
    });
    // refetch 完成后 chips 恢复全集计数，再点击出处 chip 形成交集查询
    fireEvent.click(await screen.findByRole('button', { name: '市场安装 292' }));
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenLastCalledWith({ scope: 'asset', function: undefined, provenance: 'marketplace', status: 'out', search: undefined });
    });
  });

  it('我的库视图：统计行显示当前视图卡片数，出处 chips 计数联动重算（31/0/0/0）', async () => {
    renderView();
    await screen.findByText(/去重后共 442 个技能/);
    fireEvent.click(screen.getByRole('button', { name: '我的库 31' }));
    // spec fix-scan-count-gaps：有筛选时统计行用当前视图卡片数（libraryResult.items 共 1 条）
    expect(await screen.findByText('当前视图 1 个技能')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '自建 31' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '市场安装 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '插件自带 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '官方内置 0' })).toBeInTheDocument();
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenLastCalledWith({ scope: 'asset', function: undefined, provenance: undefined, status: 'in', search: undefined });
    });
  });

  it('术语走查：页面无「保险箱」「沉淀」，未入库详情提供「收藏到我的库」', async () => {
    renderView();
    await screen.findByText(/去重后共 442 个技能/);
    fireEvent.click(await screen.findByRole('button', { name: '展开 airbnb 卡片' }));
    expect(await screen.findByRole('button', { name: '收藏到我的库' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('保险箱');
    expect(document.body.textContent).not.toContain('沉淀');
  });
});
