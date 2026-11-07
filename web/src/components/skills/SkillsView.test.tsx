import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsView } from './SkillsView';
import { api } from '@/lib/api';
import { Toaster } from '@/components/ui/toast';
import { useToastStore } from '@/lib/toast-store';
import type { SkillInfo, SkillListResult, ToolStatus, SyncResult } from '@/types/api';

beforeEach(() => {
  useToastStore.getState().reset();
});

function skill(partial: Partial<SkillInfo> & { id: string; name: string; functionCategory: SkillInfo['functionCategory']; provenance: SkillInfo['provenance'] }): SkillInfo {
  return {
    description: '',
    tool: 'trae',
    path: `/x/${partial.id}/SKILL.md`,
    version: '',
    functionSource: 'keyword',
    variants: 0,
    inLibrary: false,
    ...partial,
  };
}

const result: SkillListResult = {
  total: 2,
  items: [
    skill({ id: 'mycode', name: 'mycode', description: 'typescript 编程', functionCategory: 'coding', provenance: 'self', version: '1.2.0' }),
    skill({ id: 'pdf', name: 'pdf', description: 'pdf 文档', functionCategory: 'writing', provenance: 'builtin', variants: 2 }),
  ],
  countByFunction: {
    coding: 1, writing: 1, browser: 0, data: 0, devops: 0,
    'ai-integration': 0, design: 0, workflow: 0, other: 0,
  },
  countByProvenance: { self: 1, marketplace: 0, plugin: 0, builtin: 1 },
  countByStatus: { in: 0, out: 2 },
  countByScope: { asset: 1, environment: 1 },
};

function renderView(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SkillsView />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('SkillsView 技能分类全貌', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(result);
    vi.spyOn(api, 'overrideSkillFunction').mockResolvedValue({ skill: { ...result.items[0], functionCategory: 'data', functionSource: 'manual' } });
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: result.items[0], rawContent: '# mycode\n原始内容' });
  });

  it('默认按出处分组显示总数；版本与副本不再常驻卡面', async () => {
    renderView();
    expect(await screen.findByText(/去重后共 2 个技能/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '自建 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '官方内置 1' })).toBeInTheDocument();
    // 卡面减负（spec skill-card-badges）：低频信息移入详情
    expect(screen.queryByText('v1.2.0')).not.toBeInTheDocument();
    expect(screen.queryByText('3 副本')).not.toBeInTheDocument();
  });

  it('低频元信息在详情面板可见：版本、副本数、分类来源', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 mycode 卡片' }));
    const overlay = await screen.findByTestId('detail-overlay');
    expect(within(overlay).getByText('v1.2.0')).toBeInTheDocument();
    expect(within(overlay).getByText('关键词')).toBeInTheDocument();
    expect(within(overlay).getByText(/共 1 个副本/)).toBeInTheDocument();
  });

  it('维度切换时子选项卡跟随切换：出处维度显示出处计数条，职能维度显示职能计数条', async () => {
    renderView();
    await screen.findByText(/去重后共 2 个技能/);
    // 默认出处维度：显示出处 chips，不显示职能 chips
    expect(screen.getByRole('button', { name: /自建 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /编码开发 1/ })).not.toBeInTheDocument();
    // 切到职能维度：显示职能 chips，不显示出处 chips
    fireEvent.click(screen.getByRole('button', { name: /按职能/ }));
    expect(screen.getByRole('button', { name: /编码开发 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /自建 1/ })).not.toBeInTheDocument();
  });

  it('点击职能计数条以 function 参数查询，切换出处维度时清空筛选', async () => {
    renderView();
    await screen.findByText(/去重后共/);
    // 默认出处维度，先切到职能维度再点子选项卡
    fireEvent.click(screen.getByRole('button', { name: /按职能/ }));
    fireEvent.click(screen.getByRole('button', { name: /数据处理 0/ }));
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenLastCalledWith({ scope: 'asset', function: 'data', provenance: undefined, status: undefined, search: undefined });
    });

    fireEvent.click(screen.getByRole('button', { name: /按来源/ }));
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenLastCalledWith({ scope: 'asset', function: undefined, provenance: undefined, status: undefined, search: undefined });
    });
    // 出处分组标题出现
    expect(screen.getByRole('heading', { name: '自建 1' })).toBeInTheDocument();
  });

  it('修改职能分类走确认式：展开 → 应用 才调用覆盖接口', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '调整 mycode 的分类' }));
    const select = screen.getByLabelText('mycode 的新职能分类') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'data' } });
    // 只选择不应用时不发请求（spec inline-function-confirm Scenario: 展开确认区）
    expect(api.overrideSkillFunction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => {
      expect(api.overrideSkillFunction).toHaveBeenCalledWith('mycode', 'data');
    });
  });

  it('点击技能名打开详情，显示副本位置与 Markdown 渲染的 SKILL.md 内容，可关闭', async () => {
    renderView();
    const link = await screen.findByRole('button', { name: '展开 pdf 卡片' });
    fireEvent.click(link);
    await waitFor(() => {
      expect(api.getSkill).toHaveBeenCalledWith('pdf');
    });
    // 主文件路径 + 副本数（API 契约只透传 path 与 variants 数值，不再透传副本路径数组）
    expect(screen.getByText('/x/pdf/SKILL.md')).toBeInTheDocument();
    expect(screen.getByText(/共 3 个副本/)).toBeInTheDocument();
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
    vi.spyOn(api, 'overrideSkillFunction').mockResolvedValue({ skill: { ...result.items[0], functionCategory: 'data', functionSource: 'manual' } });
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
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 mycode'));
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => {
      expect(screen.getByText('部分技能未应用修改')).toBeInTheDocument();
      expect(screen.getByText('ghost')).toBeInTheDocument();
    });
  });

  it('切换筛选时清空勾选', async () => {
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 mycode'));
    expect(screen.getByText('已选 1 个技能')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /官方内置 1/ }));
    await waitFor(() => {
      expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
    });
  });
});

