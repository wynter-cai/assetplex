import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsView } from './SkillsView';
import { api } from '@/lib/api';
import type { SkillInfo, SkillListResult, ToolStatus, SyncResult } from '@/types/api';

function skill(partial: Partial<SkillInfo> & { id: string; name: string; functionCategory: SkillInfo['functionCategory']; origin: SkillInfo['origin'] }): SkillInfo {
  return {
    description: '',
    tool: 'trae',
    sourcePath: `/x/${partial.id}/SKILL.md`,
    version: '',
    functionOverridden: false,
    variants: [],
    ...partial,
  };
}

const result: SkillListResult = {
  total: 2,
  items: [
    skill({ id: 'mycode', name: 'mycode', description: 'typescript 编程', functionCategory: 'coding', origin: 'personal', version: '1.2.0' }),
    skill({ id: 'pdf', name: 'pdf', description: 'pdf 文档', functionCategory: 'writing', origin: 'builtin', variants: ['/a/pdf/SKILL.md', '/b/pdf/SKILL.md'] }),
  ],
  countByFunction: {
    coding: 1, writing: 1, browser: 0, data: 0, devops: 0,
    'ai-integration': 0, design: 0, workflow: 0, other: 0,
  },
  countByOrigin: { builtin: 1, plugin: 0, personal: 1, marketplace: 0, vault: 0 },
};

function renderView(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SkillsView />
    </QueryClientProvider>,
  );
}

describe('SkillsView 技能分类全貌', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(result);
    vi.spyOn(api, 'overrideSkillFunction').mockResolvedValue({ skill: { ...result.items[0], functionCategory: 'data', functionOverridden: true } });
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: result.items[0], rawContent: '# mycode\n原始内容' });
  });

  it('默认按职能分组，显示总数、版本与副本数', async () => {
    renderView();
    expect(await screen.findByText(/去重后共 2 个技能/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '编码开发 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '文档写作 1' })).toBeInTheDocument();
    expect(screen.getByText('v1.2.0')).toBeInTheDocument();
    expect(screen.getByText('3 副本')).toBeInTheDocument();
  });

  it('点击职能计数条以 function 参数查询，切换来源维度时清空筛选', async () => {
    renderView();
    await screen.findByText(/去重后共/);
    fireEvent.click(screen.getByRole('button', { name: /数据处理 0/ }));
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenLastCalledWith({ function: 'data', origin: undefined, search: undefined });
    });

    fireEvent.click(screen.getByRole('button', { name: /按来源/ }));
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenLastCalledWith({ function: undefined, origin: undefined, search: undefined });
    });
    // 来源分组标题出现
    expect(screen.getByRole('heading', { name: '个人自建 1' })).toBeInTheDocument();
  });

  it('修改职能分类调用覆盖接口', async () => {
    renderView();
    const select = (await screen.findByLabelText('修改 mycode 的职能分类')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'data' } });
    await waitFor(() => {
      expect(api.overrideSkillFunction).toHaveBeenCalledWith('mycode', 'data');
    });
  });

  it('点击技能名打开详情，显示副本位置与 Markdown 渲染的 SKILL.md 内容，可关闭', async () => {
    renderView();
    const link = await screen.findByRole('button', { name: '查看 pdf 详情' });
    fireEvent.click(link);
    await waitFor(() => {
      expect(api.getSkill).toHaveBeenCalledWith('pdf');
    });
    // 3 个副本路径（1 主 + 2 variants）
    expect(screen.getByText('/x/pdf/SKILL.md')).toBeInTheDocument();
    expect(screen.getByText('/a/pdf/SKILL.md')).toBeInTheDocument();
    expect(screen.getByText('/b/pdf/SKILL.md')).toBeInTheDocument();
    // `# mycode` 应渲染为一级标题而非字面文本
    expect(await screen.findByRole('heading', { name: 'mycode' })).toBeInTheDocument();
    expect(screen.getByText('原始内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(screen.queryByText('SKILL.md 文档')).not.toBeInTheDocument();
    });
  });
});

describe('SkillsView 批量调整职能', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(result);
    vi.spyOn(api, 'overrideSkillFunction').mockResolvedValue({ skill: { ...result.items[0], functionCategory: 'data', functionOverridden: true } });
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: result.items[0], rawContent: '# mycode\n原始内容' });
    vi.spyOn(api, 'batchSetSkillFunction').mockResolvedValue({ updated: [], missing: [] });
  });

  it('勾选卡片出现批量条，取消后消失', async () => {
    renderView();
    const box = await screen.findByLabelText('选择技能 mycode');
    expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.getByText('已选 1 个技能')).toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
  });

  it('全选当前筛选结果并批量应用，成功后清空并刷新', async () => {
    renderView();
    await screen.findByText(/去重后共 2 个技能/);
    // 批量条在勾选后才出现：先勾一张，再全选补齐
    fireEvent.click(await screen.findByLabelText('选择技能 mycode'));
    fireEvent.click(screen.getByRole('button', { name: '全选当前筛选结果' }));
    expect(screen.getByText('已选 2 个技能')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('批量设置职能分类'), { target: { value: 'data' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => {
      expect(api.batchSetSkillFunction).toHaveBeenCalledWith(['mycode', 'pdf'], 'data');
    });
    await waitFor(() => {
      expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
    });
  });

  it('部分 id 缺失时提示未找到的技能', async () => {
    vi.spyOn(api, 'batchSetSkillFunction').mockResolvedValue({ updated: [], missing: ['ghost'] });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 mycode'));
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('ghost'));
    });
  });

  it('切换筛选时清空勾选', async () => {
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 mycode'));
    expect(screen.getByText('已选 1 个技能')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /文档写作 1/ }));
    await waitFor(() => {
      expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
    });
  });
});

