/**
 * SkillsView 资产优先视图测试（spec refactor-skill-asset-first-view Scenario 1/2/3/4/8）
 * 资产 = 入库 ∪ 自建；环境（市场/插件/内置）默认不公示，仅底部折叠入口
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsView } from './SkillsView';
import { api } from '@/lib/api';
import type { SkillInfo, SkillListResult } from '@/types/api';

function skill(
  partial: Partial<SkillInfo> & {
    id: string;
    name: string;
    functionCategory: SkillInfo['functionCategory'];
    provenance: SkillInfo['provenance'];
  },
): SkillInfo {
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

/** 构造与真实响应同构的 SkillListResult fixture（未写的计数维度补零） */
function listResult(
  partial: Partial<SkillListResult> & Pick<SkillListResult, 'total' | 'items'>,
): SkillListResult {
  return {
    countByFunction: {
      coding: 0, writing: 0, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 0, other: 0,
    },
    countByProvenance: { self: 0, marketplace: 0, plugin: 0, builtin: 0 },
    countByStatus: { in: 0, out: 0 },
    countByScope: { asset: 0, environment: 0 },
    ...partial,
  };
}

const mycode = skill({ id: 'mycode', name: 'mycode', description: 'typescript 编程', functionCategory: 'coding', provenance: 'self' });
const airbnb = skill({ id: 'airbnb', name: 'airbnb', description: '爱彼迎房源', functionCategory: 'other', provenance: 'marketplace', tool: 'codebuddy' });
const pluginX = skill({ id: 'plugin-x', name: 'plugin-x', functionCategory: 'other', provenance: 'plugin' });
const pdf = skill({ id: 'pdf', name: 'pdf', description: 'pdf 文档', functionCategory: 'writing', provenance: 'builtin' });

/** 资产视图基线：1 个自建，环境折叠计数 3 */
const assetResult = listResult({
  total: 1,
  items: [mycode],
  countByFunction: {
    coding: 1, writing: 0, browser: 0, data: 0, devops: 0,
    'ai-integration': 0, design: 0, workflow: 0, other: 0,
  },
  countByProvenance: { self: 1, marketplace: 0, plugin: 0, builtin: 0 },
  countByStatus: { in: 0, out: 1 },
  countByScope: { asset: 1, environment: 3 },
});

/** 环境视图基线：市场 1 + 插件 1 + 内置 1（乱序返回，验证渲染分组排序） */
const envResult = listResult({
  total: 3,
  items: [pdf, airbnb, pluginX],
  countByFunction: {
    coding: 0, writing: 1, browser: 0, data: 0, devops: 0,
    'ai-integration': 0, design: 0, workflow: 0, other: 2,
  },
  countByProvenance: { self: 0, marketplace: 1, plugin: 1, builtin: 1 },
  countByStatus: { in: 0, out: 3 },
  countByScope: { asset: 1, environment: 3 },
});

const emptyResult = listResult({ total: 0, items: [], countByScope: { asset: 0, environment: 3 } });

function renderView(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SkillsView />
    </QueryClientProvider>,
  );
}

function mockBaseline(): void {
  vi.spyOn(api, 'listSkills').mockImplementation((params) => {
    if (params?.scope === 'environment') return Promise.resolve(envResult);
    if (params?.search) return Promise.resolve(emptyResult);
    return Promise.resolve(assetResult);
  });
  vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: airbnb, rawContent: '# airbnb' });
}

describe('SkillsView 默认资产视图（Scenario 1）', () => {
  beforeEach(mockBaseline);

  it('默认请求 scope=asset，列表无市场技能，底部折叠入口带环境计数', async () => {
    renderView();
    expect(await screen.findByText(/去重后共 1 个技能/)).toBeInTheDocument();
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenCalledWith(expect.objectContaining({ scope: 'asset' }));
    });
    expect(screen.getByRole('button', { name: /本机技能环境 3/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '展开 airbnb 卡片' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '展开 pdf 卡片' })).not.toBeInTheDocument();
  });
});

describe('SkillsView 环境折叠入口（Scenario 2/8）', () => {
  beforeEach(mockBaseline);

  it('点击入口以 scope=environment 展开列表，分组顺序固定为市场安装→插件自带→官方内置，可再次收起', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /本机技能环境 3/ }));
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenCalledWith(expect.objectContaining({ scope: 'environment' }));
    });
    expect(await screen.findByRole('button', { name: '展开 airbnb 卡片' })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    const idxMarket = headings.findIndex((t) => t.includes('市场安装'));
    const idxPlugin = headings.findIndex((t) => t.includes('插件自带'));
    const idxBuiltin = headings.findIndex((t) => t.includes('官方内置'));
    expect(idxMarket).toBeGreaterThanOrEqual(0);
    expect(idxMarket).toBeLessThan(idxPlugin);
    expect(idxPlugin).toBeLessThan(idxBuiltin);
    // 再次点击收起，环境卡片消失
    fireEvent.click(screen.getByRole('button', { name: /本机技能环境 3/ }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '展开 airbnb 卡片' })).not.toBeInTheDocument();
    });
  });
});

describe('SkillsView 搜索空态指向环境入口（Scenario 4）', () => {
  beforeEach(mockBaseline);

  it('搜环境技能名空结果时空态提示只搜资产，一键展开可查环境', async () => {
    renderView();
    await screen.findByText(/去重后共 1 个技能/);
    fireEvent.change(screen.getByPlaceholderText('搜索技能名称或描述...'), { target: { value: '12306' } });
    expect(await screen.findByText(/当前只搜索资产/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /展开本机技能环境/ }));
    expect(await screen.findByRole('button', { name: '展开 airbnb 卡片' })).toBeInTheDocument();
  });
});

describe('SkillsView 收藏后视图联动（Scenario 3）', () => {
  it('环境列表收藏成功后入口计数 -1，资产计数 +1', async () => {
    const airbnbCurated = { ...airbnb, inLibrary: true, tool: 'hub' as const };
    const assetAfter = listResult({
      total: 2,
      items: [mycode, airbnbCurated],
      countByProvenance: { self: 1, marketplace: 1, plugin: 0, builtin: 0 },
      countByStatus: { in: 1, out: 1 },
      countByScope: { asset: 2, environment: 2 },
    });
    const envAfter = listResult({
      total: 2,
      items: [pdf, pluginX],
      countByProvenance: { self: 0, marketplace: 0, plugin: 1, builtin: 1 },
      countByStatus: { in: 0, out: 2 },
      countByScope: { asset: 2, environment: 2 },
    });
    let curated = false;
    vi.spyOn(api, 'listSkills').mockImplementation((params) => {
      if (params?.scope === 'environment') return Promise.resolve(curated ? envAfter : envResult);
      return Promise.resolve(curated ? assetAfter : assetResult);
    });
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: airbnb, rawContent: '# airbnb' });
    vi.spyOn(api, 'curateSkill').mockImplementation(() => {
      curated = true;
      return Promise.resolve({ skill: airbnbCurated });
    });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /本机技能环境 3/ }));
    fireEvent.click(await screen.findByRole('button', { name: '展开 airbnb 卡片' }));
    fireEvent.click(await screen.findByRole('button', { name: '收藏到我的库' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认收藏' }));
    expect(await screen.findByText(/本机技能环境 2/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '展开 plugin-x 卡片' })).toBeInTheDocument();
    });
  });
});