describe('SkillsView 我的库写管理', () => {
  const librarySkill = skill({
    id: '周报助手',
    name: '周报助手',
    description: '生成中文周报',
    functionCategory: 'writing',
    provenance: 'self',
    inLibrary: true,
    tool: 'hub',
  });

  const writeResult: SkillListResult = {
    total: 2,
    items: [librarySkill, result.items[1]],
    countByFunction: {
      coding: 0, writing: 2, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 0, other: 0,
    },
    countByProvenance: { self: 1, marketplace: 0, plugin: 0, builtin: 1 },
    countByStatus: { in: 1, out: 1 },
    countByScope: { asset: 1, environment: 1 },
  };

  const twoTools: ToolStatus[] = [
    { name: 'trae', installed: true, configDirExists: true, configDir: '/u/.trae-cn' },
    { name: 'codex', installed: true, configDirExists: true, configDir: '/u/.codex' },
  ];

  function mockWriteApis(): void {
    vi.spyOn(api, 'listSkills').mockResolvedValue(writeResult);
    vi.spyOn(api, 'getSkill').mockResolvedValue({
      skill: librarySkill,
      rawContent: '---\nname: 周报助手\n---\n# 周报正文',
    });
    vi.spyOn(api, 'createSkill').mockResolvedValue({ skill: librarySkill });
    vi.spyOn(api, 'updateSkill').mockResolvedValue({ skill: librarySkill });
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
    vi.spyOn(api, 'createSkill').mockRejectedValue(new Error('同名技能已存在：pdf（来源：官方内置）'));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '新建技能' }));
    fireEvent.change(screen.getByLabelText('技能名称'), { target: { value: 'PDF' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => {
      expect(screen.getByText('创建技能失败')).toBeInTheDocument();
      expect(screen.getByText('同名技能已存在：pdf（来源：官方内置）')).toBeInTheDocument();
    });
  });

  it('库内技能详情提供编辑/删除/同步到工具', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 周报助手 卡片' }));
    expect(await screen.findByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '同步到工具' })).toBeInTheDocument();
  });

  it('未入库技能详情只读，仅提供同步到工具', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 pdf 卡片' }));
    expect(await screen.findByRole('button', { name: '同步到工具' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('编辑保存调用更新接口并传入修改后的全文', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 周报助手 卡片' }));
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
    vi.spyOn(api, 'updateSkill').mockRejectedValue(new Error('技能不存在：周报助手'));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 周报助手 卡片' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(screen.getByText('保存失败')).toBeInTheDocument();
      expect(screen.getByText('技能不存在：周报助手')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.listSkills).toHaveBeenCalledTimes(2);
    });
  });

  it('删除时确认对话框警示影响范围，确认后调用删除接口', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 周报助手 卡片' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    expect(await screen.findByText(/将从我的库及所有已同步工具中删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => {
      expect(api.deleteSkill).toHaveBeenCalledWith('周报助手');
    });
  });

  it('同步到工具：选择目标工具执行后展示各工具成功/失败结果', async () => {
    const results: SyncResult[] = [
      { tool: 'trae', success: true, itemCount: 1, skippedCount: 0, errors: [], warnings: [], durationMs: 5 },
      { tool: 'codex', success: false, itemCount: 0, skippedCount: 0, errors: ['写入失败'], warnings: [], durationMs: 3 },
    ];
    vi.spyOn(api, 'runSync').mockResolvedValue({ results });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 周报助手 卡片' }));
    fireEvent.click(await screen.findByRole('button', { name: '同步到工具' }));
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

describe('SkillsView 批量收藏', () => {
  const librarySkill = skill({
    id: '周报助手',
    name: '周报助手',
    description: '生成中文周报',
    functionCategory: 'writing',
    provenance: 'self',
    inLibrary: true,
    tool: 'hub',
  });
  const createdSkill = { ...librarySkill, source: 'builtin:/x/pdf/SKILL.md' };

  const writeResult: SkillListResult = {
    total: 2,
    items: [librarySkill, result.items[1]],
    countByFunction: {
      coding: 0, writing: 2, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 0, other: 0,
    },
    countByProvenance: { self: 1, marketplace: 0, plugin: 0, builtin: 1 },
    countByStatus: { in: 1, out: 1 },
    countByScope: { asset: 1, environment: 1 },
  };

  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(writeResult);
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: librarySkill, rawContent: '---\nname: 周报助手\n---\n正文' });
  });

  it('勾选含未入库技能时批量条显示收藏按钮，点击仅收藏未入库项', async () => {
    vi.spyOn(api, 'curateSkillsBatch').mockResolvedValue({ created: [createdSkill], failed: [] });
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 周报助手'));
    fireEvent.click(screen.getByLabelText('选择技能 pdf'));
    fireEvent.click(screen.getByRole('button', { name: '收藏到我的库' }));

    await waitFor(() => {
      expect(api.curateSkillsBatch).toHaveBeenCalledWith(['pdf']);
    });
    await waitFor(() => {
      expect(screen.getByText('收藏完成：成功 1 个')).toBeInTheDocument();
      // 周报助手已在库 → 进入跳过明细
      expect(screen.getByText('周报助手：已在我的库')).toBeInTheDocument();
    });
  });

  it('服务端冲突跳过时结果提示失败原因且已成功不回滚', async () => {
    vi.spyOn(api, 'curateSkillsBatch').mockResolvedValue({
      created: [createdSkill],
      failed: [{ id: 'ghost', name: 'ghost', error: '同名技能已存在' }],
    });
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 pdf'));
    fireEvent.click(screen.getByRole('button', { name: '收藏到我的库' }));

    await waitFor(() => {
      expect(screen.getByText('收藏完成：成功 1 个')).toBeInTheDocument();
      expect(screen.getByText('ghost：同名技能已存在')).toBeInTheDocument();
    });
  });

  it('勾选全部为库内技能时不显示收藏按钮', async () => {
    vi.spyOn(api, 'curateSkillsBatch');
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 周报助手'));
    expect(screen.queryByRole('button', { name: '收藏到我的库' })).not.toBeInTheDocument();
    expect(api.curateSkillsBatch).not.toHaveBeenCalled();
  });
});