describe('SkillsView 保险箱写管理', () => {
  const vaultSkill = skill({
    id: '周报助手',
    name: '周报助手',
    description: '生成中文周报',
    functionCategory: 'writing',
    origin: 'vault',
    tool: 'hub',
  });

  const writeResult: SkillListResult = {
    total: 2,
    items: [vaultSkill, result.items[1]],
    countByFunction: {
      coding: 0, writing: 2, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 0, other: 0,
    },
    countByOrigin: { builtin: 1, plugin: 0, personal: 0, marketplace: 0, vault: 1 },
  };

  const twoTools: ToolStatus[] = [
    { name: 'trae', installed: true, configDirExists: true, configDir: '/u/.trae-cn' },
    { name: 'codex', installed: true, configDirExists: true, configDir: '/u/.codex' },
  ];

  function mockWriteApis(): void {
    vi.spyOn(api, 'listSkills').mockResolvedValue(writeResult);
    vi.spyOn(api, 'getSkill').mockResolvedValue({
      skill: vaultSkill,
      rawContent: '---\nname: 周报助手\n---\n# 周报正文',
    });
    vi.spyOn(api, 'createSkill').mockResolvedValue({ skill: vaultSkill });
    vi.spyOn(api, 'updateSkill').mockResolvedValue({ skill: vaultSkill });
    vi.spyOn(api, 'deleteSkill').mockResolvedValue({ success: true });
    vi.spyOn(api, 'runSync').mockResolvedValue({ results: [] });
    vi.spyOn(api, 'getTools').mockResolvedValue({ tools: twoTools });
  }

  beforeEach(() => {
    mockWriteApis();
  });

  it('工具栏新建技能：填写名称/描述/正文提交后调用创建接口并关闭表单', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '新建技能' }));
    fireEvent.change(screen.getByLabelText('技能名称'), { target: { value: '周报助手' } });
    fireEvent.change(screen.getByLabelText('技能描述'), { target: { value: '生成中文周报' } });
    fireEvent.change(screen.getByLabelText('技能正文'), { target: { value: '# 周报' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => {
      expect(api.createSkill).toHaveBeenCalledWith({
        name: '周报助手',
        description: '生成中文周报',
        content: '# 周报',
      });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('技能名称')).not.toBeInTheDocument();
    });
  });

  it('创建重名技能时提示后端错误信息', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(api, 'createSkill').mockRejectedValue(new Error('同名技能已存在：pdf（来源：builtin）'));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '新建技能' }));
    fireEvent.change(screen.getByLabelText('技能名称'), { target: { value: 'PDF' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('同名技能已存在：pdf（来源：builtin）');
    });
  });

  it('保险箱技能详情提供编辑/删除/同步分发', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '查看 周报助手 详情' }));
    expect(await screen.findByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '同步分发' })).toBeInTheDocument();
  });

  it('非保险箱技能详情只读，仅提供同步分发', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '查看 pdf 详情' }));
    expect(await screen.findByRole('button', { name: '同步分发' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('编辑保存调用更新接口并传入修改后的全文', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '查看 周报助手 详情' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    const textarea = screen.getByLabelText('编辑 SKILL.md 内容') as HTMLTextAreaElement;
    expect(textarea.value).toContain('# 周报正文');
    fireEvent.change(textarea, { target: { value: '# 周报正文 v2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(api.updateSkill).toHaveBeenCalledWith('周报助手', '# 周报正文 v2');
    });
  });

  it('保存时技能不存在则提示错误并刷新列表', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(api, 'updateSkill').mockRejectedValue(new Error('技能不存在：周报助手'));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '查看 周报助手 详情' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('技能不存在：周报助手');
    });
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenCalledTimes(2);
    });
  });

  it('删除时确认对话框警示影响范围，确认后调用删除接口', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '查看 周报助手 详情' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    expect(await screen.findByText(/将从保险箱及所有已分发工具中删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => {
      expect(api.deleteSkill).toHaveBeenCalledWith('周报助手');
    });
  });

  it('同步分发：选择目标工具执行后展示各工具成功/失败结果', async () => {
    const results: SyncResult[] = [
      { tool: 'trae', success: true, itemCount: 1, skippedCount: 0, errors: [], warnings: [], durationMs: 5 },
      { tool: 'codex', success: false, itemCount: 0, skippedCount: 0, errors: ['写入失败'], warnings: [], durationMs: 3 },
    ];
    vi.spyOn(api, 'runSync').mockResolvedValue({ results });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '查看 周报助手 详情' }));
    fireEvent.click(await screen.findByRole('button', { name: '同步分发' }));
    fireEvent.click(await screen.findByLabelText('选择同步目标 trae'));
    fireEvent.click(screen.getByLabelText('选择同步目标 codex'));
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }));
    expect(await screen.findByText('同步结果')).toBeInTheDocument();
    expect(screen.getByText('TRAE 成功')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Codex 失败')).toBeInTheDocument();
    expect(screen.getByText('写入失败')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.runSync).toHaveBeenCalledWith(['trae', 'codex'], false);
    });
  });
});
