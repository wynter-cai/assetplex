import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsView } from './AgentsView';
import { api } from '@/lib/api';
import { Toaster } from '@/components/ui/toast';
import { useToastStore } from '@/lib/toast-store';
import type { AgentListResult, AgentDetailResult, AgentInfo, ToolStatus } from '@/types/api';

beforeEach(() => {
  useToastStore.getState().reset();
});

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
  countByTool: { trae: 1, codebuddy: 0, claude: 1, codex: 0, hub: 0 },
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
      <Toaster />
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

  it('详情打开时按 Esc 关闭面板', async () => {
    renderView();
    fireEvent.click(await screen.findByText('reviewer'));
    expect(await screen.findByText('定义位置')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('定义位置')).not.toBeInTheDocument();
    });
  });

  it('输入框内按 Esc 不关闭详情面板', async () => {
    renderView();
    fireEvent.click(await screen.findByText('reviewer'));
    expect(await screen.findByText('定义位置')).toBeInTheDocument();
    const searchBox = screen.getByPlaceholderText('搜索智能体名称或描述...');
    fireEvent.keyDown(searchBox, { key: 'Escape' });
    expect(screen.getByText('定义位置')).toBeInTheDocument();
  });
});

describe('AgentsView 我的库写管理', () => {
  const hubAgent: AgentInfo = {
    id: 'hub:custom-subagent:测试专家',
    name: '测试专家',
    description: '负责生成测试用例',
    tool: 'hub',
    kind: 'custom-subagent',
    sourcePath: '/hub/agents/测试专家.md',
    lastModifiedAt: '2026-09-01T00:00:00.000Z',
    userCreated: true,
  };
  const pluginAgent: AgentInfo = {
    id: 'trae:plugin-agent:搜索助手',
    name: '搜索助手',
    description: '插件提供的智能体',
    tool: 'trae',
    kind: 'plugin-agent',
    sourcePath: '/u/.trae-cn/plugins/search/agent.md',
    lastModifiedAt: null,
    userCreated: false,
  };

  const writeList: AgentListResult = {
    total: 3,
    items: [hubAgent, pluginAgent, listResult.items[1]],
    countByKind: { 'custom-subagent': 1, expert: 0, 'builtin-persona': 1, 'plugin-agent': 1 },
    countByTool: { trae: 2, codebuddy: 0, claude: 0, codex: 0, hub: 1 },
  };

  const twoTools: ToolStatus[] = [
    { name: 'trae', installed: true, configDirExists: true, configDir: '/u/.trae-cn' },
    { name: 'claude-code', installed: true, configDirExists: true, configDir: '/u/.claude' },
  ];

  function mockWriteApis(): void {
    vi.spyOn(api, 'listAgents').mockResolvedValue(writeList);
    vi.spyOn(api, 'getAgent').mockResolvedValue({ agent: hubAgent, rawContent: '---\nname: 测试专家\n---\n你是测试专家' });
    vi.spyOn(api, 'createAgent').mockResolvedValue({ agent: hubAgent });
    vi.spyOn(api, 'updateAgent').mockResolvedValue({ agent: hubAgent });
    vi.spyOn(api, 'deleteAgent').mockResolvedValue({ success: true });
    vi.spyOn(api, 'runSync').mockResolvedValue({ results: [] });
    vi.spyOn(api, 'getTools').mockResolvedValue({ tools: twoTools });
  }

  beforeEach(() => {
    mockWriteApis();
  });

  it('工具栏新建智能体：填写名称/描述/提示词提交后调用创建接口并关闭表单', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '新建智能体' }));
    fireEvent.change(screen.getByLabelText('智能体名称'), { target: { value: '测试专家' } });
    fireEvent.change(screen.getByLabelText('智能体描述'), { target: { value: '负责生成测试用例' } });
    fireEvent.change(screen.getByLabelText('系统提示词'), { target: { value: '你是测试专家' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => {
      expect(api.createAgent).toHaveBeenCalledWith({
        name: '测试专家',
        description: '负责生成测试用例',
        content: '你是测试专家',
      });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('智能体名称')).not.toBeInTheDocument();
    });
  });

  it('我的库智能体详情提供编辑/删除/同步分发', async () => {
    renderView();
    fireEvent.click(await screen.findByText('测试专家'));
    expect(await screen.findByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '同步分发' })).toBeInTheDocument();
  });

  it('内置 Persona 详情不提供编辑/删除/同步分发', async () => {
    renderView();
    fireEvent.click(await screen.findByText('hebe'));
    expect(await screen.findByText(/只读盘点/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '同步分发' })).not.toBeInTheDocument();
  });

  it('插件智能体详情只提供同步分发，保持只读', async () => {
    renderView();
    fireEvent.click(await screen.findByText('搜索助手'));
    expect(await screen.findByRole('button', { name: '同步分发' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('编辑保存调用更新接口并传入修改后的全文', async () => {
    renderView();
    fireEvent.click(await screen.findByText('测试专家'));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    const textarea = screen.getByLabelText('编辑定义文件内容') as HTMLTextAreaElement;
    expect(textarea.value).toContain('你是测试专家');
    fireEvent.change(textarea, { target: { value: '你是资深测试专家' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith('hub:custom-subagent:测试专家', '你是资深测试专家');
    });
  });

  it('保存时智能体不存在则提示错误并刷新列表', async () => {
    vi.spyOn(api, 'updateAgent').mockRejectedValue(new Error('智能体不存在：hub:custom-subagent:测试专家'));
    renderView();
    fireEvent.click(await screen.findByText('测试专家'));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(screen.getByText('保存失败')).toBeInTheDocument();
      expect(screen.getByText('智能体不存在：hub:custom-subagent:测试专家')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.listAgents).toHaveBeenCalledTimes(2);
    });
  });

  it('删除时确认对话框警示影响范围，确认后调用删除接口', async () => {
    renderView();
    fireEvent.click(await screen.findByText('测试专家'));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    expect(await screen.findByText(/将从我的库及所有已分发工具中删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => {
      expect(api.deleteAgent).toHaveBeenCalledWith('hub:custom-subagent:测试专家');
    });
  });

  it('同步分发：选择目标工具执行后展示各工具成功/失败结果', async () => {
    vi.spyOn(api, 'runSync').mockResolvedValue({
      results: [
        { tool: 'claude-code', success: true, itemCount: 2, skippedCount: 0, errors: [], warnings: [], durationMs: 8 },
        { tool: 'trae', success: false, itemCount: 0, skippedCount: 0, errors: ['目录不可写'], warnings: [], durationMs: 2 },
      ],
    });
    renderView();
    fireEvent.click(await screen.findByText('测试专家'));
    fireEvent.click(await screen.findByRole('button', { name: '同步分发' }));
    fireEvent.click(await screen.findByLabelText('选择同步目标 trae'));
    fireEvent.click(screen.getByLabelText('选择同步目标 claude-code'));
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    expect(await screen.findByText('同步结果')).toBeInTheDocument();
    expect(screen.getByText('Claude Code 成功')).toBeInTheDocument();
    expect(screen.getByText('TRAE 失败')).toBeInTheDocument();
    expect(screen.getByText('目录不可写')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.runSync).toHaveBeenCalledWith(['trae', 'claude-code'], false);
    });
  });
});

describe('AgentsView 页头（spec refactor-design-system page-headers）', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(listResult);
    vi.spyOn(api, 'getAgent').mockResolvedValue(detailResult);
  });

  it('呈现类别 H1「智能体」', async () => {
    renderView();
    expect(await screen.findByRole('heading', { level: 1, name: '智能体' })).toBeInTheDocument();
  });
});