describe('SkillsView AI 智能分类', () => {
  const aiConfig = { baseUrl: 'https://api.example.com/v1', model: 'lite-model', hasApiKey: true };
  const emptyConfig = { baseUrl: '', model: '', hasApiKey: false };

  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(result);
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: result.items[0], rawContent: '# mycode\n原始内容' });
  });

  it('分类来源徽章三态在详情面板可见，卡面不再常驻', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue({
      ...result,
      items: [
        skill({ id: 'a', name: 'a', functionCategory: 'coding', provenance: 'self', functionSource: 'ai' }),
        skill({ id: 'b', name: 'b', functionCategory: 'writing', provenance: 'builtin', functionSource: 'manual' }),
        skill({ id: 'c', name: 'c', functionCategory: 'data', provenance: 'plugin', functionSource: 'keyword' }),
      ],
    });
    renderView();
    // 卡面减负：分类来源不上卡面
    await screen.findByRole('button', { name: '展开 a 卡片' });
    expect(screen.queryByText('AI')).not.toBeInTheDocument();
    expect(screen.queryByText('手动')).not.toBeInTheDocument();
    expect(screen.queryByText('关键词')).not.toBeInTheDocument();
    // 详情面板可见三态
    fireEvent.click(screen.getByRole('button', { name: '展开 a 卡片' }));
    expect(await screen.findByText('AI')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开 b 卡片' }));
    expect(await screen.findByText('手动')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开 c 卡片' }));
    expect(await screen.findByText('关键词')).toBeInTheDocument();
    // 待分类数量 = 关键词源数量（手动跳过、AI 源为缓存命中不占调用）
    expect(screen.getByText(/全部 AI 分类（待分类 1）/)).toBeInTheDocument();
  });

  it('配置完整时点击全部 AI 分类调用分类接口并汇总结果', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(aiConfig);
    vi.spyOn(api, 'aiClassifySkills').mockResolvedValue({
      classified: [result.items[0]],
      cacheHits: 0,
      skipped: [],
      failed: [],
    });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /全部 AI 分类/ }));
    await waitFor(() => {
      expect(api.aiClassifySkills).toHaveBeenCalledWith(undefined);
    });
    await waitFor(() => {
      expect(screen.getByText('AI 分类完成')).toBeInTheDocument();
      expect(screen.getByText(/成功 1 个（缓存命中 0 个）/)).toBeInTheDocument();
    });
  });

  it('未配置时点击分类先弹配置对话框，不发起分类请求', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(emptyConfig);
    const classifySpy = vi.spyOn(api, 'aiClassifySkills');
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /全部 AI 分类/ }));
    expect(await screen.findByLabelText('AI 分类 Base URL')).toBeInTheDocument();
    expect(classifySpy).not.toHaveBeenCalled();
  });

  it('配置保存成功后自动续跑之前的分类意图', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(emptyConfig);
    const saveSpy = vi.spyOn(api, 'saveAiClassifyConfig').mockResolvedValue(aiConfig);
    const classifySpy = vi.spyOn(api, 'aiClassifySkills').mockResolvedValue({
      classified: [], cacheHits: 0, skipped: [], failed: [],
    });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /全部 AI 分类/ }));
    fireEvent.change(await screen.findByLabelText('AI 分类 Base URL'), { target: { value: 'https://api.example.com/v1' } });
    fireEvent.change(screen.getByLabelText('AI 分类 API Key'), { target: { value: 'sk-xxx' } });
    fireEvent.change(screen.getByLabelText('AI 分类模型'), { target: { value: 'lite-model' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-xxx',
        model: 'lite-model',
      });
    });
    await waitFor(() => {
      expect(classifySpy).toHaveBeenCalledWith(undefined);
    });
  });

  it('已配置时 apiKey 显示留空保留提示，留空保存不传明文', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(aiConfig);
    const saveSpy = vi.spyOn(api, 'saveAiClassifyConfig').mockResolvedValue(aiConfig);
    vi.spyOn(api, 'aiClassifySkills').mockResolvedValue({
      classified: [], cacheHits: 0, skipped: [], failed: [],
    });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'AI 配置' }));
    const keyInput = (await screen.findByLabelText('AI 分类 API Key')) as HTMLInputElement;
    expect(keyInput.placeholder).toContain('留空保留原值');
    fireEvent.change(screen.getByLabelText('AI 分类 Base URL'), { target: { value: 'https://api.example.com/v1' } });
    fireEvent.change(screen.getByLabelText('AI 分类模型'), { target: { value: 'lite-model' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com/v1',
        apiKey: undefined,
        model: 'lite-model',
      });
    });
  });

  it('批量 AI 分类：按勾选 ids 触发，手动覆盖的跳过并提示', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(aiConfig);
    vi.spyOn(api, 'aiClassifySkills').mockResolvedValue({
      classified: [result.items[0]],
      cacheHits: 0,
      skipped: [{ id: 'pdf', name: 'pdf' }],
      failed: [],
    });
    renderView();
    fireEvent.click(await screen.findByLabelText('选择技能 mycode'));
    fireEvent.click(screen.getByLabelText('选择技能 pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'AI 分类' }));
    await waitFor(() => {
      expect(api.aiClassifySkills).toHaveBeenCalledWith(['mycode', 'pdf']);
    });
    await waitFor(() => {
      expect(screen.getByText('AI 分类完成')).toBeInTheDocument();
      expect(screen.getByText(/跳过 1 个（已手动分类）/)).toBeInTheDocument();
    });
  });

  it('失败明细随结果提示展示，成功项不受影响', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(aiConfig);
    vi.spyOn(api, 'aiClassifySkills').mockResolvedValue({
      classified: [result.items[0]],
      cacheHits: 1,
      skipped: [],
      failed: [{ id: 'pdf', name: 'pdf', error: '输出分类不合法' }],
    });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /全部 AI 分类/ }));
    await waitFor(() => {
      expect(screen.getByText('AI 分类完成')).toBeInTheDocument();
      // 失败项进入可折叠明细，计数进入描述
      expect(screen.getByText(/失败 1 个/)).toBeInTheDocument();
      expect(screen.getByText('pdf：输出分类不合法')).toBeInTheDocument();
      expect(screen.getByText(/成功 1 个（缓存命中 1 个）/)).toBeInTheDocument();
    });
  });
});

