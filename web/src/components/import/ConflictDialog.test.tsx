/**
 * ConflictDialog 仲裁入口集成测试（add-llm-conflict-arbitration C1/C2）
 *
 * spec: specs/conflict-arbitration.spec.md Scenario 1/3；
 * 仅 differs 项由 Import 保证（Step 3 只渲染 differs），类别闭集外不渲染入口。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConflictDialog } from './ConflictDialog';
import { api } from '@/lib/api';
import type { ArbitrationResponse, ConflictStrategy } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    getDiff: vi.fn(),
    arbitrate: vi.fn(),
  },
}));

const sources = [{ tool: 'trae-cn', sourcePath: 'd:/demo/tool/rules/rule.md', size: 120 }];

function mergeResponse(): ArbitrationResponse {
  return {
    decision: 'merge',
    rationale: '两侧互补',
    mergedContent: '仲裁合并草案',
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    model: 'demo-model',
    generatedAt: '2026-10-18T00:00:00.000Z',
  };
}

function renderDialog(props: Partial<{ category: string; strategy: ConflictStrategy; onChange: (s: ConflictStrategy, d?: string) => void }> = {}) {
  const onChange = props.onChange ?? vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConflictDialog
        hubTargetPath="rules/demo-rule.md"
        sources={sources}
        existingSize={200}
        category={props.category ?? 'rule'}
        strategy={props.strategy ?? 'merge'}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
  return { onChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getDiff).mockResolvedValue({
    sourceContent: 'SOURCE-LINE\n',
    hubContent: 'HUB-LINE\n',
    sourcePath: sources[0].sourcePath,
    hubTargetPath: 'rules/demo-rule.md',
  });
});

describe('ConflictDialog AI 仲裁入口', () => {
  it('展开差异后出现「AI 仲裁」按钮（Scenario 1，可仲裁类别）', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /查看差异/ }));
    expect(await screen.findByRole('button', { name: 'AI 仲裁' })).toBeInTheDocument();
  });

  it('类别不在仲裁闭集（preference）→ 不渲染仲裁入口', async () => {
    renderDialog({ category: 'preference' });
    await userEvent.click(screen.getByRole('button', { name: /查看差异/ }));
    expect(await screen.findByText('SOURCE-LINE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AI 仲裁' })).not.toBeInTheDocument();
  });

  it('仲裁 merge 草案「以此为准」→ onChange("merge", 草案)（C2 采纳链）', async () => {
    vi.mocked(api.arbitrate).mockResolvedValue(mergeResponse());
    const { onChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /查看差异/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'AI 仲裁' }));

    const box = await screen.findByRole('textbox', { name: '仲裁合并草案' });
    await userEvent.clear(box);
    await userEvent.type(box, '编辑后草案');
    await userEvent.click(screen.getByRole('button', { name: '以此为准' }));

    expect(onChange).toHaveBeenCalledWith('merge', '编辑后草案');
  });

  it('手动策略按钮行为不变（回归：单参 onChange）', async () => {
    const { onChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: '覆盖' }));
    expect(onChange).toHaveBeenCalledWith('overwrite');
  });
});
