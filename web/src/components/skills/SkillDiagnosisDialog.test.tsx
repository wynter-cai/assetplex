/**
 * 子集诊断预估与发起测试（refactor-skill-catalog T11 / spec R4）
 *
 * 断言：预估失败/超限时禁用并给原因、机械降级文案、二次确认、只对可诊断项执行、
 * 任何路径都不在未预估前调用模型。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillDiagnosisDialog, type SkillDiagnosisDialogProps } from './SkillDiagnosisDialog';
import { api } from '@/lib/api';
import type { SkillDiagnoseEstimate, DiagnosisReport } from '@/types/api';

function estimate(partial: Partial<SkillDiagnoseEstimate> = {}): SkillDiagnoseEstimate {
  return {
    total: 12,
    diagnosable: 12,
    unDiagnosable: [],
    cacheHits: 3,
    willCall: 9,
    aiConfigured: true,
    mechanicalOnly: false,
    overSelectionLimit: false,
    overCallLimit: false,
    confirmRequired: false,
    limits: { maxSelection: 100, confirmThreshold: 50, maxCalls: 200 },
    targets: [
      { id: 'demo-a', name: 'demo-a', hubRelativePath: 'skills/demo-a/SKILL.md' },
      { id: 'demo-b', name: 'demo-b', hubRelativePath: 'skills/demo-b/SKILL.md' },
    ],
    ...partial,
  };
}

function report(hubRelativePath: string): DiagnosisReport {
  return {
    kind: 'skill',
    hubRelativePath,
    overall: 'healthy',
    issues: [],
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: false,
    model: 'demo-model',
    rulesVersion: '1.5.0',
    generatedAt: '2026-11-17T02:00:00.000Z',
  };
}

const ids = ['demo-a', 'demo-b', 'demo-c'];

function renderDialog(overrides: Partial<SkillDiagnosisDialogProps> = {}): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SkillDiagnosisDialog ids={ids} onClose={vi.fn()} {...overrides} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'doctorDiagnose').mockImplementation(async (body) => report(body.hubRelativePath));
  vi.spyOn(api, 'putSkillDiagnosisSummaries').mockResolvedValue({ saved: 2, rejected: [] });
});

describe('SkillDiagnosisDialog 预估（R4.2/R4.3）', () => {
  it('先预估再展示：total/cacheHits/willCall 与不可诊断明细，发起前零诊断调用', async () => {
    const spy = vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(
      estimate({
        unDiagnosable: [{ id: 'demo-c', name: 'demo-c', reason: 'not-in-library' }],
        diagnosable: 2,
        total: 3,
      }),
    );
    renderDialog();
    expect(screen.getByText(/成本估算中/)).toBeInTheDocument();
    expect(await screen.findByText(/共 3 项，3 条命中缓存不消耗，将调用 9 次模型/)).toBeInTheDocument();
    expect(screen.getByText('未收藏，收藏后可诊断')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(ids);
    expect(api.doctorDiagnose).not.toHaveBeenCalled();
  });

  it('预估失败时禁用发起并说明「无法估算成本」', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockRejectedValue(new Error('网络异常'));
    renderDialog();
    expect(await screen.findByText(/无法估算成本，暂不能发起/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发起诊断' })).not.toBeInTheDocument();
    expect(api.doctorDiagnose).not.toHaveBeenCalled();
  });

  it('超过单次选择上限时禁用发起并提示分批', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(estimate({ total: 150, overSelectionLimit: true }));
    renderDialog();
    expect(await screen.findByText(/一次最多 100 个，请分批（当前选择 150 个）/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发起诊断' })).toBeDisabled();
  });

  it('超过调用硬上限时禁用发起并说明原因', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(
      estimate({ willCall: 260, overCallLimit: true, confirmRequired: true }),
    );
    renderDialog();
    expect(await screen.findByText(/超过单次上限 200 次/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发起诊断' })).toBeDisabled();
  });

  it('未配置 AI：明确只跑机械检查，发起仍可用', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(
      estimate({ willCall: 0, mechanicalOnly: true, aiConfigured: false, cacheHits: 0 }),
    );
    renderDialog();
    expect(await screen.findByText(/只跑机械检查，零模型调用/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发起诊断' })).toBeEnabled();
  });

  it('所选全部不可诊断：发起禁用并说明', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(
      estimate({
        diagnosable: 0,
        targets: [],
        unDiagnosable: [{ id: 'demo-a', name: 'demo-a', reason: 'missing-file' }],
      }),
    );
    renderDialog();
    expect(await screen.findByText('所选技能均不可诊断')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发起诊断' })).toBeDisabled();
  });
});

describe('SkillDiagnosisDialog 发起与执行（R4.6 / T11）', () => {
  it('超阈值需二次确认：首次点击只出警示，确认后只对可诊断项执行', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(estimate({ willCall: 80, confirmRequired: true }));
    const onCompleted = vi.fn();
    renderDialog({ onCompleted });
    fireEvent.click(await screen.findByRole('button', { name: '发起诊断' }));
    expect(screen.getByText(/超过 50 次需确认/)).toBeInTheDocument();
    expect(api.doctorDiagnose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '仍然发起' }));
    await waitFor(() => expect(api.doctorDiagnose).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(onCompleted.mock.calls[0][0]).toHaveLength(2);
  });

  it('无需确认时直接执行，失败项保留原因且不中断其他条目', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(estimate({ willCall: 5, confirmRequired: false }));
    vi.mocked(api.doctorDiagnose).mockImplementation(async (body) => {
      if (body.hubRelativePath === 'skills/demo-b/SKILL.md') throw new Error('输出无法解析为 JSON');
      return report(body.hubRelativePath);
    });
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: '发起诊断' }));
    expect(await screen.findByText(/成功 1 · 失败 1/)).toBeInTheDocument();
    expect(api.doctorDiagnose).toHaveBeenCalledTimes(2);
  });
});

describe('SkillDiagnosisDialog 结果回写与重试（T12 / R5.3-R5.4）', () => {
  it('完成后回写摘要：一次调用只提交成功项', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(estimate({ willCall: 2 }));
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: '发起诊断' }));
    await waitFor(() => expect(api.putSkillDiagnosisSummaries).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.putSkillDiagnosisSummaries).mock.calls[0][0];
    expect(payload.map((item) => item.id)).toEqual(['demo-a', 'demo-b']);
    expect(payload[0]).toMatchObject({
      overall: 'healthy',
      rulesVersion: '1.5.0',
      model: 'demo-model',
      mechanicalOnly: false,
      checkedAt: '2026-11-17T02:00:00.000Z',
    });
  });

  it('失败项可只重试失败 id，重试成功后再回写一次摘要', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(estimate({ willCall: 2 }));
    let demoBFailures = 0;
    vi.mocked(api.doctorDiagnose).mockImplementation(async (body) => {
      if (body.hubRelativePath === 'skills/demo-b/SKILL.md' && demoBFailures === 0) {
        demoBFailures += 1;
        throw new Error('网络超时');
      }
      return report(body.hubRelativePath);
    });
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: '发起诊断' }));
    await waitFor(() => expect(screen.getByText('网络超时')).toBeInTheDocument());
    expect(vi.mocked(api.putSkillDiagnosisSummaries).mock.calls[0][0]).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '重试失败项（1）' }));
    await waitFor(() => expect(api.doctorDiagnose).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(api.putSkillDiagnosisSummaries).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.putSkillDiagnosisSummaries).mock.calls[1][0].map((item) => item.id)).toEqual(['demo-b']);
    expect(api.doctorDiagnose).toHaveBeenLastCalledWith({
      kind: 'skill',
      hubRelativePath: 'skills/demo-b/SKILL.md',
    });
    expect(screen.queryByText('网络超时')).not.toBeInTheDocument();
  });

  it('「去修复」只回调该技能行', async () => {
    vi.spyOn(api, 'estimateSkillDiagnosis').mockResolvedValue(estimate({ willCall: 2 }));
    const onOpenFix = vi.fn();
    renderDialog({ onOpenFix });
    fireEvent.click(await screen.findByRole('button', { name: '发起诊断' }));
    await screen.findByText('成功 2 · 失败 0');
    const fixButtons = await screen.findAllByRole('button', { name: /去修复/ });
    fireEvent.click(fixButtons[0]);
    expect(onOpenFix).toHaveBeenCalledTimes(1);
    expect(onOpenFix.mock.calls[0][0]).toMatchObject({ target: { id: 'demo-a' } });
  });
});