describe('SkillsView 项目技能', () => {
  const projectSkill = skill({
    id: 'douyin-x',
    name: 'douyin-x',
    description: '抖音知识提取',
    functionCategory: 'workflow',
    provenance: 'self',
    path: 'd:/demo/Zhihu/.trae/skills/douyin-x/SKILL.md',
    workspaceName: 'Zhihu',
    workspacePath: 'd:/demo/Zhihu',
  });
  const projectResult: SkillListResult = {
    total: 1,
    items: [projectSkill],
    countByFunction: {
      coding: 0, writing: 0, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 1, other: 0,
    },
    countByProvenance: { self: 1, marketplace: 0, plugin: 0, builtin: 0 },
    countByStatus: { in: 0, out: 1 },
    countByScope: { asset: 1, environment: 0 },
  };

  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(projectResult);
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: projectSkill, rawContent: '# douyin-x' });
  });

  it('卡片徽章显示「自建 · 工作区名」，默认出处维度下归入自建分组', async () => {
    renderView();
    expect(await screen.findByText('自建 · Zhihu')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '自建 1' })).toBeInTheDocument();
  });

  it('详情展示所属工作区路径，且提供收藏到我的库入口', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 douyin-x 卡片' }));
    expect(await screen.findByText('所属工作区')).toBeInTheDocument();
    expect(screen.getByText('Zhihu')).toBeInTheDocument();
    expect(screen.getByText('d:/demo/Zhihu')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /收藏到我的库/ })).toBeInTheDocument();
  });
});

