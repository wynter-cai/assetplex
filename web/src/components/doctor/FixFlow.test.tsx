/**
 * FixFlow 修复流组件测试（add-asset-doctor F4）
 *
 * spec: specs/fix-and-distribute.spec.md Scenario 1（草案可编辑+逐问题说明）、
 * 2（一屏确认：diff+工具勾选+备份说明）、6（全不勾=只改库）、3（撤销入口）、identity 红字警示。
 * 全 mock api：不触网络；状态机逐段推进断言。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FixFlow } from './FixFlow';
import { api } from '@/lib/api';
import type { DiagnosisReport, FixDraftResponse, AssetWriteToolCandidate } from '@/types/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    api: {
      ...actual.api,
      readFile: vi.fn(),
      getDistributionTools: vi.fn(),
      doctorFixDraft: vi.fn(),
      doctorApply: vi.fn(),
      doctorUndo: vi.fn(),
      rollbackRemediation: vi.fn(),
    },
  };
});

const report: DiagnosisReport = {
  kind: 'skill',
  hubRelativePath: 'skills/demo-skill/SKILL.md',
  overall: 'needs-attention',
  issues: [
    { severity: 'high', criterion: 'mechanical:description-empty', finding: 'description 为空', suggestion: '补一句触发描述', fixable: true },
    { severity: 'medium', criterion: 'token-economy', finding: '正文重复通用知识', suggestion: '删除基础概念段', fixable: true },
    { severity: 'low', criterion: 'naming', finding: '命名可更清晰', suggestion: '纯建议', fixable: false },
  ],
  criteriaUsed: ['token-economy'],
  criteriaSkipped: 0,
  cached: false,
  mechanicalOnly: false,
  model: 'demo-model',
  generatedAt: '2026-10-18T00:00:00.000Z',
};

const draftResponse: FixDraftResponse = {
  draftContent: '---\nname: demo-skill\ndescription: 演示技能\n---\n精简正文\n',
  changeNotes: [{ issueIndex: 0, note: '补写了一句触发描述' }],
  contentTruncated: false,
  cached: false,
  model: 'demo-model',
};

const supportAll: AssetWriteToolCandidate['supportMatrix'] = {
  identity: { supported: true },
  rule: { supported: true },
  skill: { supported: true },
  mcp: { supported: true },
  memory: { supported: true },
  agent: { supported: true },
};

function renderFlow(kind: 'skill' | 'identity' = 'skill'): void {
  render(<FixFlow kind={kind} hubRelativePath={report.hubRelativePath} report={{ ...report, kind }} />);
}

/** 推进到草案就绪视图 */
async function toDraft(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /生成修复草案/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /应用并同步/ })).toBeEnabled());
}

/** 推进到一屏确认视图 */
async function toConfirm(): Promise<void> {
  await toDraft();
  fireEvent.click(screen.getByRole('button', { name: /应用并同步/ }));
  await waitFor(() => expect(screen.getByText(/旧版本将存入备份区/)).toBeInTheDocument());
}

beforeEach(() => {
  vi.mocked(api.readFile).mockResolvedValue({
    path: report.hubRelativePath,
    content: '---\nname: demo-skill\n---\n原始正文\n',
    size: 10,
    modified: '2026-10-18T00:00:00.000Z',
  });
  vi.mocked(api.getDistributionTools).mockResolvedValue({
    tools: [
      { name: 'trae', displayName: 'TRAE', installed: true, projectLevel: false, supportMatrix: supportAll },
      { name: 'qoder', displayName: 'Qoder', installed: true, projectLevel: false, supportMatrix: supportAll },
      { name: 'gone', displayName: 'Ghost', installed: false, projectLevel: false, supportMatrix: supportAll },
    ],
  });
  vi.mocked(api.doctorFixDraft).mockResolvedValue(draftResponse);
  vi.mocked(api.doctorApply).mockResolvedValue({
    saved: true,
    backupRef: 'backup-1',
    dispatch: [{ tool: 'trae', action: 'written', swapId: 'write-1' }],
    rollbackAvailable: true,
  });
  vi.mocked(api.doctorUndo).mockResolvedValue({ restored: true, hubRelativePath: report.hubRelativePath });
});

