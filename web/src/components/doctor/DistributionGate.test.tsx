/**
 * DistributionGate 测试（refactor-asset-pipeline T10）
 *
 * 复检通过 → 主按钮；未通过 → 次要入口 + 风险说明；证据不足不计入阻塞。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DistributionGate } from './DistributionGate';
import type { DiagnosisReport } from '@/types/api';

function report(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return {
    kind: 'rule',
    hubRelativePath: 'rules/demo.md',
    overall: 'healthy',
    findings: [],
    issues: [],
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: false,
    model: 'demo-model',
    generatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('DistributionGate', () => {
  it('复检通过：主按钮「分发到工具」并说明没有高/中风险', () => {
    const onDistribute = vi.fn();
    render(<DistributionGate report={report()} onDistribute={onDistribute} />);
    expect(screen.getByText(/复检通过/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /分发到工具/ }));
    expect(onDistribute).toHaveBeenCalledTimes(1);
  });

  it('还有高/中问题：只给「仍要分发」+ 风险说明', () => {
    const onDistribute = vi.fn();
    render(
      <DistributionGate
        report={report({
          findings: [
            {
              id: 'a',
              ruleId: 'rule.x',
              severity: 'high',
              confidence: 'high',
              source: 'rule',
              title: '缺触发描述',
              finding: '',
              impact: '',
              suggestion: '',
              evidence: [],
              insufficientEvidence: false,
              fixable: true,
              ignored: false,
            },
          ],
        })}
        onDistribute={onDistribute}
      />,
    );
    expect(screen.queryByRole('button', { name: /^分发到工具$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/复检未通过：还有 1 个高 \/ 中风险问题/)).toBeInTheDocument();
    expect(screen.getByText(/带问题发出去会同时影响所有已连接工具/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /仍要分发/ }));
    expect(onDistribute).toHaveBeenCalledTimes(1);
  });

  it('证据不足与已忽略不算阻塞', () => {
    render(
      <DistributionGate
        report={report({
          issues: [],
          findings: [
            {
              id: 'a',
              ruleId: 'rule.x',
              severity: 'high',
              confidence: 'low',
              source: 'llm',
              title: '疑似问题',
              finding: '',
              impact: '',
              suggestion: '',
              evidence: [],
              insufficientEvidence: true,
              fixable: false,
              ignored: true,
            },
          ],
        })}
        onDistribute={() => undefined}
      />,
    );
    expect(screen.getByText(/复检通过/)).toBeInTheDocument();
  });
});