describe('SkillsView 统计行与来源徽章（spec: fix-scan-count-gaps）', () => {
  it('无筛选显示全集 total，筛选「我的库」后显示当前视图卡片数', async () => {
    const librarySkill = skill({
      id: 'a', name: 'a', functionCategory: 'coding', provenance: 'self', inLibrary: true, tool: 'hub',
    });
    vi.spyOn(api, 'listSkills').mockImplementation((params) =>
      Promise.resolve(
        params?.status === 'in' ? { ...result, items: [librarySkill] } : result,
      ),
    );
    renderView();
    expect(await screen.findByText(/去重后共 2 个技能/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /我的库/ }));
    expect(await screen.findByText('当前视图 1 个技能')).toBeInTheDocument();
  });

  it('官方内置徽章标注来源工具：TRAE / WorkBuddy', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue({
      ...result,
      items: [
        skill({ id: 't', name: 't', functionCategory: 'coding', provenance: 'builtin', tool: 'trae' }),
        skill({ id: 'w', name: 'w', functionCategory: 'writing', provenance: 'builtin', tool: 'workbuddy' }),
      ],
    });
    renderView();
    expect(await screen.findByText('官方内置 · TRAE')).toBeInTheDocument();
    expect(screen.getByText('官方内置 · WorkBuddy')).toBeInTheDocument();
  });
});