describe('FixFlow 选择与草案（Scenario 1）', () => {
  it('仅列可修复问题且默认全勾选；不可修复项不提供勾选', () => {
    renderFlow();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByText('命名可更清晰')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /生成修复草案/ })).toBeEnabled();
  });

  it('生成草案：带勾选下标调 API，产可编辑草案与逐问题修复说明', async () => {
    renderFlow();
    await toDraft();
    expect(api.doctorFixDraft).toHaveBeenCalledWith({
      kind: 'skill',
      hubRelativePath: 'skills/demo-skill/SKILL.md',
      issueIndexes: [0, 1],
    });
    expect(screen.getByRole('textbox')).toHaveValue('---\nname: demo-skill\ndescription: 演示技能\n---\n精简正文\n');
    expect(screen.getByText('补写了一句触发描述')).toBeInTheDocument();
  });

  it('取消勾选某问题 → issueIndexes 只含保留项', async () => {
    renderFlow();
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: /生成修复草案/ }));
    await waitFor(() =>
      expect(api.doctorFixDraft).toHaveBeenCalledWith(expect.objectContaining({ issueIndexes: [0] })),
    );
  });

  it('草案失败：展示后端文案（如超长 400），可返回重选', async () => {
    vi.mocked(api.doctorFixDraft).mockRejectedValue(new Error('草案失败：资产正文超出审视上限'));
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: /生成修复草案/ }));
    await waitFor(() => expect(screen.getByText(/超出审视上限/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /返回重选/ })).toBeInTheDocument();
  });
});

describe('FixFlow 一屏确认（Scenario 2/6 + identity 警示）', () => {
  it('确认屏同屏展示：原文与草案对照、安装工具默认全勾、备份说明；未安装工具不出现', async () => {
    renderFlow();
    await toConfirm();
    expect(screen.getByText(/原始正文/)).toBeInTheDocument();
    expect(screen.getByText(/精简正文/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /TRAE/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Qoder/ })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Ghost/ })).not.toBeInTheDocument();
    expect(screen.getByText(/旧版本将存入备份区/)).toBeInTheDocument();
  });

  it('取消全部工具 → distribute=false 只改库（Scenario 6）', async () => {
    renderFlow();
    await toConfirm();
    fireEvent.click(screen.getByRole('checkbox', { name: /TRAE/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Qoder/ }));
    fireEvent.click(screen.getByRole('button', { name: /确认应用并同步|确认应用（只改库）/ }));
    await waitFor(() =>
      expect(api.doctorApply).toHaveBeenCalledWith(
        expect.objectContaining({ distribute: false, finalContent: draftResponse.draftContent }),
      ),
    );
  });

  it('部分勾选 → distribute=true 且 targets 显式；编辑草案后以编辑版为准', async () => {
    renderFlow();
    await toConfirm();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '用户改过的草案\n' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Qoder/ }));
    fireEvent.click(screen.getByRole('button', { name: /确认应用并同步/ }));
    await waitFor(() =>
      expect(api.doctorApply).toHaveBeenCalledWith(
        expect.objectContaining({ distribute: true, targets: ['trae'], finalContent: '用户改过的草案\n' }),
      ),
    );
  });

  it('identity 资产：确认屏红字警示人格基座', async () => {
    renderFlow('identity');
    await toConfirm();
    expect(screen.getByText(/人格基座/)).toBeInTheDocument();
  });
});

