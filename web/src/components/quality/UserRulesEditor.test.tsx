/**
 * 用户规则编辑器测试（refactor-governance-center T7）
 *
 * spec: governance-center.spec.md Scenario 5.3 / 5.4 / 5.6；
 * 断言：未校验不可保存、内容改动后旧结论失效、校验失败禁止保存、保存走 /api/files。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserRulesEditor } from './UserRulesEditor';
import { api } from '@/lib/api';

function renderEditor(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserRulesEditor />
    </QueryClientProvider>,
  );
}

describe('UserRulesEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('未校验时保存禁用；校验通过后才可保存并写入 /api/files（Scenario 5.3 / 5.4）', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'validateUserRules').mockResolvedValue({
      ok: true,
      errors: [],
      warnings: [{ originLabel: 'diagnosis-rules/my-rules.yaml', ruleId: 'SK-03', reason: 'duplicate-id' }],
      effectiveRules: 1,
    });
    const write = vi.spyOn(api, 'writeFile').mockResolvedValue({ success: true });

    renderEditor();
    const save = screen.getByRole('button', { name: '保存' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '校验' }));
    expect(await screen.findByText(/校验通过：生效 1 条/)).toBeInTheDocument();
    expect(screen.getByText(/覆盖了同编号内置规则/)).toBeInTheDocument();
    expect(save).toBeEnabled();

    await user.click(save);
    expect(write).toHaveBeenCalledWith(
      'diagnosis-rules/my-rules.yaml',
      expect.stringContaining('rules:') as unknown as string,
    );
    expect(await screen.findByText('已保存，下次诊断生效')).toBeInTheDocument();
  });

  it('校验不通过时禁止保存并逐条显示错误（Scenario 5.6）', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'validateUserRules').mockResolvedValue({
      ok: false,
      errors: [{ line: null, ruleId: null, message: '规则集加载失败：全部规则非法' }],
      warnings: [],
      effectiveRules: 0,
    });
    const write = vi.spyOn(api, 'writeFile');

    renderEditor();
    await user.click(screen.getByRole('button', { name: '校验' }));
    expect(await screen.findByText(/全部规则非法/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(write).not.toHaveBeenCalled();
  });

  it('改动内容后旧校验结论失效，必须重新校验（Scenario 5.6）', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'validateUserRules').mockResolvedValue({
      ok: true,
      errors: [],
      warnings: [],
      effectiveRules: 1,
    });

    renderEditor();
    await user.click(screen.getByRole('button', { name: '校验' }));
    expect(await screen.findByText(/校验通过/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('规则文件内容'), '\n# 追加一行');
    expect(screen.queryByText(/校验通过/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });
});
