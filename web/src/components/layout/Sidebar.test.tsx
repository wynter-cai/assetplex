import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { api } from '@/lib/api';
import { makeCategoryDescriptor } from '@/lib/test-factories';
import { APP_VERSION } from '@/lib/app-version';
import { HOME_DASHBOARD_QUERY_KEY } from '@/lib/use-home-dashboard';
import type { HomeDashboardResponse } from '@/types/api';

/**
 * Sidebar 组件测试
 *
 * 验证 spec: refactor-home-action-panel/specs/navigation.spec.md
 *   R1 五组结构 / R2 命中自动展开与手动折叠 / R3 质量中心徽标 / R6 键盘与语义
 * 验证 spec: asset-center-consistency Scenario 1（类别清单唯一声明源在后端）
 */

function makeDashboard(total: number | null): HomeDashboardResponse {
  return {
    generatedAt: '2026-11-15T00:00:00.000Z',
    hubInitialized: true,
    status: {
      healthScore: 80,
      healthGrade: 'good',
      totalAssets: 10,
      unsyncedCount: 1,
      lastBackupAt: null,
      backupState: 'none',
    },
    issues: { available: total !== null, total, bySeverity: null, items: [] },
    tools: [],
    recentActivity: [],
    healthComputedAt: '2026-11-15T00:00:00.000Z',
    partial: false,
    failedTools: [],
  };
}

interface RenderOptions {
  /** 预置首页聚合缓存（undefined = 从未加载过首页） */
  dashboardTotal?: number | null;
}

function renderSidebar(initialPath = '/', options: RenderOptions = {}): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (options.dashboardTotal !== undefined) {
    queryClient.setQueryData(HOME_DASHBOARD_QUERY_KEY, makeDashboard(options.dashboardTotal));
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sidebar — 五组结构（navigation Scenario 1.1/1.2）', () => {
  it('从上到下呈现总览 / 资产库 / 质量中心 / 连接与同步 / 活动', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: '主导航' });
    const text = nav.textContent ?? '';
    const order = ['总览', '资产库', '质量中心', '连接与同步', '活动'].map((label) =>
      text.indexOf(label),
    );
    order.forEach((index) => expect(index).toBeGreaterThanOrEqual(0));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('总览与活动是直接链接，不含展开按钮（Scenario 1.2）', () => {
    renderSidebar();
    const homeLink = screen.getByRole('link', { name: '总览' });
    expect(homeLink).toHaveAttribute('href', '/');
    const activityLink = screen.getByRole('link', { name: '活动' });
    expect(activityLink).toHaveAttribute('href', '/activities');
    expect(screen.queryByRole('button', { name: /总览|活动/ })).not.toBeInTheDocument();
  });

  it('资产库 / 质量中心 / 连接与同步是组按钮，带 aria-expanded 与 aria-controls（Scenario 1.2/6.1）', () => {
    renderSidebar('/vault');
    for (const label of ['资产库', '质量中心', '连接与同步']) {
      const groupButton = screen.getByRole('button', { name: new RegExp(label) });
      expect(groupButton).toHaveAttribute('aria-expanded');
      const controls = groupButton.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(document.getElementById(controls as string)).not.toBeNull();
    }
  });

  it('不存在「更多」折叠层，也不把子项平铺成一级入口（Scenario 1.1）', () => {
    renderSidebar();
    expect(screen.queryByText('更多')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '同步' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '切换' })).not.toBeInTheDocument();
  });

  it('设置 / 新手引导 / 版本号固定在底部区（Scenario 1.1）', () => {
    renderSidebar();
    const settings = screen.getByRole('link', { name: '设置' });
    expect(settings).toHaveAttribute('href', '/settings');
    expect(screen.getByTestId('nav-onboarding')).toHaveAttribute('href', '/onboarding');
    expect(screen.getByText(new RegExp(APP_VERSION))).toBeInTheDocument();
    expect(screen.getByText('AssetPlex')).toBeInTheDocument();
  });
});

