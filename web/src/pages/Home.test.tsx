import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './Home';
import { api } from '@/lib/api';
import type { GovernanceHealth, OverviewData } from '@/types/api';

const governanceHealth: GovernanceHealth = {
  score: 85,
  grade: 'good',
  totalAssets: 15,
  dimensions: [
    { id: 'completeness', label: '完整性', applicability: 'applicable', weight: 30, effectiveWeight: 30, score: 90, evaluatedAssets: 15, issueCount: 1, topIssues: [] },
    { id: 'quality', label: '规范性', applicability: 'applicable', weight: 30, effectiveWeight: 30, score: 80, evaluatedAssets: 15, issueCount: 2, topIssues: [] },
    { id: 'distribution', label: '分发一致性', applicability: 'applicable', weight: 25, effectiveWeight: 25, score: 85, evaluatedAssets: 10, issueCount: 1, topIssues: [] },
    { id: 'uniqueness', label: '唯一性', applicability: 'applicable', weight: 15, effectiveWeight: 15, score: 100, evaluatedAssets: 15, issueCount: 0, topIssues: [] },
  ],
  qualityMode: 'mechanical+ai',
  computedAt: '2026-11-08T00:00:00.000Z',
  cached: false,
};

/**
 * Home 页面测试
 *
 * 验证 spec: home-page 的核心 Scenario
 * Home 已接入 GET /api/hub/overview（TanStack Query），此处 mock api.getOverview
 * 返回固定数据验证各区域渲染。断言用 findBy* 等待查询异步加载完成。
 */

const overviewData: OverviewData = {
  hubInitialized: true,
  healthScore: 85,
  assetStats: { identity: 1, skill: 3, rule: 5, mcp: 2, agent: 4 },
  connections: [
    { toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced', assetCount: 3, pendingCount: 0 },
    { toolId: 'workbuddy', toolName: 'WorkBuddy', status: 'synced', assetCount: 2, pendingCount: 0 },
    { toolId: 'claude', toolName: 'Claude Code', status: 'synced', assetCount: 4, pendingCount: 0 },
    { toolId: 'codex', toolName: 'Codex', status: 'not_connected', assetCount: 0, pendingCount: 0 },
  ],
  recentActivities: [
    { id: 'a1', type: 'import', description: '从 TRAE 导入 identity/profile.md', occurredAt: new Date().toISOString() },
  ],
};

function renderHome(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Home 页面', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getOverview').mockResolvedValue(overviewData);
    vi.spyOn(api, 'getGovernanceHealth').mockResolvedValue(governanceHealth);
  });

  it('渲染健康卡主区（真实四维健康分）', async () => {
    renderHome();
    expect(await screen.findByText('资产健康')).toBeInTheDocument();
    expect(screen.getByText(/共 15 项/)).toBeInTheDocument();
    expect(screen.getByText('完整性')).toBeInTheDocument();
    expect(screen.getByText('规范性')).toBeInTheDocument();
  });

  it('渲染资产快照区域（含 5 类资产数量与总数）', async () => {
    renderHome();
    expect(await screen.findByText('资产快照')).toBeInTheDocument();
    // mock 数据中 identity=1, skill=3, rule=5, mcp=2, agent=4 → 共 15 项
    expect(screen.getByText('身份')).toBeInTheDocument();
    expect(screen.getByText('技能')).toBeInTheDocument();
    expect(screen.getByText('规则')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('智能体')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/我的库 15 项/)).toBeInTheDocument();
  });

  it('渲染连接状态区域（含工具列表）', async () => {
    renderHome();
    expect(await screen.findByText('连接状态')).toBeInTheDocument();
    expect(screen.getByText('TRAE 中国版')).toBeInTheDocument();
    expect(screen.getByText('WorkBuddy')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
  });

  it('渲染快速动作区域（含收藏按钮）', async () => {
    renderHome();
    expect(await screen.findByText('快速动作')).toBeInTheDocument();
    expect(screen.getByText('收藏资产')).toBeInTheDocument();
    expect(screen.getByText('同步')).toBeInTheDocument();
    expect(screen.getByText('新建技能')).toBeInTheDocument();
  });

  it('渲染最近活动区域（含活动记录，不提供查看全部死链）', async () => {
    renderHome();
    expect(await screen.findByText('最近活动')).toBeInTheDocument();
    // mock 数据中的第一条活动
    expect(screen.getByText(/从 TRAE 导入 identity\/profile.md/)).toBeInTheDocument();
    // 活动页尚未实现，P0 移除指向不存在页面的「查看全部」
    expect(screen.queryByText('查看全部')).not.toBeInTheDocument();
  });

  it('渲染健康度分数', async () => {
    renderHome();
    // mock governance health score = 85
    expect(await screen.findByTestId('health-score')).toHaveTextContent('85');
    expect(screen.getByText('资产健康')).toBeInTheDocument();
  });
});
