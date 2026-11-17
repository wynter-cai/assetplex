/**
 * 批量诊断结果聚合面板测试（refactor-skill-catalog T12 / spec R5）
 *
 * 断言：分组顺序 有风险→需关注→健康→失败；组内按严重度；
 * 「去修复」回调只跳单个技能；「重试失败项」只交失败 id；底部披露口径。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillDiagnosisResults, sortDiagnosisRows } from './SkillDiagnosisResults';
import type { DiagnosisRow } from './use-skill-diagnosis-pool';
import type { DiagnosisOverall, DiagnosisReport, DiagnosisSeverity } from '@/types/api';

function report(
  name: string,
  overall: DiagnosisOverall,
  severities: DiagnosisSeverity[] = [],
  overrides: Partial<DiagnosisReport> = {},
): DiagnosisReport {
  return {
    kind: 'skill',
    hubRelativePath: `skills/${name}/SKILL.md`,
    overall,
    issues: severities.map((severity, index) => ({
      severity,
      criterion: `SK-0${index}`,
      finding: `${name} 问题 ${index}`,
      suggestion: '按建议修改',
      fixable: true,
    })),
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: false,
    rulesVersion: '1.5.0',
    model: 'demo-model',
    generatedAt: '2026-11-17T02:30:00.000Z',
    ...overrides,
  };
}

function row(name: string, rep: DiagnosisReport | null, error: string | null = null): DiagnosisRow {
  return { target: { id: name, name, hubRelativePath: `skills/${name}/SKILL.md` }, report: rep, error };
}

const rows: DiagnosisRow[] = [
  row('demo-healthy', report('demo-healthy', 'healthy')),
  row('demo-failed', null, '输出无法解析为 JSON'),
  row('demo-needs', report('demo-needs', 'needs-attention', ['low'])),
  row('demo-risk', report('demo-risk', 'at-risk', ['low', 'high', 'medium'])),
];

describe('SkillDiagnosisResults 排序（R5.1）', () => {
  it('分组顺序为 有风险 → 需关注 → 健康 → 失败', () => {
    render(<SkillDiagnosisResults rows={rows} />);
    const names = screen.getAllByTestId('diagnosis-result-name').map((el) => el.textContent);
    expect(names).toEqual(['demo-risk', 'demo-needs', 'demo-healthy', 'demo-failed']);
    expect(screen.getByText('成功 3 · 失败 1')).toBeInTheDocument();
  });

  it('同一分组内按最高严重度、问题数排序', () => {
    const sameGroup = [
      row('demo-low', report('demo-low', 'needs-attention', ['low'])),
      row('demo-high', report('demo-high', 'needs-attention', ['high', 'high'])),
      row('demo-medium', report('demo-medium', 'needs-attention', ['medium'])),
    ];
    expect(sortDiagnosisRows(sameGroup).map((item) => item.target.id)).toEqual([
      'demo-high',
      'demo-medium',
      'demo-low',
    ]);
  });

  it('行内展示高/中/低问题数与体检时间，失败行显示原因原文', () => {
    render(<SkillDiagnosisResults rows={rows} />);
    expect(screen.getByText('高 1 · 中 1 · 低 1')).toBeInTheDocument();
    expect(screen.getAllByText('体检 2026-11-17 10:30')).toHaveLength(3);
    expect(screen.getByText('输出无法解析为 JSON')).toBeInTheDocument();
  });

  it('底部披露规则集版本、模型、生成时间与机械口径', () => {
    render(<SkillDiagnosisResults rows={rows} />);
    const footer = screen.getByText(/规则集 v1.5.0/);
    expect(footer).toHaveTextContent('模型 demo-model');
    expect(footer).toHaveTextContent('生成于 2026-11-17 10:30');
    expect(footer).not.toHaveTextContent('仅机械检查');
  });

  it('全部只跑机械检查时明确标注', () => {
    render(
      <SkillDiagnosisResults
        rows={[row('demo-a', report('demo-a', 'healthy', [], { mechanicalOnly: true, model: '' }))]}
      />,
    );
    expect(screen.getByText(/本次仅机械检查/)).toBeInTheDocument();
  });
});

describe('SkillDiagnosisResults 动作（R5.2/R5.3）', () => {
  it('「去修复」只回调该行，不提供批量修复', () => {
    const onOpenFix = vi.fn();
    render(<SkillDiagnosisResults rows={rows} onOpenFix={onOpenFix} />);
    const fixButtons = screen.getAllByRole('button', { name: /去修复/ });
    // 失败行没有报告，不提供修复入口
    expect(fixButtons).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /全部修复|批量修复/ })).not.toBeInTheDocument();
    fireEvent.click(fixButtons[0]);
    expect(onOpenFix).toHaveBeenCalledTimes(1);
    expect(onOpenFix.mock.calls[0][0].target.id).toBe('demo-risk');
  });

  it('「重试失败项」只把失败 id 交给回调', () => {
    const onRetryFailed = vi.fn();
    render(<SkillDiagnosisResults rows={rows} onRetryFailed={onRetryFailed} />);
    fireEvent.click(screen.getByRole('button', { name: '重试失败项（1）' }));
    expect(onRetryFailed).toHaveBeenCalledWith(['demo-failed']);
  });

  it('重试中按钮禁用并显示进度文案', () => {
    render(<SkillDiagnosisResults rows={rows} retrying onRetryFailed={vi.fn()} />);
    expect(screen.getByRole('button', { name: '重试中…' })).toBeDisabled();
  });
});
