/**
 * 技能卡组件测试（spec refactor-design-system skill-card-badges）
 * 卡面常驻徽章 ≤2（职能 + 出处）；版本/副本/分类来源移入详情；整卡可点开详情，无重复按钮。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillCard } from './SkillCard';
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
    // 结构兜底：卡内徽章元素总数 ≤2
    expect(container.querySelectorAll('.rounded-full').length).toBeLessThanOrEqual(2);
  });

  it('官方内置技能出处徽章带来源工具后缀，徽章总数仍 ≤2', () => {
    const { container } = renderCard(skill({ provenance: 'builtin', tool: 'trae' }));
    expect(screen.getByText('官方内置 · TRAE')).toBeInTheDocument();
    expect(container.querySelectorAll('.rounded-full').length).toBeLessThanOrEqual(2);
  });

  it('未分类（other）技能卡仍满足徽章 ≤2，不出现空徽章', () => {
    const { container } = renderCard(skill({ functionCategory: 'other' }));
    // 「其他」同时出现在徽章与职能下拉 option 中，用 getAllByText 断言存在
    expect(screen.getAllByText('其他').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('.rounded-full').length).toBeLessThanOrEqual(2);
  });

  it('卡面无功能重复的「查看详情」按钮，整卡可点开详情', () => {
    const onSelect = vi.fn();
    renderCard(skill(), { onSelect });
    expect(screen.queryByRole('button', { name: '查看 mycode 详情' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开 mycode 卡片' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
