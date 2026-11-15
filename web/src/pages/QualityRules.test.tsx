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
    vi.spyOn(api, 'getDiagnosisIgnores').mockResolvedValue({ items: [], expired: 0 });
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

  it('按编号 / 信号搜索，搜不到时给空态（Scenario 5.1）', async () => {
    const user = userEvent.setup();
    renderPage();
    const search = await screen.findByLabelText('搜索规则');
    await user.type(search, 'SK-11');
    expect(screen.getByTestId('rule-card-SK-11')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-card-SK-04')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, '不存在的词');
    expect(screen.getByText('没有匹配的规则。')).toBeInTheDocument();
  });

  it('用户规则显示来源徽章与坏规则告警条（Scenario 5.7）', async () => {
    vi.spyOn(api, 'getDiagnosisRules').mockResolvedValue({
      ...DATA,
      rules: [
        { ...DATA.rules[0], origin: 'user', overridesBuiltin: true, originLabel: 'diagnosis-rules/a.yaml' },
        { ...DATA.rules[1], origin: 'user', overridesBuiltin: false, originLabel: 'diagnosis-rules/a.yaml' },
        { ...DATA.rules[2], origin: 'builtin', overridesBuiltin: false, originLabel: 'builtin:diagnosis-rules.yaml' },
      ],
      sources: { builtinCount: 2, userCount: 2, overriddenRuleIds: ['SK-04'] },
      loadPolicy: 'category-on-demand',
      userRules: {
        directory: 'diagnosis-rules',
        loaded: 1,
        warnings: [{ originLabel: 'diagnosis-rules/a.yaml', ruleId: 'USER-02', reason: 'missing-field' }],
      },
    } as never);

    renderPage();
    const overridden = await screen.findByTestId('rule-card-SK-04');
    expect(within(overridden).getByText('用户规则（覆盖内置）')).toBeInTheDocument();
    expect(screen.getByTestId('rule-set-summary')).toHaveTextContent('内置 2 条');
    expect(screen.getByTestId('rule-warnings')).toHaveTextContent('1 条坏规则已被跳过');
  });

  it('忽略清单可就地恢复，并标注已失效条数（Scenario 5.5 / 5.7）', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getDiagnosisIgnores').mockResolvedValue({
      items: [{ ruleId: 'SK-04', hubRelativePath: 'skills/demo/SKILL.md', contentHash: 'h', ignoredAt: '2026-11-01T00:00:00.000Z' }],
      expired: 1,
    });
    const restore = vi.spyOn(api, 'restoreDiagnosisFinding').mockResolvedValue({
      ruleId: 'SK-04',
      hubRelativePath: 'skills/demo/SKILL.md',
      restored: true,
    });

    renderPage();
    expect(await screen.findByText(/1 条因资产内容变更已自动失效/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '恢复提示' }));
    expect(restore).toHaveBeenCalledWith({ hubRelativePath: 'skills/demo/SKILL.md', ruleId: 'SK-04' });
  });
});
