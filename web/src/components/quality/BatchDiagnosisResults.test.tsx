/**
 * 跨类别批量诊断结果组件测试（refactor-governance-center T5）
 *
 * spec: governance-center.spec.md Scenario 3.4 / 3.5 / 7.1；
 * 断言：按问题类型聚合并按严重度排序、失败项单独列出并可重试、只给深链无修复入口。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  BatchDiagnosisResults,
  assetLink,
  groupFindingsByTitle,
  type BatchRunItem,
} from './BatchDiagnosisResults';
import type { DiagnosisReport, RuleFinding } from '@/types/api';

function finding(overrides: Partial<RuleFinding> = {}): RuleFinding {
  return {
    id: 'SK-03:skills/demo/SKILL.md',
    ruleId: 'SK-03',
    severity: 'medium',
    confidence: 'high',
    source: 'rule',
    title: '技能 description 缺少触发子句',
    finding: 'description 没有说清何时使用',
    impact: '模型可能不触发该技能',
    suggestion: '补一句「Use when …」',
    evidence: [{ hubRelativePath: 'skills/demo/SKILL.md', line: 3, snippet: 'description: 演示' }],
    insufficientEvidence: false,
    fixable: true,
    ignored: false,
    ...overrides,
  };
}

function report(findings: RuleFinding[]): DiagnosisReport {
  return {
    kind: 'skill',
    hubRelativePath: 'skills/demo/SKILL.md',
    overall: 'needs-attention',
    findings,
    issues: [],
    rulesVersion: '1.0.0',
    coverage: { evaluatedRules: 15, skippedRules: 7, skippedReasons: [{ mode: 'llm', reason: 'no-ai-config', count: 7 }] },
    criteriaUsed: [],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: true,
    aiEvaluated: false,
    rejected: 0,
    model: '',
    generatedAt: '2026-11-15T00:00:00.000Z',
  };
}

function item(overrides: Partial<BatchRunItem> = {}): BatchRunItem {
  return { kind: 'skill', hubRelativePath: 'skills/demo/SKILL.md', status: 'done', ...overrides };
}

function renderResults(props: Partial<React.ComponentProps<typeof BatchDiagnosisResults>> = {}) {
  const onRetryFailed = vi.fn();
  render(
    <MemoryRouter>
      <BatchDiagnosisResults
        items={[item({ report: report([finding()]) })]}
        rulesVersion="1.0.0"
        mechanicalOnly={true}
        running={false}
        onRetryFailed={onRetryFailed}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onRetryFailed };
}

describe('groupFindingsByTitle', () => {
  it('按标题聚合，组间按最严重级别排序，组内按严重度排序', () => {
    const items: BatchRunItem[] = [
      item({
        hubRelativePath: 'skills/a/SKILL.md',
        report: report([
          finding({ id: 'low', title: '低优先问题', severity: 'low' }),
          finding({ id: 'high', title: '高优先问题', severity: 'high' }),
        ]),
      }),
      item({
        hubRelativePath: 'skills/b/SKILL.md',
        report: report([finding({ id: 'mid-1', title: '低优先问题', severity: 'medium' })]),
      }),
      item({ hubRelativePath: 'skills/c/SKILL.md', status: 'failed', error: '超时' }),
    ];
    const groups = groupFindingsByTitle(items);

    expect(groups.map((group) => group.title)).toEqual(['高优先问题', '低优先问题']);
    expect(groups[1]?.items.map((entry) => entry.severity)).toEqual(['medium', 'low']);
    // 已忽略项不计入聚合
    const ignored = groupFindingsByTitle([
      item({ report: report([finding({ id: 'ignored', ignored: true })]) }),
    ]);
    expect(ignored).toEqual([]);
  });
});

describe('BatchDiagnosisResults', () => {
  it('渲染聚合结果与覆盖度披露，行内只给资产库深链', () => {
    renderResults();
    expect(screen.getByText('技能 description 缺少触发子句')).toBeInTheDocument();
    expect(screen.getByText(/规则集 v1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText('本次不评估语义质量')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: '在资产库中打开' });
    expect(link).toHaveAttribute('href', assetLink({ kind: 'skill', hubRelativePath: 'skills/demo/SKILL.md' }));
    expect(screen.queryByRole('button', { name: /应用修复/ })).not.toBeInTheDocument();
  });

  it('失败项单独列出，重试只触发失败项回调', async () => {
    const { onRetryFailed } = renderResults({
      items: [
        item({ report: report([finding()]) }),
        item({ hubRelativePath: 'skills/broken/SKILL.md', status: 'failed', error: '模型超时' }),
      ],
    });
    const failedCard = screen.getByTestId('batch-failed-list');
    expect(within(failedCard).getByText(/模型超时/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /重试失败项（1）/ }));
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
  });

  it('全部健康时给空结果文案', () => {
    renderResults({ items: [item({ report: report([]) })] });
    expect(screen.getByText('本轮未发现需要处理的问题。')).toBeInTheDocument();
  });
});
