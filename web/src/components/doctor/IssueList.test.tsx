/**
 * IssueList 测试（refactor-asset-pipeline T8）
 *
 * 证据展开、证据不足、来源徽标、旧响应回退与忽略披露。
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IssueList } from './IssueList';
import type { DiagnosisReport, RuleFinding } from '@/types/api';

function finding(overrides: Partial<RuleFinding> = {}): RuleFinding {
  return {
    id: 'f1',
    ruleId: 'identity.no-behavior',
    severity: 'medium',
    confidence: 'high',
    source: 'llm',
    title: '人设缺少行为约束',
    finding: '只写了身份，没有写该怎么做事',
    impact: '换工具后风格不一致',
    suggestion: '补三条行为规则',
    evidence: [{ hubRelativePath: 'identity/profile.md', line: 12, snippet: '- 背景：示例架构师' }],
    insufficientEvidence: false,
    fixable: true,
    ignored: false,
    ...overrides,
  };
}

function report(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return {
    kind: 'identity',
    hubRelativePath: 'identity/profile.md',
    overall: 'needs-attention',
    findings: [finding()],
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

describe('IssueList', () => {
  it('默认收起证据：展示规则编号、严重度、来源、置信度与可修复', () => {
    render(<IssueList report={report()} />);
    expect(screen.getByText('identity.no-behavior')).toBeInTheDocument();
    expect(screen.getByText('中')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('置信度 high')).toBeInTheDocument();
    expect(screen.getByText('可修复')).toBeInTheDocument();
    expect(screen.queryByText(/identity\/profile.md:12/)).not.toBeInTheDocument();
  });

  it('展开证据：路径 + 行号 + 片段 + 建议与影响', () => {
    render(<IssueList report={report()} />);
    fireEvent.click(screen.getByRole('button', { name: '查看证据' }));
    expect(screen.getByText('identity/profile.md:12')).toBeInTheDocument();
    expect(screen.getByText('- 背景：示例架构师')).toBeInTheDocument();
    expect(screen.getByText('建议：补三条行为规则')).toBeInTheDocument();
    expect(screen.getByText('影响：换工具后风格不一致')).toBeInTheDocument();
  });

  it('证据不足：固定文案，且不冒充可修复', () => {
    render(
      <IssueList
        report={report({ findings: [finding({ insufficientEvidence: true, evidence: [] })] })}
      />,
    );
    expect(screen.getByText('证据不足，无法确定')).toBeInTheDocument();
    expect(screen.queryByText('可修复')).not.toBeInTheDocument();
  });

  it('静态规则来源显示「规则」', () => {
    render(<IssueList report={report({ findings: [finding({ source: 'rule' })] })} />);
    expect(screen.getByText('规则')).toBeInTheDocument();
  });

  it('忽略项：逐条标「已忽略」并汇总条数', () => {
    render(
      <IssueList report={report({ findings: [finding({ ignored: true }), finding({ id: 'f2' })] })} />,
    );
    expect(screen.getByText('已忽略')).toBeInTheDocument();
    expect(screen.getByText('已忽略 1 条')).toBeInTheDocument();
  });

  it('旧响应缺 findings：回退 issues，保留机械检查与准则链接', () => {
    render(
      <IssueList
        report={report({
          findings: undefined,
          issues: [
            { severity: 'high', criterion: 'mechanical:description-empty', finding: 'description 为空', suggestion: '补一句', fixable: true },
            { severity: 'low', criterion: 'token-economy', finding: '正文偏长', suggestion: '删基础概念', fixable: false },
          ],
        })}
      />,
    );
    expect(screen.getByText('机械检查')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'token-economy' })).toHaveAttribute(
      'href',
      '/criteria?slug=token-economy',
    );
    expect(screen.getByText('description 为空')).toBeInTheDocument();
  });

  it('无问题时给正反馈，不凑数', () => {
    render(<IssueList report={report({ findings: [], issues: [] })} />);
    expect(screen.getByText('未发现违反已启用准则的问题')).toBeInTheDocument();
  });
});
