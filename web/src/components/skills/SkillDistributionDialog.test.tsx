/**
 * 技能分发影响清单测试（refactor-skill-catalog T15 / spec R6）
 *
 * 断言：默认保守勾选、无目标/状态未知禁用并说明、冲突未勾选提示、
 * 执行结果逐条渲染、逐工具回滚调用既有接口、Esc 关闭与焦点归还、不显示绝对路径。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { SkillDistributionDialog } from './SkillDistributionDialog';
import { api } from '@/lib/api';
import type {
  SkillDistributionExecuteResponse,
  SkillDistributionPreview,
  SkillDistributionToolImpact,
} from '@/types/api';

const ids = ['demo-a', 'demo-b'];

function tool(
  partial: Partial<SkillDistributionToolImpact> & { tool: string; displayName: string },
): SkillDistributionToolImpact {
  return {
    installed: true,
    supported: true,
    defaultSelected: false,
    files: { total: 0, created: 0, overwritten: 0, unchanged: 0, conflicts: 0 },
    sampleTargets: [],
    ...partial,
  };
}

function preview(tools: SkillDistributionToolImpact[]): SkillDistributionPreview {
  return {
    token: 'demo-token',
    generatedAt: '2026-11-18T02:00:00.000Z',
    expiresAt: '2026-11-18T02:10:00.000Z',
    skills: [
      { id: 'demo-a', name: 'demo-a', hubRelativePath: 'skills/demo-a/SKILL.md' },
      { id: 'demo-b', name: 'demo-b', hubRelativePath: 'skills/demo-b/SKILL.md' },
    ],
    ineligible: [],
    tools,
    totals: {
      tools: tools.length,
      files: tools.reduce((sum, item) => sum + item.files.total, 0),
      created: tools.reduce((sum, item) => sum + item.files.created, 0),
      overwritten: tools.reduce((sum, item) => sum + item.files.overwritten, 0),
      unchanged: tools.reduce((sum, item) => sum + item.files.unchanged, 0),
      conflicts: tools.reduce((sum, item) => sum + item.files.conflicts, 0),
    },
    backup: { policy: 'swap', note: '写入前自动备份' },
  };
}

function executeResult(): SkillDistributionExecuteResponse {
  return {
    results: [
      { skillId: 'demo-a', skillName: 'demo-a', tool: 'tool-a', action: 'written', swapId: 'swap-1' },
      { skillId: 'demo-b', skillName: 'demo-b', tool: 'tool-a', action: 'skipped', reason: '冲突未覆盖' },
      { skillId: 'demo-a', skillName: 'demo-a', tool: 'tool-b', action: 'failed', reason: '目录不可写' },
    ],
    counts: { written: 1, skipped: 1, failed: 1 },
    rollback: [{ tool: 'tool-a', swapId: 'swap-1' }],
    distributionIndexRefreshed: true,
  };
}

function renderDialog(onCompleted = vi.fn()): void {
  render(<SkillDistributionDialog ids={ids} onClose={vi.fn()} onCompleted={onCompleted} />);
}

const defaultTools = [
  tool({
    tool: 'tool-a',
    displayName: '工具 A',
    defaultSelected: true,
    files: { total: 4, created: 2, overwritten: 1, unchanged: 1, conflicts: 0 },
    sampleTargets: ['skills/demo-a/SKILL.md'],
  }),
  tool({
    tool: 'tool-b',
    displayName: '工具 B',
    installed: false,
    skipReason: '未检测到该工具',
  }),
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'previewSkillDistribution').mockResolvedValue(preview(defaultTools));
  vi.spyOn(api, 'executeSkillDistribution').mockResolvedValue(executeResult());
  vi.spyOn(api, 'rollbackRemediation').mockResolvedValue({
    swapId: 'swap-1',
    restored: 1,
    removed: 1,
    success: true,
  });
});

describe('SkillDistributionDialog 影响清单（R6.1/R6.2/R6.5）', () => {
  it('展示工具×文件数/冲突/跳过原因/示例路径，默认只勾选接口给的 defaultSelected，预览零写入', async () => {
    renderDialog();
    expect(await screen.findByRole('checkbox', { name: '分发到 工具 A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '分发到 工具 B' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '分发到 工具 B' })).toBeDisabled();
    expect(screen.getByText(/共 4（新增 2 \/ 覆盖 1 \/ 不变 1）/)).toBeInTheDocument();
    expect(screen.getByText('未检测到该工具')).toBeInTheDocument();
    expect(screen.getByText('skills/demo-a/SKILL.md')).toBeInTheDocument();
    expect(screen.getByText(/将写入 1 个工具：工具 A/)).toBeInTheDocument();
    expect(api.executeSkillDistribution).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('D:\\');
  });

  it('无可用目标时禁用确认并说明原因', async () => {
    vi.mocked(api.previewSkillDistribution).mockResolvedValue(
      preview([
        tool({ tool: 'tool-a', displayName: '工具 A', supported: false, skipReason: '不支持技能类别' }),
        tool({ tool: 'tool-b', displayName: '工具 B', installed: false, skipReason: '未检测到该工具' }),
      ]),
    );
    renderDialog();
    expect(
      await screen.findByText('没有可用的分发目标：本机没有已安装且支持技能类别的工具'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认分发' })).toBeDisabled();
  });

  it('状态未知的工具不可勾选，确认区单独提示且不推断为未安装', async () => {
    vi.mocked(api.previewSkillDistribution).mockResolvedValue(
      preview([
        tool({
          tool: 'tool-a',
          displayName: '工具 A',
          defaultSelected: true,
          files: { total: 2, created: 2, overwritten: 0, unchanged: 0, conflicts: 0 },
        }),
        tool({ tool: 'tool-b', displayName: '工具 B', statusUnknown: true }),
      ]),
    );
    renderDialog();
    const unknown = await screen.findByRole('checkbox', { name: '分发到 工具 B' });
    expect(unknown).toBeDisabled();
    expect(screen.getAllByText('状态暂不可用').length).toBeGreaterThan(0);
    expect(screen.getByText(/部分工具状态未知（1 个）/)).toBeInTheDocument();
  });

  it('不改勾选时确认按钮因无目标而禁用并给出原因', async () => {
    vi.mocked(api.previewSkillDistribution).mockResolvedValue(
      preview([tool({ tool: 'tool-a', displayName: '工具 A', defaultSelected: false })]),
    );
    renderDialog();
    expect(await screen.findByText('请至少勾选一个目标工具')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认分发' })).toBeDisabled();
  });

  it('冲突未勾选覆盖时给出提示，勾选后执行参数带上 overwriteConflicts', async () => {
    vi.mocked(api.previewSkillDistribution).mockResolvedValue(
      preview([
        tool({
          tool: 'tool-a',
          displayName: '工具 A',
          defaultSelected: true,
          files: { total: 3, created: 1, overwritten: 0, unchanged: 0, conflicts: 2 },
        }),
      ]),
    );
    renderDialog();
    expect(
      await screen.findByText(/工具 A 有 2 个冲突文件，默认跳过；勾选「覆盖」后才会写入/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '覆盖 工具 A 的冲突文件' }));
    fireEvent.click(screen.getByRole('button', { name: '确认分发' }));
    await waitFor(() =>
      expect(api.executeSkillDistribution).toHaveBeenCalledWith({
        token: 'demo-token',
        targets: [{ tool: 'tool-a', overwriteConflicts: true }],
      }),
    );
  });
});

describe('SkillDistributionDialog 执行与回滚（R6.3/R6.4）', () => {
  it('结果页逐条渲染写入/跳过/失败并显示汇总', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: '确认分发' }));
    expect(await screen.findByText('已写入 1 · 跳过 1 · 失败 1')).toBeInTheDocument();
    expect(screen.getByText('冲突未覆盖')).toBeInTheDocument();
    expect(screen.getByText('目录不可写')).toBeInTheDocument();
    expect(screen.getAllByText('已写入')).toHaveLength(1);
  });

  it('逐工具回滚调用既有回滚接口并显示恢复结果', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: '确认分发' }));
    fireEvent.click(await screen.findByRole('button', { name: /回滚 工具 A/ }));
    await waitFor(() => expect(api.rollbackRemediation).toHaveBeenCalledWith('swap-1'));
    expect(await screen.findByText('已恢复 1 个、移除 1 个文件')).toBeInTheDocument();
  });

  it('预览失败时禁用发起并可重试', async () => {
    vi.mocked(api.previewSkillDistribution).mockRejectedValueOnce(new Error('接口超时'));
    renderDialog();
    expect(await screen.findByText(/无法生成影响清单，暂不能分发：接口超时/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认分发' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试预览' }));
    await waitFor(() => expect(api.previewSkillDistribution).toHaveBeenCalledTimes(2));
  });
});

describe('SkillDistributionDialog 可访问性', () => {
  it('Esc 关闭并把焦点归还给打开前元素', async () => {
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>打开分发</button>
          {open && <SkillDistributionDialog ids={ids} onClose={() => setOpen(false)} />}
        </div>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '打开分发' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('heading', { name: /分发选中 2 个技能/ });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /分发选中 2 个技能/ })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
