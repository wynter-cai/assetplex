import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Projects from './Projects';
import { api } from '@/lib/api';
import type { ProjectInfo, ProjectListResult } from '@/types/api';

function project(partial: Partial<ProjectInfo> & { id: string; name: string; path: string; exists: boolean }): ProjectInfo {
  return {
    lastAccessedAt: null,
    tools: [],
    assetStats: { rules: 0, skills: 0, docs: 0 },
    git: { isGitRepo: false, branch: null, hasUncommittedChanges: false },
    ...partial,
  };
}

const result: ProjectListResult = {
  total: 2,
  existingCount: 1,
  items: [
    project({
      id: 'alive',
      name: 'alive',
      path: 'd:/proj/alive',
      exists: true,
      lastAccessedAt: '2026-10-01T00:00:00.000Z',
      tools: [
        { tool: 'trae', marker: '.trae 目录', path: '.trae' },
        { tool: 'AGENTS.md', marker: 'AGENTS.md 文件', path: 'AGENTS.md' },
      ],
      assetStats: { rules: 2, skills: 1, docs: 4 },
      git: { isGitRepo: true, branch: 'main', hasUncommittedChanges: true },
    }),
    project({ id: 'gone', name: 'gone', path: 'd:/proj/gone', exists: false }),
  ],
};

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Projects />
    </QueryClientProvider>,
  );
}

describe('Projects 项目页', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listProjects').mockResolvedValue(result);
    vi.spyOn(api, 'openProject').mockResolvedValue({ ok: true });
  });

  it('显示总数/存在数与项目卡信息（标记/统计/git）', async () => {
    renderPage();
    expect(await screen.findByText(/共 2 个，目录仍存在 1 个/)).toBeInTheDocument();
    expect(screen.getByText('alive')).toBeInTheDocument();
    expect(screen.getByText(/TRAE · \.trae/)).toBeInTheDocument();
    expect(screen.getByText('规则 2')).toBeInTheDocument();
    expect(screen.getByText('技能 1')).toBeInTheDocument();
    expect(screen.getByText('文档 4')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('有未提交变更')).toBeInTheDocument();
  });

  it('已删除项目弱化并禁用打开按钮', async () => {
    renderPage();
    await screen.findByText('gone');
    expect(screen.getByText('已不在原位置')).toBeInTheDocument();
    const goneCard = screen.getByText('gone').closest('.opacity-60');
    expect(goneCard).not.toBeNull();
    const openButtons = screen.getAllByRole('button', { name: /文件管理器/ });
    expect(openButtons[1]).toBeDisabled();
  });

  it('点击打开按钮调用 openProject', async () => {
    renderPage();
    const terminalButtons = await screen.findAllByRole('button', { name: /终端/ });
    fireEvent.click(terminalButtons[0]);
    await waitFor(() => {
      expect(api.openProject).toHaveBeenCalledWith('alive', 'terminal');
    });
  });

  it('开启"仅看存在的项目"以 existingOnly 查询', async () => {
    renderPage();
    await screen.findByText('alive');
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => {
      expect(api.listProjects).toHaveBeenLastCalledWith({ existingOnly: true, search: undefined });
    });
  });

  it('无记录时显示空状态', async () => {
    vi.spyOn(api, 'listProjects').mockResolvedValue({ items: [], total: 0, existingCount: 0 });
    renderPage();
    expect(await screen.findByText('暂无 TRAE 项目记录')).toBeInTheDocument();
  });
});