describe('SkillsView 页头（spec refactor-design-system page-headers）', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listSkills').mockResolvedValue({
      total: 0,
      items: [],
      countByFunction: {
        coding: 0, writing: 0, browser: 0, data: 0, devops: 0,
        'ai-integration': 0, design: 0, workflow: 0, other: 0,
      },
      countByProvenance: { self: 0, marketplace: 0, plugin: 0, builtin: 0 },
      countByStatus: { in: 0, out: 0 },
      countByScope: { asset: 0, environment: 0 },
    });
  });

  it('呈现类别 H1「技能」与副标题', async () => {
    renderView();
    expect(await screen.findByRole('heading', { level: 1, name: '技能' })).toBeInTheDocument();
  });

  it('详情打开时列表保持渲染，宽屏详情右栏吸顶（fixed + lg:sticky）', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue({
      total: 1,
      items: [skill({ id: 's1', name: '示例技能', functionCategory: 'coding', provenance: 'self' })],
      countByFunction: {
        coding: 1, writing: 0, browser: 0, data: 0, devops: 0,
        'ai-integration': 0, design: 0, workflow: 0, other: 0,
      },
      countByProvenance: { self: 1, marketplace: 0, plugin: 0, builtin: 0 },
      countByStatus: { in: 0, out: 1 },
      countByScope: { asset: 1, environment: 0 },
    });
    renderView();
    fireEvent.click(await screen.findByText('示例技能'));
    const overlay = await screen.findByTestId('detail-overlay');
    expect(overlay.className).toContain('fixed');
    // 长列表滚动时详情不跟着跑出视口（spec navigation-consolidation 长列表滚动中打开详情）
    expect(overlay.className).toContain('lg:sticky');
    expect(overlay.className).toContain('lg:self-start');
    expect(overlay.className).not.toContain('lg:static');
    // 详情内容区自持滚动，长文档不撑爆面板
    const body = screen.getByTestId('detail-body');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
    // 列表卡片仍在（不与详情互斥渲染，关闭可返回）
    expect(screen.getAllByText('示例技能').length).toBeGreaterThan(0);
  });

  it('切换技能时详情内容滚动复位到顶部', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(result);
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: result.items[0], rawContent: '# 内容' });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '展开 mycode 卡片' }));
    const first = await screen.findByTestId('detail-body');
    first.scrollTop = 480;
    expect(first.scrollTop).toBe(480);

    fireEvent.click(screen.getByRole('button', { name: '展开 pdf 卡片' }));
    await waitFor(() => {
      const next = screen.getByTestId('detail-body');
      expect(next).not.toBe(first);
      expect(next.scrollTop).toBe(0);
    });
  });
});
