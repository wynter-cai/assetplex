/**
 * 质量中心「规则清单」页测试（add-diagnosis-rules T7）
 *
 * spec: diagnosis-rules.spec.md Scenario 1.1 / 1.3、统计口径（cross 单列）
 * 断言重点：版本与计数透出、按类别过滤、编号可复制、接口失败如实报错。
 * 全部使用中性示例名（demo-rule / example-rule），不出现真实资产。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QualityRules from './QualityRules';
import { api } from '@/lib/api';
import type { DiagnosisRuleListResponse } from '@/types/api';

const DATA: DiagnosisRuleListResponse = {
  version: '1.0.0',
  updatedAt: '2026-01-01',
  rules: [
    {
      id: 'SK-04',
      category: 'skill',
      severity: 'high',
      mode: 'static',
      signal: 'description 过泛',
      recommendation: '补一句具体用途',
      source: '演示出处 A',
    },
    {
      id: 'SK-11',
      category: 'skill',
      severity: 'medium',
      mode: 'llm',
      signal: '未说明触发场景',
      recommendation: '补触发条件',
      source: '演示出处 B',
    },
    {
      id: 'SEC-01',
      category: 'cross',
      appliesTo: ['skill', 'rule'],
      severity: 'high',
      mode: 'static',
      signal: '出现明文密钥',
      recommendation: '改为环境变量',
      source: '演示出处 C',
    },
  ],
  counts: {
    identity: 0,
    skill: 2,
    rule: 0,
    mcp: 0,
    command: 0,
    agent: 0,
    memory: 0,
    cross: 1,
  },
  modeCounts: { static: 2, llm: 1 },
};

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QualityRules />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QualityRules 规则清单', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getDiagnosisRules').mockResolvedValue(DATA);
  });

  it('展示规则集版本、总数与静态/AI 口径', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /规则清单/ })).toBeInTheDocument();
    const summary = await screen.findByTestId('rule-set-summary');
    expect(summary).toHaveTextContent('规则集 v1.0.0');
    expect(summary).toHaveTextContent('共 3 条');
    expect(summary).toHaveTextContent('静态 2');
    expect(summary).toHaveTextContent('AI 1');
    expect(summary).toHaveTextContent('跨资产通用 1 条单列计数');
  });

  it('每条规则展示编号、严重度、判定信号、改法与依据', async () => {
    renderPage();
    const card = await screen.findByTestId('rule-card-SK-04');
    expect(card).toHaveTextContent('SK-04');
    expect(card).toHaveTextContent('高');
    expect(card).toHaveTextContent('静态');
    expect(card).toHaveTextContent('description 过泛');
    expect(card).toHaveTextContent('改法：补一句具体用途');
    expect(card).toHaveTextContent('依据：演示出处 A');
  });

  it('按类别过滤，cross 单列展示且标注适用类别', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('rule-card-SK-04');

    await user.click(screen.getByRole('button', { name: /^技能 2$/ }));
    expect(screen.getByTestId('rule-card-SK-04')).toBeInTheDocument();
    expect(screen.getByTestId('rule-card-SK-11')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-card-SEC-01')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^跨资产通用 1$/ }));
    const cross = screen.getByTestId('rule-card-SEC-01');
    expect(cross).toBeInTheDocument();
    expect(cross).toHaveTextContent('适用于 技能 / 规则');
    expect(screen.queryByTestId('rule-card-SK-04')).not.toBeInTheDocument();
  });

  it('编号可一键复制', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderPage();

    const card = await screen.findByTestId('rule-card-SK-04');
    await user.click(within(card).getByRole('button', { name: '复制编号' }));
    expect(writeText).toHaveBeenCalledWith('SK-04');
    expect(await within(card).findByRole('button', { name: '已复制' })).toBeInTheDocument();
  });

  it('规则集加载失败时如实报错，不展示空清单冒充成功', async () => {
    vi.spyOn(api, 'getDiagnosisRules').mockRejectedValue(new Error('规则集未加载'));
    renderPage();
    expect(await screen.findByText('规则清单读取失败')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-list')).not.toBeInTheDocument();
  });
});
