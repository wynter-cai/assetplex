/**
 * BatchCheckup 批量体检组件测试（add-asset-doctor F5）
 *
 * spec: specs/asset-diagnosis.spec.md Scenario 5（预算护栏/并发≤4/失败隔离/排序清单）、
 * Scenario 7（批量降级只跑机械项）、fix-and-distribute.spec.md Scenario 8（不提供批量修复）。
 * 全 mock api：清单由 props 注入，组件只管 estimate→确认→并发诊断→排序展示。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BatchCheckup } from './BatchCheckup';
import { api } from '@/lib/api';
import type { DiagnosisReport, DoctorAssetKind } from '@/types/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    api: {
      ...actual.api,
      doctorEstimate: vi.fn(),
      doctorDiagnose: vi.fn(),
    },
  };
});

const assets = [
  { label: 'demo-a', hubRelativePath: 'skills/demo-a/SKILL.md' },
  { label: 'demo-b', hubRelativePath: 'skills/demo-b/SKILL.md' },
  { label: 'demo-c', hubRelativePath: 'skills/demo-c/SKILL.md' },
];

function makeReport(
  kind: DoctorAssetKind,
  hubRelativePath: string,
  overall: DiagnosisReport['overall'],
  overrides: Partial<DiagnosisReport> = {},
): DiagnosisReport {
  return {
    kind,
    hubRelativePath,
    overall,
    issues: [],
    criteriaUsed: ['token-economy'],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: false,
    model: 'demo-model',
    generatedAt: '2026-10-18T00:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(): void {
  render(<BatchCheckup kind="skill" getAssets={async () => assets} />);
}

beforeEach(() => {
  vi.mocked(api.doctorEstimate).mockReset();
  vi.mocked(api.doctorDiagnose).mockReset();
});

describe('BatchCheckup 预算护栏（Scenario 5）', () => {
  it('展开先 estimate：显示调用数与缓存说明，未点发起零诊断调用', async () => {
    vi.mocked(api.doctorEstimate).mockResolvedValue({ category: 'skill', total: 60, cacheHits: 10, willCall: 50 });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '全部体检' }));
    expect(await screen.findByText(/将调用 50 次模型/)).toBeInTheDocument();
    expect(screen.getByText(/10 条来自缓存不消耗/)).toBeInTheDocument();
    expect(api.doctorDiagnose).not.toHaveBeenCalled();
  });

  it('willCall > 50 需二次确认：首次点击只出警示，点「仍然发起」才执行', async () => {
    vi.mocked(api.doctorEstimate).mockResolvedValue({ category: 'skill', total: 80, cacheHits: 10, willCall: 70 });
    vi.mocked(api.doctorDiagnose).mockImplementation(async (body) =>
      makeReport('skill', body.hubRelativePath, 'healthy'),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '全部体检' }));
    await screen.findByText(/将调用 70 次模型/);
    fireEvent.click(screen.getByRole('button', { name: '发起体检' }));
    expect(screen.getByText(/超过 50 次实际调用/)).toBeInTheDocument();
    expect(api.doctorDiagnose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '仍然发起' }));
    await waitFor(() => expect(api.doctorDiagnose).toHaveBeenCalledTimes(3));
  });

  it('未配置 AI（willCall=0）：明确只跑机械项的降级说明仍可发起（Scenario 7）', async () => {
    vi.mocked(api.doctorEstimate).mockResolvedValue({ category: 'skill', total: 3, cacheHits: 3, willCall: 0 });
    vi.mocked(api.doctorDiagnose).mockImplementation(async (body) =>
      makeReport('skill', body.hubRelativePath, 'healthy', { mechanicalOnly: true, model: '', issues: [] }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '全部体检' }));
    expect(await screen.findByText(/只跑机械检查/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '发起体检' }));
    await waitFor(() => expect(api.doctorDiagnose).toHaveBeenCalledTimes(3));
  });
});

describe('BatchCheckup 执行与清单（Scenario 5/8）', () => {
  it('并发 ≤4 逐条诊断，执行期进度可见', async () => {
    vi.mocked(api.doctorEstimate).mockResolvedValue({ category: 'skill', total: 5, cacheHits: 0, willCall: 5 });
    const five = [
      ...assets,
      { label: 'demo-d', hubRelativePath: 'skills/demo-d/SKILL.md' },
      { label: 'demo-e', hubRelativePath: 'skills/demo-e/SKILL.md' },
    ];
    let inflight = 0;
    let max = 0;
    vi.mocked(api.doctorDiagnose).mockImplementation(async (body) => {
      inflight += 1;
      max = Math.max(max, inflight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inflight -= 1;
      return makeReport('skill', body.hubRelativePath, 'healthy');
    });
    render(<BatchCheckup kind="skill" getAssets={async () => five} />);
    fireEvent.click(screen.getByRole('button', { name: '全部体检' }));
    await screen.findByText(/将调用 5 次模型/);
    fireEvent.click(screen.getByRole('button', { name: '发起体检' }));
    await waitFor(() => expect(api.doctorDiagnose).toHaveBeenCalledTimes(5));
    expect(max).toBeLessThanOrEqual(4);
  });

  it('完成后按 有风险→需关注→健康→失败 排序；点条目展开单份报告；不提供批量修复', async () => {
    vi.mocked(api.doctorEstimate).mockResolvedValue({ category: 'skill', total: 3, cacheHits: 0, willCall: 3 });
    vi.mocked(api.doctorDiagnose).mockImplementation(async (body) => {
      if (body.hubRelativePath === 'skills/demo-a/SKILL.md') {
        return makeReport('skill', body.hubRelativePath, 'healthy');
      }
      if (body.hubRelativePath === 'skills/demo-b/SKILL.md') {
        return makeReport('skill', body.hubRelativePath, 'at-risk', {
          issues: [
            { severity: 'high', criterion: 'mechanical:description-empty', finding: 'description 为空', suggestion: '补一句触发描述', fixable: true },
          ],
        });
      }
      throw new Error('诊断失败：输出无法解析为 JSON');
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '全部体检' }));
    await screen.findByText(/将调用 3 次模型/);
    fireEvent.click(screen.getByRole('button', { name: '发起体检' }));

    // 排序清单：有风险(demo-b) → 健康(demo-a) → 失败(demo-c)
    await waitFor(() => expect(screen.getByText(/体检完成/)).toBeInTheDocument());
    const rows = screen.getAllByRole('button', { name: /demo-/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('demo-b'),
      expect.stringContaining('demo-a'),
      expect.stringContaining('demo-c'),
    ]);
    expect(rows[2]).toHaveTextContent('诊断失败：输出无法解析为 JSON');

    // 点条目看单份报告（含机械 issue 明细）
    fireEvent.click(rows[0]);
    expect(await screen.findByText('description 为空')).toBeInTheDocument();

    // Scenario 8：批量只到诊断为止，无任何批量修复入口
    expect(screen.queryByRole('button', { name: /修复/ })).not.toBeInTheDocument();
    expect(screen.getByText(/批量只到诊断为止/)).toBeInTheDocument();
  });
});