describe('FixFlow 结果与撤销（Scenario 3/4）', () => {  it('逐工具结果如实展示，提供撤销本次修复入口并可点回滚同步', async () => {
    vi.mocked(api.doctorApply).mockResolvedValue({
      saved: true,
      backupRef: 'backup-1',
      dispatch: [
        { tool: 'trae', action: 'written', swapId: 'write-1' },
        { tool: 'qoder', action: 'failed', reason: '目标目录已变化' },
      ],
      rollbackAvailable: true,
    });
    renderFlow();
    await toConfirm();
    fireEvent.click(screen.getByRole('button', { name: /确认应用并同步/ }));
    await waitFor(() => expect(screen.getByText(/已写入并校验/)).toBeInTheDocument());
    expect(screen.getByText(/目标目录已变化/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /撤销本次修复/ }));
    await waitFor(() => expect(api.doctorUndo).toHaveBeenCalledWith('backup-1'));

    vi.mocked(api.rollbackRemediation).mockResolvedValue({ swapId: 'write-1', restored: 1, removed: 0, success: true });
    fireEvent.click(screen.getByRole('button', { name: /回滚同步/ }));
    await waitFor(() => expect(api.rollbackRemediation).toHaveBeenCalledWith('write-1'));
  });
});

describe('FixFlow 自动复检（refactor-asset-pipeline T9）', () => {
  function renderWithRecheck(
    onRecheck: () => Promise<DiagnosisReport | null>,
    extra: { autoRecheck?: boolean; onUndone?: () => void } = {},
  ): void {
    render(
      <FixFlow
        kind="skill"
        hubRelativePath={report.hubRelativePath}
        report={report}
        onRecheck={onRecheck}
        autoRecheck={extra.autoRecheck ?? true}
        recheckWillCallModel
        {...(extra.onUndone === undefined ? {} : { onUndone: extra.onUndone })}
      />,
    );
  }

  it('确认屏披露自动复检将调用 1 次模型', async () => {
    renderWithRecheck(vi.fn().mockResolvedValue(report));
    await toConfirm();
    expect(screen.getByText(/保存后将自动复检（将调用 1 次模型）/)).toBeInTheDocument();
  });

  it('应用成功后自动复检一次，并报「已修复 X 项，剩余 Y 项」', async () => {
    const onRecheck = vi.fn().mockResolvedValue({ ...report, issues: [report.issues[2]] });
    renderWithRecheck(onRecheck);
    await toConfirm();
    fireEvent.click(screen.getByRole('button', { name: /确认应用并同步/ }));
    await waitFor(() => expect(onRecheck).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('已修复 2 项，剩余 1 项')).toBeInTheDocument();
  });

  it('复检失败：保留写库成功事实，给出失败原因与重试入口', async () => {
    const onRecheck = vi.fn().mockRejectedValue(new Error('模型超时'));
    renderWithRecheck(onRecheck);
    await toConfirm();
    fireEvent.click(screen.getByRole('button', { name: /确认应用并同步/ }));
    await waitFor(() => expect(screen.getByText(/复检失败：模型超时/)).toBeInTheDocument());
    // 写库结果区仍在：撤销入口可见
    expect(screen.getByRole('button', { name: /撤销本次修复/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试复检/ })).toBeInTheDocument();
  });

  it('关闭自动复检后，应用成功不触发复检', async () => {
    const onRecheck = vi.fn().mockResolvedValue(report);
    renderWithRecheck(onRecheck, { autoRecheck: false });
    await toConfirm();
    fireEvent.click(screen.getByRole('button', { name: /确认应用并同步/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /撤销本次修复/ })).toBeInTheDocument());
    expect(onRecheck).not.toHaveBeenCalled();
  });

  it('撤销成功只标记摘要过期，不触发复检', async () => {
    const onRecheck = vi.fn().mockResolvedValue(report);
    const onUndone = vi.fn();
    renderWithRecheck(onRecheck, { autoRecheck: false, onUndone });
    await toConfirm();
    fireEvent.click(screen.getByRole('button', { name: /确认应用并同步/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /撤销本次修复/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /撤销本次修复/ }));
    await waitFor(() => expect(onUndone).toHaveBeenCalledTimes(1));
    expect(onRecheck).not.toHaveBeenCalled();
  });
});
