import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { api } from '@/lib/api';
import { makeCategoryDescriptor } from '@/lib/test-factories';
import { APP_VERSION } from '@/lib/app-version';

/**
 * Sidebar 组件测试
 *
 * 验证 spec: vault-page R1（双栏布局，资产库左侧导航动态显示）
 * 验证 spec: asset-center-consistency Scenario 1（类别清单唯一声明源在后端，
 *   前端是 fallback + 接口覆盖；tasks I1）
 */

function renderSidebar(initialPath = '/'): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe('Sidebar', () => {
  it('渲染 8 个主导航项（首页/活动/资产库/项目/连接/同步/切换/设置）', () => {
    renderSidebar();

    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('资产库')).toBeInTheDocument();
    expect(screen.getByText('项目')).toBeInTheDocument();
    expect(screen.getByText('连接')).toBeInTheDocument();
    expect(screen.getByText('同步')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();

    // 活动入口（add-activity-log）
    const activityLink = screen.getByText('活动').closest('a');
    expect(activityLink).toHaveAttribute('href', '/activities');

    const projectLink = screen.getByText('项目').closest('a');
    expect(projectLink).toHaveAttribute('href', '/projects');

    // 切换入口(enable-tool-hot-swap T8)
    const swapLink = screen.getByText('切换').closest('a');
    expect(swapLink).toHaveAttribute('href', '/swap');
  });

  it('渲染 4 个资产子类别（从配置读取）', () => {
    renderSidebar();

    // 资产库默认展开，子项应可见
    expect(screen.getByText('身份')).toBeInTheDocument();
    expect(screen.getByText('技能')).toBeInTheDocument();
    expect(screen.getByText('规则')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
  });

  it('点击资产库展开按钮可收起子项', () => {
    renderSidebar();

    // 初始展开
    expect(screen.getByText('身份')).toBeInTheDocument();

    // 点击展开/收起按钮
    const toggleButton = screen.getByLabelText('收起资产库');
    fireEvent.click(toggleButton);

    // 收起后子项应消失
    expect(screen.queryByText('身份')).not.toBeInTheDocument();
    expect(screen.queryByText('技能')).not.toBeInTheDocument();
  });

  it('收起后再次点击可展开', () => {
    renderSidebar();

    const toggleButton = screen.getByLabelText('收起资产库');
    fireEvent.click(toggleButton);

    // 收起后按钮文案变化
    const expandButton = screen.getByLabelText('展开资产库');
    fireEvent.click(expandButton);

    expect(screen.getByText('身份')).toBeInTheDocument();
  });

  it('资产子项链接指向正确的路径', () => {
    renderSidebar();

    const identityLink = screen.getByText('身份').closest('a');
    expect(identityLink).toHaveAttribute('href', '/vault/identity');

    const mcpLink = screen.getByText('MCP').closest('a');
    expect(mcpLink).toHaveAttribute('href', '/vault/mcp');
  });

  it('显示品牌名 AssetPlex', () => {
    renderSidebar();
    expect(screen.getByText('AssetPlex')).toBeInTheDocument();
  });

  it('接口新增类别自动出现在侧栏（I1）', async () => {
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      declaredAt: '2026-10-26T00:00:00.000Z',
      categories: [
        makeCategoryDescriptor({ code: 'identity', label: '身份', order: 10 }),
        makeCategoryDescriptor({ code: 'plugin', label: '插件', order: 70 }),
      ],
    });

    renderSidebar();

    await waitFor(() => expect(screen.getByText('插件')).toBeInTheDocument());
    // 接口只下发 2 类，未下发的旧类别不应再出现——证明侧栏吃的是接口清单而非常量
    expect(screen.queryByText('规则')).not.toBeInTheDocument();
    expect(screen.getByText('插件').closest('a')).toHaveAttribute('href', '/vault/plugin');
  });

  it('接口不可用时回退 fallback 且不白屏（I1）', async () => {
    vi.spyOn(api, 'getAssetCategories').mockRejectedValue(new Error('network down'));

    renderSidebar();

    await waitFor(() => expect(screen.getByText('身份')).toBeInTheDocument());
    expect(screen.getByText('技能')).toBeInTheDocument();
    expect(screen.getByText('首页')).toBeInTheDocument();
  });

  it('底部版本号与 APP_VERSION 一致（I6）', () => {
    renderSidebar();
    expect(screen.getByText(new RegExp(APP_VERSION))).toBeInTheDocument();
  });

  // enhance-a11y-responsive T6（keyboard Scenario 3/6，决策 D5）：
  // <button> 嵌在 <a> 内不合法，折叠按钮必须是链接的并列兄弟
  it('不存在按钮嵌套在链接内的非法结构（Scenario 6）', () => {
    const { container } = renderSidebar();
    expect(container.querySelectorAll('a button')).toHaveLength(0);
  });

  it('折叠按钮用 aria-expanded/aria-controls 描述状态，且指向类别子列表', () => {
    renderSidebar();
    const toggle = screen.getByRole('button', { name: '收起资产库' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).not.toBeNull();

    fireEvent.click(toggle);
    const expand = screen.getByRole('button', { name: '展开资产库' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
  });

  it('地标有名字：侧边栏、主导航、资产类别三个可访问区域（Scenario 6）', () => {
    renderSidebar();
    expect(screen.getByRole('complementary', { name: '侧边栏' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '资产类别' })).toBeInTheDocument();
  });
});