describe('Sidebar — 子项内容（Scenario 1.3/1.4）', () => {
  it('资产库子项为动态类别清单 +「发现外部技能」，不再列出裁决准则', () => {
    renderSidebar('/vault');
    const list = screen.getByRole('navigation', { name: '资产类别' });
    expect(within(list).getByText('身份')).toBeInTheDocument();
    expect(within(list).getByText('技能')).toBeInTheDocument();
    expect(within(list).getByText('规则')).toBeInTheDocument();
    expect(within(list).getByText('MCP')).toBeInTheDocument();
    // governance-center Scenario 6.1：裁决准则迁入质量中心，资产库不再单列
    expect(within(list).queryByText('裁决准则')).not.toBeInTheDocument();
    expect(within(list).getByRole('link', { name: '发现外部技能' })).toHaveAttribute(
      'href',
      '/discover',
    );
  });

  it('接口新增类别自动出现在资产库子项，且不再出现未下发的旧类别', async () => {
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      declaredAt: '2026-10-26T00:00:00.000Z',
      categories: [
        makeCategoryDescriptor({ code: 'identity', label: '身份', order: 10 }),
        makeCategoryDescriptor({ code: 'plugin', label: '插件', order: 70 }),
      ],
    });

    renderSidebar('/vault');

    await waitFor(() => expect(screen.getByText('插件')).toBeInTheDocument());
    expect(screen.queryByText('规则')).not.toBeInTheDocument();
    expect(screen.getByText('插件').closest('a')).toHaveAttribute('href', '/vault/plugin');
  });

  it('接口不可用时回退 fallback 且不白屏', async () => {
    vi.spyOn(api, 'getAssetCategories').mockRejectedValue(new Error('network down'));

    renderSidebar('/vault');

    await waitFor(() => expect(screen.getByText('身份')).toBeInTheDocument());
    expect(screen.getByText('技能')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '总览' })).toBeInTheDocument();
  });

  it('质量中心子项为体检报告 / 跨类别批量 / 规则与忽略 / 重复项 / 裁决准则（Scenario 1.1 / 6.1）', () => {
    renderSidebar('/quality');
    const list = screen.getByRole('navigation', { name: '质量中心子项' });
    const expected: Array<[string, string]> = [
      ['体检报告', '/quality'],
      ['跨类别批量', '/quality/batch'],
      ['规则与忽略', '/quality/rules'],
      ['重复项', '/duplicates'],
      ['裁决准则', '/quality/criteria'],
    ];
    for (const [label, to] of expected) {
      expect(within(list).getByRole('link', { name: label })).toHaveAttribute('href', to);
    }
  });

  it('连接与同步子项为工具连接 / 分发与同步 / 项目工作区', () => {
    renderSidebar('/connections');
    const list = screen.getByRole('navigation', { name: '连接与同步子项' });
    const expected: Array<[string, string]> = [
      ['工具连接', '/connections'],
      ['分发与同步', '/sync'],
      ['项目工作区', '/projects'],
    ];
    for (const [label, to] of expected) {
      expect(within(list).getByRole('link', { name: label })).toHaveAttribute('href', to);
    }
  });
});

