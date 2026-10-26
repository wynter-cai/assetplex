import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DistributionBadge } from './DistributionBadge';
import { makeDistributionEntry } from '@/lib/test-factories';
import type { AssetDistributionInfo } from '@/types/api';

/**
 * 分发状态圆点条
 *
 * spec: asset-distribution-truth Scenario 1/3/8/9（状态五值闭集、失败工具不渲染成任何状态、
 *   空清单不写「未分发」）
 * 关联: fix-trust-and-consistency tasks I2
 */

describe('DistributionBadge 五状态渲染', () => {
  it.each([
    ['synced', '已同步', 'bg-success'],
    ['pending', '待同步', 'bg-warning'],
    ['conflict', '冲突', 'bg-destructive'],
    ['not_enabled', '未启用', 'bg-slate-300'],
    ['not_installed', '未安装', 'bg-slate-200'],
  ] as const)('%s → %s（%s）', (status, label, colorClass) => {
    render(<DistributionBadge distributions={[makeDistributionEntry({ toolId: 'trae-cn', toolName: 'TRAE 中国版', status })]} />);

    const dot = screen.getByTestId('distribution-dot-trae-cn');
    expect(dot.className).toContain(colorClass);
    expect(dot.getAttribute('title')).toBe(`TRAE 中国版：${label}`);
  });

  it('空清单不渲染任何圆点，也不出现「未分发」字样（Scenario 9）', () => {
    const { container } = render(<DistributionBadge distributions={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('未分发')).not.toBeInTheDocument();
  });

  it('闭集之外的状态（含判定失败的工具）不渲染成任何状态（Scenario 8）', () => {
    const { container } = render(
      <DistributionBadge
        distributions={[
          makeDistributionEntry({ toolId: 'ghost', status: 'failed' as AssetDistributionInfo['status'] }),
          makeDistributionEntry({ toolId: 'boom', status: undefined as unknown as AssetDistributionInfo['status'] }),
          makeDistributionEntry({ toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced' }),
        ]}
      />,
    );
    expect(screen.queryByTestId('distribution-dot-ghost')).not.toBeInTheDocument();
    expect(screen.queryByTestId('distribution-dot-boom')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-status]')).toHaveLength(1);
  });

  it('超过 5 个工具时折叠计数，但已有圆点仍按真实状态渲染', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => makeDistributionEntry({ toolId: id, status: 'synced' }));
    render(<DistributionBadge distributions={many} />);
    expect(screen.getAllByTestId(/^distribution-dot-/)).toHaveLength(5);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
