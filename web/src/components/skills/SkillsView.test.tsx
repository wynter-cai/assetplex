import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsView } from './SkillsView';
import { api } from '@/lib/api';
import type { SkillInfo, SkillListResult } from '@/types/api';

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
  countByOrigin: { builtin: 1, plugin: 0, personal: 1, marketplace: 0 },
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

  it('点击技能名打开详情，显示副本位置与 SKILL.md 原文，可关闭', async () => {
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
    expect(await screen.findByText(/# mycode/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(screen.queryByText('SKILL.md 原文')).not.toBeInTheDocument();
    });
  });
});
