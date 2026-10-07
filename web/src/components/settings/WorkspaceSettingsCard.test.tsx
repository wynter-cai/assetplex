/**
 * 工作区发现管理卡片测试
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceSettingsCard } from './WorkspaceSettingsCard';
import { api } from '@/lib/api';
import { Toaster } from '@/components/ui/toast';
import { useToastStore } from '@/lib/toast-store';
import type { WorkspacesResponse } from '@/types/api';

function overview(partial?: Partial<WorkspacesResponse>): WorkspacesResponse {
  return {
    config: { autoDiscover: true, roots: ['d:/manual'], disabledWorkspaces: [] },
    workspaces: [
      { path: 'd:/manual', name: 'manual', source: 'manual', skillsDirExists: true, skillCount: 2 },
      { path: 'd:/ws1', name: 'ws1', source: 'auto', skillsDirExists: true, skillCount: 3 },
    ],
    truncated: false,
    maxWorkspaces: 100,
    errors: [],
    ...partial,
  };
}

function renderCard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSettingsCard />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('WorkspaceSettingsCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useToastStore.getState().reset();
  });

  it('展示工作区列表、来源与技能计数，自动发现开关为开', async () => {
    vi.spyOn(api, 'getWorkspaces').mockResolvedValue(overview());
    vi.spyOn(api, 'updateWorkspaces').mockResolvedValue(overview());
    renderCard();
    expect(await screen.findByText('manual')).toBeInTheDocument();
    expect(screen.getByText('ws1')).toBeInTheDocument();
    expect(screen.getByText('2 个技能')).toBeInTheDocument();
    expect(screen.getByText('3 个技能')).toBeInTheDocument();
    expect((screen.getByRole('switch', { name: /从 TRAE 自动发现/ }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
  });

  it('关闭自动发现调用 updateWorkspaces', async () => {
    vi.spyOn(api, 'getWorkspaces').mockResolvedValue(overview());
    const update = vi.spyOn(api, 'updateWorkspaces').mockResolvedValue(overview());
    renderCard();
    await userEvent.click(await screen.findByRole('switch', { name: /从 TRAE 自动发现/ }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ autoDiscover: false });
    });
  });

  it('禁用/启用自动工作区切换 disabledWorkspaces', async () => {
    vi.spyOn(api, 'getWorkspaces').mockResolvedValue(overview());
    const update = vi.spyOn(api, 'updateWorkspaces').mockImplementation(async (body) =>
      overview({
        config: { autoDiscover: true, roots: ['d:/manual'], disabledWorkspaces: body.disabledWorkspaces ?? [] },
        workspaces:
          body.disabledWorkspaces?.includes('d:/ws1')
            ? [
                overview().workspaces[0]!,
                { ...overview().workspaces[1]!, disabled: true },
              ]
            : overview().workspaces,
      }),
    );
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: '禁用工作区 ws1' }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ disabledWorkspaces: ['d:/ws1'] });
    });
    fireEvent.click(await screen.findByRole('button', { name: '启用工作区 ws1' }));
    await waitFor(() => {
      expect(update).toHaveBeenLastCalledWith({ disabledWorkspaces: [] });
    });
  });

  it('添加手动根：回车或按钮提交，提交后输入框清空', async () => {
    vi.spyOn(api, 'getWorkspaces').mockResolvedValue(overview());
    const update = vi
      .spyOn(api, 'updateWorkspaces')
      .mockResolvedValue(overview({ config: { autoDiscover: true, roots: ['d:/manual', 'd:/newroot'], disabledWorkspaces: [] } }));
    renderCard();
    const input = await screen.findByPlaceholderText('工作区或其父目录的绝对路径');
    fireEvent.change(input, { target: { value: 'd:/newroot' } });
    fireEvent.click(screen.getByRole('button', { name: '添加工作区根' }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ roots: ['d:/manual', 'd:/newroot'] });
    });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('移除手动根调用更新', async () => {
    vi.spyOn(api, 'getWorkspaces').mockResolvedValue(overview());
    const update = vi
      .spyOn(api, 'updateWorkspaces')
      .mockResolvedValue(overview({ config: { autoDiscover: true, roots: [], disabledWorkspaces: [] } }));
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: '移除手动根 manual' }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ roots: [] });
    });
  });

  it('显示发现错误与数量截断提示', async () => {
    vi.spyOn(api, 'getWorkspaces').mockResolvedValue(
      overview({ errors: ['未找到 TRAE 工作区记录（storage.json）'], truncated: true }),
    );
    vi.spyOn(api, 'updateWorkspaces').mockResolvedValue(overview());
    renderCard();
    expect(await screen.findByText(/未找到 TRAE 工作区记录/)).toBeInTheDocument();
    expect(screen.getByText(/工作区数量超过上限/)).toBeInTheDocument();
  });

  it('更新失败（如相对路径 400）弹出错误且不清空输入', async () => {
    vi.spyOn(api, 'getWorkspaces').mockResolvedValue(overview());
    vi.spyOn(api, 'updateWorkspaces').mockRejectedValue(new Error('工作区路径必须是绝对路径：relative/x'));
    renderCard();
    const input = await screen.findByPlaceholderText('工作区或其父目录的绝对路径');
    fireEvent.change(input, { target: { value: 'relative/x' } });
    fireEvent.click(screen.getByRole('button', { name: '添加工作区根' }));
    await waitFor(() => {
      expect(screen.getByText('工作区设置保存失败')).toBeInTheDocument();
      expect(screen.getByText(/绝对路径/)).toBeInTheDocument();
    });
    expect((input as HTMLInputElement).value).toBe('relative/x');
  });
});
