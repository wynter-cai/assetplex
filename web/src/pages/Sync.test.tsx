/**
 * 同步页危险动作卫生测试（fix-trust-and-consistency I5）
 *
 * spec: product-surface-hygiene
 * - Scenario 3 未选目标不可执行（隐式「不选=全部已启用」下线）
 * - Scenario 4 执行前必须显示影响范围
 * - Scenario 5 预览开关可感知、可解释
 * - Scenario 6 未安装目标可识别且给出口
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sync from './Sync';
import { api } from '@/lib/api';
import type { SyncPlan } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    getTools: vi.fn(),
    getSyncPlan: vi.fn(),
    runSync: vi.fn(),
  },
}));

const TOOLS = [
  { name: 'trae-cn', installed: true, configDirExists: true, configDir: '/tools/trae', enabled: true, version: '3.2.1' },
  { name: 'workbuddy', installed: true, configDirExists: true, configDir: '/tools/wb', enabled: true },
  { name: 'codex', installed: false, configDirExists: false, configDir: '/tools/codex', enabled: undefined },
];

function planItem(action: string, warning?: string): SyncPlan['items'][number] {
  return {
    item: { type: 'rule', relativePath: 'rules/demo.md', absolutePath: '/hub/rules/demo.md' },
    target: { tool: 'trae-cn', targetPath: '/tool/rules', strategy: 'symlink', isDirectory: true },
    action,
    warning,
  } as unknown as SyncPlan['items'][number];
}

const PLANS: SyncPlan[] = [
  {
    tool: 'trae-cn',
    toolInstalled: true,
    // 3 项变更（含 1 项覆盖冲突）+ 1 项跳过
    items: [planItem('symlink'), planItem('copy', '目标已存在，将被覆盖'), planItem('symlink'), planItem('skip')],
  },
  { tool: 'workbuddy', toolInstalled: true, items: [] },
];

function renderPage(): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sync']}>
        <Sync />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getTools).mockResolvedValue({ tools: TOOLS } as never);
  vi.mocked(api.getSyncPlan).mockResolvedValue({ plans: PLANS });
  vi.mocked(api.runSync).mockResolvedValue({ results: [] } as never);
});

describe('Sync 未选目标不可执行（Scenario 3）', () => {
  it('初始状态主操作禁用，紧邻文案为「请先选择目标工具」', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: /执行同步/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('请先选择目标工具')).toBeInTheDocument();
  });

  it('不再出现「未选择将同步全部已启用工具」的隐式行为文案', async () => {
    const { container } = renderPage();
    await screen.findByRole('button', { name: /执行同步/ });
    expect(container.textContent).not.toMatch(/将同步到全部/);
  });

  it('执行时始终以已选目标调用接口，不传空列表', async () => {
    renderPage();
    const card = await screen.findByRole('button', { name: /TRAE 中国版/ });
    fireEvent.click(card);

    const button = screen.getByRole('button', { name: /执行同步/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(api.runSync).toHaveBeenCalledWith(['trae-cn'], false));
  });
});

describe('Sync 影响范围（Scenario 4）', () => {
  it('选中 1 个工具有 3 项变更 1 项冲突时，逐字显示影响范围', async () => {
    renderPage();
    const card = await screen.findByRole('button', { name: /TRAE 中国版/ });
    fireEvent.click(card);
    expect(await screen.findByText('将影响 1 个工具 · 3 项变更 · 1 项冲突')).toBeInTheDocument();
  });

  it('选中的工具均无内容时禁用主操作并说「没有需要同步的内容」', async () => {
    renderPage();
    const card = await screen.findByRole('button', { name: /WorkBuddy/ });
    fireEvent.click(card);
    expect(await screen.findByText('没有需要同步的内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /执行同步/ })).toBeDisabled();
  });
});

describe('Sync 预览开关（Scenario 5）', () => {
  it('开关具备可访问名称，状态变化时文案与按钮文案同时跟着变', async () => {
    renderPage();
    const sw = await screen.findByRole('switch', { name: '预览模式' });
    expect(screen.getByText('执行模式：将写入文件')).toBeInTheDocument();

    fireEvent.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    expect(screen.getByText('预览模式：只计算不写入')).toBeInTheDocument();
    expect(screen.queryByText('执行模式：将写入文件')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: /TRAE 中国版/ }));
    expect(await screen.findByRole('button', { name: /生成预览/ })).toBeInTheDocument();
  });

  it('预览模式下执行走 dryRun', async () => {
    renderPage();
    const sw = await screen.findByRole('switch', { name: '预览模式' });
    fireEvent.click(sw);
    const card = await screen.findByRole('button', { name: /TRAE 中国版/ });
    fireEvent.click(card);
    const button = await screen.findByRole('button', { name: /生成预览/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(api.runSync).toHaveBeenCalledWith(['trae-cn'], true));
  });
});

describe('Sync 未安装目标（Scenario 6）', () => {
  it('未安装卡片呈禁用态、点不动，并给出「安装后重新扫描即可启用」', async () => {
    renderPage();
    const card = await screen.findByRole('button', { name: /OpenAI Codex/ });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('安装后重新扫描即可启用')).toBeInTheDocument();

    fireEvent.click(card);
    expect(screen.getByText('请先选择目标工具')).toBeInTheDocument();
  });
});
