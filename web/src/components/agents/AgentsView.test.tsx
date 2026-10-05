import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsView } from './AgentsView';
import { api } from '@/lib/api';
import type { AgentListResult, AgentDetailResult } from '@/types/api';

const listResult: AgentListResult = {
  total: 2,
  items: [
    {
      id: 'claude:custom-subagent:reviewer',
      name: 'reviewer',
      description: '代码审查专家',
      tool: 'claude',
      kind: 'custom-subagent',
      sourcePath: '/u/.claude/agents/reviewer.md',
      lastModifiedAt: '2026-09-01T00:00:00.000Z',
      userCreated: true,
    },
    {
      id: 'trae:builtin-persona:hebe',
      name: 'hebe',
      description: '文档 persona',
      tool: 'trae',
      kind: 'builtin-persona',
      sourcePath: '/u/.trae-cn/builtin/work/hebe/skills',
      lastModifiedAt: null,
      userCreated: false,
    },
  ],
  countByKind: { 'custom-subagent': 1, expert: 0, 'builtin-persona': 1, 'plugin-agent': 0 },
  countByTool: { trae: 1, codebuddy: 0, claude: 1, codex: 0 },
};

const detailResult: AgentDetailResult = {
  agent: listResult.items[0],
  rawContent: '---\nname: reviewer\n---\n原始定义正文',
};

function renderView(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentsView />
    </QueryClientProvider>,
  );
}

describe('AgentsView 智能体只读视图', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(listResult);
    vi.spyOn(api, 'getAgent').mockResolvedValue(detailResult);
  });

  it('渲染智能体卡片与计数', async () => {
    renderView();
    expect(await screen.findByText('reviewer')).toBeInTheDocument();
    expect(screen.getByText('hebe')).toBeInTheDocument();
    expect(screen.getByText(/共 2 个智能体/)).toBeInTheDocument();
    // 类型计数
    expect(screen.getByText(/自建子代理 1/)).toBeInTheDocument();
    expect(screen.getByText(/内置 Persona 1/)).toBeInTheDocument();
  });

  it('自建智能体显示自建标记', async () => {
    renderView();
    await screen.findByText('reviewer');
    expect(screen.getByText('自建')).toBeInTheDocument();
  });

  it('点击类型筛选会以 kind 参数重新查询', async () => {
    renderView();
    await screen.findByText('reviewer');
    fireEvent.click(screen.getByText(/内置 Persona 1/));
    await waitFor(() => {
      expect(api.listAgents).toHaveBeenLastCalledWith({
        kind: 'builtin-persona',
        tool: undefined,
        search: undefined,
      });
    });
  });

  it('点开详情展示原始内容且无编辑/保存按钮', async () => {
    renderView();
    fireEvent.click(await screen.findByText('reviewer'));
    expect(await screen.findByText('原始定义正文', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/只读盘点/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
    expect(screen.queryByText('编辑')).not.toBeInTheDocument();
  });
});
