/**
 * ArbitrationPanel 组件测试（add-llm-conflict-arbitration C1/C2/C3）
 *
 * spec: specs/conflict-arbitration.spec.md Scenario 1/2/3/4/5/6/7/8
 * mock api.arbitrate：面板只改「待确认」采纳状态，绝不直接落盘（信任红线）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArbitrationPanel } from './ArbitrationPanel';
import { api } from '@/lib/api';
import type { ArbitrationResponse } from '@/types/api';

function response(overrides: Partial<ArbitrationResponse> = {}): ArbitrationResponse {
  return {
    decision: 'keep-left',
    rationale: '导入版包含新增的规则条目',
    criteriaUsed: ['token-economy'],
    criteriaSkipped: 0,
    cached: false,
    model: 'demo-model',
    generatedAt: '2026-10-18T00:00:00.000Z',
    ...overrides,
  };
}

function baseProps(overrides: Partial<ComponentProps<typeof ArbitrationPanel>> = {}) {
  return {
    category: 'rule' as const,
    leftPath: 'd:/demo/tool/rules/rule.md',
    rightPath: 'rules/demo-rule.md',
    leftLabel: 'TRAE',
    onAdopt: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ArbitrationPanel', () => {
  it('点击「AI 仲裁」→ 以正确参数请求并渲染决策徽标+理由+命中准则', async () => {
    const arbitrate = vi.spyOn(api, 'arbitrate').mockResolvedValue(response());
    const props = baseProps();
    render(<ArbitrationPanel {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    expect(await screen.findByText('保留导入版')).toBeInTheDocument();
    expect(arbitrate).toHaveBeenCalledWith({
      category: 'rule',
      leftPath: 'd:/demo/tool/rules/rule.md',
      rightPath: 'rules/demo-rule.md',
      leftLabel: 'TRAE',
    });
    expect(screen.getByText('导入版包含新增的规则条目')).toBeInTheDocument();
    expect(screen.getByText('token-economy')).toBeInTheDocument();
  });

  it('keep-left 采纳→onAdopt("overwrite")；不调用任何写盘接口', async () => {
    vi.spyOn(api, 'arbitrate').mockResolvedValue(response());
    const props = baseProps();
    render(<ArbitrationPanel {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    await userEvent.click(await screen.findByRole('button', { name: '采纳建议' }));

    expect(props.onAdopt).toHaveBeenCalledWith('overwrite', undefined);
    expect(screen.getByText(/确认导入后生效/)).toBeInTheDocument();
  });

  it('keep-right 采纳→onAdopt("skip")', async () => {
    vi.spyOn(api, 'arbitrate').mockResolvedValue(response({ decision: 'keep-right', rationale: '现有版更新' }));
    const props = baseProps();
    render(<ArbitrationPanel {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    await userEvent.click(await screen.findByRole('button', { name: '采纳建议' }));

    expect(props.onAdopt).toHaveBeenCalledWith('skip', undefined);
  });

  it('merge：草案可编辑，「以此为准」→onAdopt("merge", 编辑后草案)（Scenario 3）', async () => {
    vi.spyOn(api, 'arbitrate').mockResolvedValue(
      response({ decision: 'merge', rationale: '互补', mergedContent: '合并草案' }),
    );
    const props = baseProps();
    render(<ArbitrationPanel {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    const box = await screen.findByRole('textbox', { name: '仲裁合并草案' });
    expect(box).toHaveValue('合并草案');
    await userEvent.clear(box);
    await userEvent.type(box, '人工调整后的草案');
    await userEvent.click(screen.getByRole('button', { name: '以此为准' }));

    expect(props.onAdopt).toHaveBeenCalledWith('merge', '人工调整后的草案');
  });

  it('manual-review：仅理由，无采纳按钮，引导手动处理（Scenario 5）', async () => {
    vi.spyOn(api, 'arbitrate').mockResolvedValue(
      response({ decision: 'manual-review', rationale: '两侧语义冲突较大' }),
    );
    render(<ArbitrationPanel {...baseProps()} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    expect(await screen.findByText('需人工复核')).toBeInTheDocument();
    expect(screen.getByText('两侧语义冲突较大')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '采纳建议' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '以此为准' })).not.toBeInTheDocument();
    expect(screen.getByText(/手动/)).toBeInTheDocument();
  });

  it('cached=true 标注「来自缓存」；criteriaSkipped>0 披露未参与条数（Scenario 7）', async () => {
    vi.spyOn(api, 'arbitrate').mockResolvedValue(response({ cached: true, criteriaSkipped: 2 }));
    render(<ArbitrationPanel {...baseProps()} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    expect(await screen.findByText('来自缓存')).toBeInTheDocument();
    expect(screen.getByText(/2 条准则未参与/)).toBeInTheDocument();
  });

  it('仲裁失败：原样展示「仲裁失败：原因」，手动策略不受影响（Scenario 6）', async () => {
    vi.spyOn(api, 'arbitrate').mockRejectedValue(new Error('仲裁失败：输出不是合法 JSON'));
    render(<ArbitrationPanel {...baseProps()} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    expect(await screen.findByText('仲裁失败：输出不是合法 JSON')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 仲裁' })).toBeEnabled();
  });

  it('未配置 AI 端点：提示并给出去配置入口链接（Scenario 8）', async () => {
    vi.spyOn(api, 'arbitrate').mockRejectedValue(new Error('AI 配置不完整：baseUrl/apiKey/model 缺失'));
    render(<ArbitrationPanel {...baseProps()} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));

    expect(await screen.findByText('请先在设置中配置 AI 端点')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /配置/ })).toHaveAttribute('href', '/skills');
  });

  it('仲裁中显示加载态，完成后按钮可再次触发', async () => {
    let resolveFn: (r: ArbitrationResponse) => void = () => undefined;
    vi.spyOn(api, 'arbitrate').mockReturnValue(new Promise((res) => { resolveFn = res; }));
    render(<ArbitrationPanel {...baseProps()} />);

    await userEvent.click(screen.getByRole('button', { name: 'AI 仲裁' }));
    expect(screen.getByRole('button', { name: /仲裁中/ })).toBeDisabled();
    resolveFn(response());
    expect(await screen.findByText('保留导入版')).toBeInTheDocument();
  });
});
