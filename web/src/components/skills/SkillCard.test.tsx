/**
 * 技能卡组件测试（spec refactor-design-system skill-card-badges）
 * 卡面常驻徽章 ≤2（职能 + 出处）；版本/副本/分类来源移入详情；整卡可点开详情，无重复按钮。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillCard } from './SkillCard';
import { api } from '@/lib/api';
import { useToastStore } from '@/lib/toast-store';
import type { SkillInfo } from '@/types/api';

function skill(partial: Partial<SkillInfo> = {}): SkillInfo {
  return {
    id: 's1',
    name: 'mycode',
    description: 'typescript 编程',
    functionCategory: 'coding',
    provenance: 'self',
    inLibrary: false,
    tool: 'trae',
    path: '/x/s1/SKILL.md',
    version: '1.2.0',
    functionSource: 'keyword',
    variants: 2,
    ...partial,
  };
}

function renderCard(
  skillInfo: SkillInfo,
  handlers?: { onSelect?: (s: SkillInfo) => void; onCheckChange?: (id: string, checked: boolean) => void },
): ReturnType<typeof render> {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SkillCard
        skill={skillInfo}
        active={false}
        checked={false}
        onSelect={handlers?.onSelect ?? (() => {})}
        onCheckChange={handlers?.onCheckChange ?? (() => {})}
      />
    </QueryClientProvider>,
  );
}

describe('SkillCard 卡面徽章减负（spec skill-card-badges）', () => {
  it('卡面常驻徽章仅职能与出处两枚，版本/副本/分类来源不再上卡面', () => {
    const { container } = renderCard(skill({ workspaceName: 'Zhihu' }));
    // 「编码开发」同时出现在徽章与职能下拉 option 中，用 getAllByText 断言存在
    expect(screen.getAllByText('编码开发').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('自建 · Zhihu')).toBeInTheDocument();
    expect(screen.queryByText('v1.2.0')).not.toBeInTheDocument();
    expect(screen.queryByText('3 副本')).not.toBeInTheDocument();
    expect(screen.queryByText('关键词')).not.toBeInTheDocument();
    // 结构兜底：卡内徽章元素总数 ≤2（色点带 data-function，不计入徽章）
    expect(container.querySelectorAll('.rounded-full:not([data-function])').length).toBeLessThanOrEqual(2);
  });

  it('官方内置技能出处徽章带来源工具后缀，徽章总数仍 ≤2', () => {
    const { container } = renderCard(skill({ provenance: 'builtin', tool: 'trae' }));
    expect(screen.getByText('官方内置 · TRAE')).toBeInTheDocument();
    expect(container.querySelectorAll('.rounded-full:not([data-function])').length).toBeLessThanOrEqual(2);
  });

  it('未分类（other）技能卡仍满足徽章 ≤2，不出现空徽章', () => {
    const { container } = renderCard(skill({ functionCategory: 'other' }));
    // 「其他」同时出现在徽章与职能下拉 option 中，用 getAllByText 断言存在
    expect(screen.getAllByText('其他').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('.rounded-full:not([data-function])').length).toBeLessThanOrEqual(2);
  });

  it('职能徽章带色点，颜色随职能变化（spec skill-function-color Scenario: 卡面职能徽章）', () => {
    const { container } = renderCard(skill({ functionCategory: 'data' }));
    const dot = container.querySelector('[data-function="data"]');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain('bg-fn-data');
    // 色点不单独传达信息：职能中文名仍在
    expect(screen.getAllByText('数据处理').length).toBeGreaterThanOrEqual(1);
  });

  it('卡面无功能重复的「查看详情」按钮，整卡可点开详情', () => {
    const onSelect = vi.fn();
    renderCard(skill(), { onSelect });
    expect(screen.queryByRole('button', { name: '查看 mycode 详情' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开 mycode 卡片' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

/** spec inline-function-confirm：展开 → 应用/取消 → 撤销 */
describe('SkillCard 调整分类确认流', () => {
  beforeEach(() => {
    useToastStore.getState().reset();
    vi.restoreAllMocks();
  });

  function openEditor(): void {
    fireEvent.click(screen.getByRole('button', { name: '调整 mycode 的分类' }));
  }

  it('卡面无默认 select，只有「调整分类」图标按钮', () => {
    renderCard(skill());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '调整 mycode 的分类' })).toBeInTheDocument();
  });

  it('展开只显示当前值，不发请求', () => {
    const spy = vi.spyOn(api, 'overrideSkillFunction');
    renderCard(skill());
    openEditor();
    expect(screen.getByRole('combobox')).toHaveValue('coding');
    expect(spy).not.toHaveBeenCalled();
  });

  it('取消：不发请求并收起确认区', () => {
    const spy = vi.spyOn(api, 'overrideSkillFunction');
    renderCard(skill());
    openEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('应用：只发一次请求，成功后收起并给带撤销的成功 toast', async () => {
    vi.spyOn(api, 'overrideSkillFunction').mockResolvedValue({ skill: skill({ functionCategory: 'data' }) });
    renderCard(skill());
    openEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(api.overrideSkillFunction).toHaveBeenCalledWith('s1', 'data'));
    expect(api.overrideSkillFunction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
    const t = useToastStore.getState().toasts[0];
    expect(t.title).toBe('已改为 数据处理');
    expect(t.action?.label).toBe('撤销');
    expect(t.duration).toBeGreaterThanOrEqual(30000);
  });

  it('失败：错误 toast 并收起，不残留改成功状态', async () => {
    vi.spyOn(api, 'overrideSkillFunction').mockRejectedValue(new Error('网络异常'));
    renderCard(skill());
    openEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe('修改分类失败'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('撤销：当前分类仍为改后值 → 写回原分类并提示已撤销', async () => {
    vi.spyOn(api, 'overrideSkillFunction').mockResolvedValue({ skill: skill({ functionCategory: 'data' }) });
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: skill({ functionCategory: 'data' }), rawContent: '' });
    renderCard(skill());
    openEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.action).toBeTruthy());
    act(() => useToastStore.getState().toasts[0].action?.onClick());
    await waitFor(() => expect(api.overrideSkillFunction).toHaveBeenLastCalledWith('s1', 'coding'));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === '已撤销，恢复为 编码开发')).toBe(true),
    );
  });

  it('撤销失效：分类已被他处改动 → 不发写回请求，只提示失效', async () => {
    vi.spyOn(api, 'overrideSkillFunction').mockResolvedValue({ skill: skill({ functionCategory: 'data' }) });
    vi.spyOn(api, 'getSkill').mockResolvedValue({ skill: skill({ functionCategory: 'design' }), rawContent: '' });
    renderCard(skill());
    openEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.action).toBeTruthy());
    act(() => useToastStore.getState().toasts[0].action?.onClick());
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === '分类已被修改，撤销已失效')).toBe(true),
    );
    expect(api.overrideSkillFunction).toHaveBeenCalledTimes(1);
  });
});