describe('Sidebar — 命中与展开（Scenario 2.1–2.4）', () => {
  it('深链 /projects 自动展开「连接与同步」并高亮「项目工作区」', () => {
    renderSidebar('/projects');
    const groupButton = screen.getByRole('button', { name: /连接与同步/ });
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: '项目工作区' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: /资产库/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('访问 /vault/rule：资产库展开、规则高亮、总览不误高亮（Scenario 2.2）', () => {
    renderSidebar('/vault/rule');
    expect(screen.getByRole('button', { name: /资产库/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: /资产库/ })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('link', { name: '规则' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '总览' })).not.toHaveAttribute('aria-current');
  });

  it('访问 / 只精确命中总览，不误命中其他组', () => {
    renderSidebar('/');
    expect(screen.getByRole('link', { name: '总览' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /资产库/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('手动折叠后子项隐藏，组按钮保留命中态且页面不卸载（Scenario 2.3）', () => {
    renderSidebar('/duplicates');
    const groupButton = screen.getByRole('button', { name: /质量中心/ });
    expect(screen.getByRole('link', { name: '重复项' })).toBeInTheDocument();

    fireEvent.click(groupButton);

    expect(screen.queryByRole('link', { name: '重复项' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /质量中心/ })).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByRole('button', { name: /质量中心/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // 当前页链接仍在（高亮位置没丢）
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
  });

  it('手动折叠的组在路由切换后重新按命中自动展开（Scenario 2.4）', () => {
    // 探针：模拟「通过任意入口再次进入 /sync」
    function NavProbe(): JSX.Element {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/sync')}>
          去同步页
        </button>
      );
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/sync']}>
          <Sidebar />
          <NavProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const groupButton = screen.getByRole('button', { name: /连接与同步/ });
    fireEvent.click(groupButton);
    expect(screen.queryByRole('link', { name: '项目工作区' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '活动' }));
    expect(screen.getByRole('button', { name: /连接与同步/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    // 再次进入命中路由：重新自动展开并高亮子项
    fireEvent.click(screen.getByRole('button', { name: '去同步页' }));
    expect(screen.getByRole('button', { name: /连接与同步/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: '分发与同步' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('可手动展开未命中的组（渐进披露，不强制只看命中组）', () => {
    renderSidebar('/');
    const groupButton = screen.getByRole('button', { name: /质量中心/ });
    expect(groupButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(groupButton);
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: '重复项' })).toBeInTheDocument();
  });

  it('访问 /quality 自动展开质量中心组并高亮体检报告（Scenario 1.4）', () => {
    renderSidebar('/quality');
    expect(screen.getByRole('button', { name: /质量中心/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: '体检报告' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('访问 /quality/batch 时只有跨类别批量高亮（Scenario 1.4）', () => {
    renderSidebar('/quality/batch');
    expect(screen.getByRole('link', { name: '跨类别批量' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '体检报告' })).not.toHaveAttribute('aria-current');
  });
});

describe('Sidebar — 质量中心徽标（Scenario 3.1–3.3）', () => {
  it('首页数据已加载且待治理为 12 时，组按钮显示 12（与状态条同源）', () => {
    renderSidebar('/', { dashboardTotal: 12 });
    const badge = screen.getByLabelText('12 项待治理');
    expect(badge).toHaveTextContent('12');
    const groupButton = screen.getByRole('button', { name: /质量中心/ });
    expect(within(groupButton).getByText('12')).toBeInTheDocument();
  });

  it('待治理为 0 时不显示徽标', () => {
    renderSidebar('/', { dashboardTotal: 0 });
    expect(screen.queryByLabelText(/项待治理/)).not.toBeInTheDocument();
  });

  it('数据未加载（或读取失败）时不显示徽标，也不额外请求接口', () => {
    const spy = vi.spyOn(api, 'getHomeDashboard');
    renderSidebar('/settings');
    expect(screen.queryByLabelText(/项待治理/)).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('待治理不可用（total 为 null）时不显示徽标', () => {
    renderSidebar('/', { dashboardTotal: null });
    expect(screen.queryByLabelText(/项待治理/)).not.toBeInTheDocument();
  });
});

describe('Sidebar — 语义与无障碍（Scenario 6.1/6.2）', () => {
  it('不存在按钮嵌套在链接内的非法结构', () => {
    const { container } = renderSidebar('/vault');
    expect(container.querySelectorAll('a button')).toHaveLength(0);
  });

  it('组按钮与链接并列，Tab 顺序不被非法结构打断', () => {
    renderSidebar('/');
    const groupButton = screen.getByRole('button', { name: /质量中心/ });
    expect(groupButton.closest('a')).toBeNull();
  });

  it('地标有名字：侧边栏、主导航、资产类别', () => {
    renderSidebar('/vault');
    expect(screen.getByRole('complementary', { name: '侧边栏' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '资产类别' })).toBeInTheDocument();
  });
});
