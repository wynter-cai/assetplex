/**
 * SkillDetail 沉淀到保险箱交互测试
 *
 * spec: add-skill-curation / specs/skill-curation.spec.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillDetail } from './SkillDetail';
import { api } from '@/lib/api';
import type { SkillInfo } from '@/types/api';

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

const marketSkill = skill({
  id: 'airbnb',
  name: 'airbnb',
  description: '旅行预订技能',
  functionCategory: 'other',
  origin: 'marketplace',
});

const vaultCurated = skill({
  id: 'airbnb',
  name: 'airbnb',
  description: '旅行预订技能',
  functionCategory: 'other',
  origin: 'vault',
  tool: 'hub',
  source: 'marketplace:/x/airbnb/SKILL.md',
});

const vaultSelfBuilt = skill({
  id: 'mine',
  name: 'mine',
  description: '自建技能',
  functionCategory: 'other',
  origin: 'vault',
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

describe('SkillDetail 沉淀到保险箱', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: marketSkill, rawContent: '# airbnb\n内容' });
    vi.spyOn(api, 'curateSkill').mockResolvedValue({ skill: vaultCurated });
    vi.spyOn(api, 'listSkills').mockResolvedValue({
      total: 1,
      items: [vaultCurated],
      countByFunction: {
        coding: 0, writing: 0, browser: 0, data: 0, devops: 0,
        'ai-integration': 0, design: 0, workflow: 0, other: 1,
      },
      countByOrigin: { builtin: 0, plugin: 0, personal: 0, marketplace: 0, vault: 1 },
    });
  });

  it('非保险箱技能提供沉淀按钮，点击出现名称预填对话框', async () => {
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: '沉淀到保险箱' }));
    const input = (await screen.findByLabelText('沉淀技能名称')) as HTMLInputElement;
    expect(input.value).toBe('airbnb');
    expect(api.curateSkill).not.toHaveBeenCalled();
  });

  it('确认沉淀调用接口（默认沿用源名）并切换详情到新技能', async () => {
    const onCurated = vi.fn();
    renderDetail(marketSkill, onCurated);
    fireEvent.click(await screen.findByRole('button', { name: '沉淀到保险箱' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认沉淀' }));
    await waitFor(() => {
      expect(api.curateSkill).toHaveBeenCalledWith({ id: 'airbnb', name: 'airbnb' });
    });
    await waitFor(() => {
      expect(onCurated).toHaveBeenCalledWith(vaultCurated);
    });
  });

  it('改名沉淀：提交时传入修改后的名称', async () => {
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: '沉淀到保险箱' }));
    fireEvent.change(await screen.findByLabelText('沉淀技能名称'), { target: { value: 'airbnb-travel' } });
    fireEvent.click(screen.getByRole('button', { name: '确认沉淀' }));
    await waitFor(() => {
      expect(api.curateSkill).toHaveBeenCalledWith({ id: 'airbnb', name: 'airbnb-travel' });
    });
  });

  it('同名冲突提示错误且对话框保持打开', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(api, 'curateSkill').mockRejectedValue(new Error('同名技能已存在：airbnb（来源：marketplace）'));
    renderDetail(marketSkill);
    fireEvent.click(await screen.findByRole('button', { name: '沉淀到保险箱' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认沉淀' }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('同名技能已存在：airbnb（来源：marketplace）');
    });
    expect(screen.getByLabelText('沉淀技能名称')).toBeInTheDocument();
  });

  it('保险箱技能不显示沉淀按钮', async () => {
    renderDetail(vaultSelfBuilt);
    await screen.findByRole('button', { name: '编辑' });
    expect(screen.queryByRole('button', { name: '沉淀到保险箱' })).not.toBeInTheDocument();
  });
});

describe('SkillDetail 沉淀来源标识', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: vaultCurated, rawContent: '# airbnb' });
  });

  it('沉淀技能显示「沉淀自 市场」与源路径', async () => {
    renderDetail(vaultCurated);
    expect(await screen.findByText(/沉淀自 市场/)).toBeInTheDocument();
    expect(screen.getByText('/x/airbnb/SKILL.md')).toBeInTheDocument();
  });

  it('自建技能不显示来源标识', async () => {
    renderDetail(vaultSelfBuilt);
    await screen.findByRole('button', { name: '编辑' });
    expect(screen.queryByText(/沉淀自/)).not.toBeInTheDocument();
  });
});
