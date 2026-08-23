import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

/**
 * Sidebar 组件测试
 *
 * 验证 spec: vault-page R1（双栏布局，资产库左侧导航动态显示）
 * 验证 spec: assetplex-asset-taxonomy（类别从配置读取，不写死）
 */

function renderSidebar(initialPath = '/'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('渲染 5 个主导航项', () => {
    renderSidebar();

    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('资产库')).toBeInTheDocument();
    expect(screen.getByText('连接')).toBeInTheDocument();
    expect(screen.getByText('活动')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
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
});
