/**
 * SkillDetail 收藏到我的库交互测试
 *
 * spec: add-skill-curation / refactor-skill-origin-taxonomy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillDetail } from './SkillDetail';
import { api } from '@/lib/api';
import type { SkillInfo } from '@/types/api';

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

const marketSkill = skill({
  id: 'airbnb',
  name: 'airbnb',
  description: '旅行预订技能',
  functionCategory: 'other',
  provenance: 'marketplace',
});

const libraryCurated = skill({
  id: 'airbnb',
  name: 'airbnb',
  description: '旅行预订技能',
  functionCategory: 'other',
  provenance: 'marketplace',
  inLibrary: true,
  tool: 'hub',
  source: 'marketplace:/x/airbnb/SKILL.md',
});

const librarySelfBuilt = skill({
  id: 'mine',
  name: 'mine',
  description: '自建技能',
  functionCategory: 'other',
  provenance: 'self',
  inLibrary: true,
  tool: 'hub',
});

function renderDetail(s: SkillInfo, onCurated: (skill: SkillInfo) => void = vi.fn()): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SkillDetail skill={s} onClose={vi.fn()} onCurated={onCurated} />
    </QueryClientProvider>,
  );
}

describe('SkillDetail 收藏到我的库', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: marketSkill, rawContent: '# airbnb\n内容' });
    vi.spyOn(api, 'curateSkill').mockResolvedValue({ skill: libraryCurated });
    vi.spyOn(api, 'listSkills').mockResolvedValue({
      total: 1,
      items: [libraryCurated],
      countByFunction: {
        coding: 0, writing: 0, browser: 0, data: 0, devops: 0,
        'ai-integration': 0, design: 0, workflow: 0, other: 1,
      },
      countByProvenance: { self: 0, marketplace: 1, plugin: 0, builtin: 0 },
      countByStatus: { in: 1, out: 0 },
    });
  });

  it('未入库技能提供收藏按钮，点击出现名称预填对话框', async () => {
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: '收藏到我的库' }));
    const input = (await screen.findByLabelText('收藏技能名称')) as HTMLInputElement;
    expect(input.value).toBe('airbnb');
    expect(api.curateSkill).not.toHaveBeenCalled();
  });

  it('确认收藏调用接口（默认沿用源名）并切换详情到新技能', async () => {
    const onCurated = vi.fn();
    renderDetail(marketSkill, onCurated);
    fireEvent.click(await screen.findByRole('button', { name: '收藏到我的库' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认收藏' }));
    await waitFor(() => {
      expect(api.curateSkill).toHaveBeenCalledWith({ id: 'airbnb', name: 'airbnb' });
    });
    await waitFor(() => {
      expect(onCurated).toHaveBeenCalledWith(libraryCurated);
    });
  });

  it('改名收藏：提交时传入修改后的名称', async () => {
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: '收藏到我的库' }));
    fireEvent.change(await screen.findByLabelText('收藏技能名称'), { target: { value: 'airbnb-travel' } });
    fireEvent.click(screen.getByRole('button', { name: '确认收藏' }));
    await waitFor(() => {
      expect(api.curateSkill).toHaveBeenCalledWith({ id: 'airbnb', name: 'airbnb-travel' });
    });
  });

  it('同名冲突提示错误且对话框保持打开', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(api, 'curateSkill').mockRejectedValue(new Error('同名技能已存在：airbnb（来源：marketplace）'));
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: '收藏到我的库' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认收藏' }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('同名技能已存在：airbnb（来源：marketplace）');
    });
    expect(screen.getByLabelText('收藏技能名称')).toBeInTheDocument();
  });

  it('库内技能不显示收藏按钮', async () => {
    renderDetail(librarySelfBuilt);
    await screen.findByRole('button', { name: '编辑' });
    expect(screen.queryByRole('button', { name: '收藏到我的库' })).not.toBeInTheDocument();
  });

  it('副本数按 variants 数值渲染（contract: variants: number），多副本不炸', async () => {
    renderDetail(skill({ id: 'multi', name: 'multi', functionCategory: 'other', provenance: 'self', variants: 2 }));
    expect(await screen.findByText(/共 3 个副本/)).toBeInTheDocument();
    expect(screen.getByText('/x/multi/SKILL.md')).toBeInTheDocument();
  });
});

describe('SkillDetail 收藏来源徽章', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: libraryCurated, rawContent: '# airbnb' });
  });

  it('收藏自市场的库内技能显示「来自 市场安装」与源路径', async () => {
    renderDetail(libraryCurated);
    expect(await screen.findByText(/来自 市场/)).toBeInTheDocument();
    expect(screen.getByText('/x/airbnb/SKILL.md')).toBeInTheDocument();
  });

  it('出处为自建的库内技能不显示来源徽章', async () => {
    renderDetail(librarySelfBuilt);
    await screen.findByRole('button', { name: '编辑' });
    expect(screen.queryByText(/来自/)).not.toBeInTheDocument();
  });
});

describe('SkillDetail AI 智能分类', () => {
  const aiConfig = { baseUrl: 'https://api.example.com/v1', model: 'lite-model', hasApiKey: true };

  beforeEach(() => {
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: marketSkill, rawContent: '# airbnb\n内容' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('详情面板显示分类来源徽章（AI 源）', async () => {
    renderDetail({ ...marketSkill, functionSource: 'ai' });
    expect(await screen.findByText('AI')).toBeInTheDocument();
  });

  it('单条 AI 分类：以当前技能 id 调用接口，成功后刷新详情', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(aiConfig);
    vi.spyOn(api, 'aiClassifySkills').mockResolvedValue({
      classified: [{ ...marketSkill, functionSource: 'ai' }],
      cacheHits: 0,
      skipped: [],
      failed: [],
    });
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: 'AI 分类' }));
    await waitFor(() => {
      expect(api.aiClassifySkills).toHaveBeenCalledWith(['airbnb']);
    });
    // 初始加载 1 次 + 分类成功刷新 1 次
    await waitFor(() => {
      expect(api.getSkill).toHaveBeenCalledTimes(2);
    });
  });

  it('未配置时单条分类弹配置对话框，不发起分类请求', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue({ baseUrl: '', model: '', hasApiKey: false });
    const classifySpy = vi.spyOn(api, 'aiClassifySkills');
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: 'AI 分类' }));
    expect(await screen.findByLabelText('AI 分类 Base URL')).toBeInTheDocument();
    expect(classifySpy).not.toHaveBeenCalled();
  });

  it('配置保存成功后自动续跑单条分类', async () => {
    vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue({ baseUrl: '', model: '', hasApiKey: false });
    vi.spyOn(api, 'saveAiClassifyConfig').mockResolvedValue(aiConfig);
    vi.spyOn(api, 'aiClassifySkills').mockResolvedValue({
      classified: [], cacheHits: 0, skipped: [], failed: [],
    });
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: 'AI 分类' }));
    fireEvent.change(await screen.findByLabelText('AI 分类 Base URL'), { target: { value: 'https://api.example.com/v1' } });
    fireEvent.change(screen.getByLabelText('AI 分类模型'), { target: { value: 'lite-model' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(api.aiClassifySkills).toHaveBeenCalledWith(['airbnb']);
    });
  });
});
