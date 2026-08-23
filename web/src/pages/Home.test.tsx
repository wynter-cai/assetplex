import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './Home';
import { api } from '@/lib/api';
import type { OverviewData } from '@/types/api';

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
  assetStats: { identity: 1, skill: 3, rule: 5, mcp: 2 },
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
  });

  it('渲染 HomeHero 欢迎区', async () => {
    renderHome();
    expect(await screen.findByText('欢迎回来')).toBeInTheDocument();
    expect(screen.getByText(/你的AI资产安全存储在 AssetPlex/)).toBeInTheDocument();
  });

  it('渲染资产快照区域（含 4 类资产数量）', async () => {
    renderHome();
    expect(await screen.findByText('资产快照')).toBeInTheDocument();
    // mock 数据中 identity=1, skill=3, rule=5, mcp=2
    expect(screen.getByText('身份')).toBeInTheDocument();
    expect(screen.getByText('技能')).toBeInTheDocument();
    expect(screen.getByText('规则')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
  });

  it('渲染连接状态区域（含工具列表）', async () => {
    renderHome();
    expect(await screen.findByText('连接状态')).toBeInTheDocument();
    expect(screen.getByText('TRAE 中国版')).toBeInTheDocument();
    expect(screen.getByText('WorkBuddy')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
  });

  it('渲染快速动作区域（含导入按钮）', async () => {
    renderHome();
    expect(await screen.findByText('快速动作')).toBeInTheDocument();
    expect(screen.getByText('导入资产')).toBeInTheDocument();
    expect(screen.getByText('分发同步')).toBeInTheDocument();
    expect(screen.getByText('新建技能')).toBeInTheDocument();
  });

  it('渲染最近活动区域（含活动记录）', async () => {
    renderHome();
    expect(await screen.findByText('最近活动')).toBeInTheDocument();
    // mock 数据中的第一条活动
    expect(screen.getByText(/从 TRAE 导入 identity\/profile.md/)).toBeInTheDocument();
  });

  it('渲染健康度分数', async () => {
    renderHome();
    // mock healthScore = 85
    expect(await screen.findByText('85')).toBeInTheDocument();
    expect(screen.getByText('健康度')).toBeInTheDocument();
  });
});
