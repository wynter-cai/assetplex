/**
 * 连接页工具详情·三口径摘要测试（fix-trust-and-consistency I4）
 *
 * spec: asset-center-consistency
 * - Scenario 2 计数一致：数字必须带口径名（我的库 / 已同步 / 可收藏）
 * - Scenario 3 已同步来自真实状态：未安装工具不出现「已同步」数字
 * - Scenario 6（asset-distribution-truth）：项目级工具按项目表达，不冒充单资产状态
 * - product-surface-hygiene Scenario 1：本组件不得出现禁用词
 */

import { describe, it, expect } from 'vitest';
import { render, screen, type RenderResult } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ToolAssetSummary from './ToolAssetSummary';
import { FALLBACK_ASSET_CATEGORIES } from '@/config/asset-categories';
import { makeDiscoveredFiles, makeToolAssetCounts, makeToolCounts } from '@/lib/test-factories';
import type { ToolAssetCounts } from '@/types/api';

function renderSummary(
  props: Partial<ComponentProps<typeof ToolAssetSummary>> = {},
): RenderResult {
  return render(
    <MemoryRouter>
      <ToolAssetSummary
        installed
        counts={makeToolAssetCounts()}
        discovered={makeDiscoveredFiles()}
        categories={FALLBACK_ASSET_CATEGORIES}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ToolAssetSummary 三口径', () => {
  it('逐类显示「已同步 N / 我的库 M」，口径名紧随数字', () => {
    renderSummary({
      counts: makeToolAssetCounts({ skill: makeToolCounts({ library: 100, synced: 96 }) }),
    });
    const row = screen.getByTestId('count-row-skill');
    expect(row).toHaveTextContent('技能');
    expect(row).toHaveTextContent('已同步 96');
    expect(row).toHaveTextContent('我的库 100');
  });

  it('三项全零的类别不出现在列表里', () => {
    renderSummary({
      counts: makeToolAssetCounts({
        skill: makeToolCounts({ library: 2, synced: 1 }),
        mcp: makeToolCounts(),
      }),
    });
    expect(screen.getByTestId('count-row-skill')).toBeInTheDocument();
    expect(screen.queryByTestId('count-row-mcp')).toBeNull();
  });

  it('未安装工具不出现任何「已同步」数字', () => {
    const { container } = renderSummary({
      installed: false,
      counts: makeToolAssetCounts({ skill: makeToolCounts({ library: 32, synced: 30 }) }),
    });
    expect(screen.getByText(/工具未安装/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/已同步/);
  });

  it('计数拿不到时说明暂不可用，绝不编数字', () => {
    const { container } = renderSummary({ counts: null });
    expect(screen.getByText(/同步状态暂不可用/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/已同步 \d/);
  });

  it('项目级工具按项目同步，不产出逐类已同步行（D3）', () => {
    renderSummary({
      counts: makeToolAssetCounts(
        { skill: makeToolCounts({ library: 32, synced: 0 }) },
        { projectCount: 3 },
      ),
    });
    expect(screen.getByText(/按项目同步/)).toBeInTheDocument();
    expect(screen.getByText(/已接入 3 个项目/)).toBeInTheDocument();
    expect(screen.queryByTestId('count-row-skill')).toBeNull();
  });

  it('项目级工具尚未配置项目时说明「尚未选择项目」', () => {
    renderSummary({
      counts: makeToolAssetCounts({}, { projectCount: 0 }),
    });
    expect(screen.getByText(/按项目同步/)).toBeInTheDocument();
    expect(screen.getByText(/尚未选择项目/)).toBeInTheDocument();
  });

  it('可收藏列出文件并给出唯一出口「去收藏」', () => {
    renderSummary({
      counts: makeToolAssetCounts({ skill: makeToolCounts({ library: 2, pendingImport: 2 }) }),
      discovered: makeDiscoveredFiles({
        skills: [
          { path: 'D:/demo/skills/brand-new/SKILL.md', size: 2048 },
          { path: 'D:/demo/skills/another-one/SKILL.md', size: 1024 },
        ],
      }),
    });
    expect(screen.getByText(/可收藏 2/)).toBeInTheDocument();
    expect(screen.getByText('brand-new')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /去收藏/ })).toHaveAttribute('href', '/import');
  });

  it('没有可收藏的新文件时不给出空入口', () => {
    renderSummary({
      counts: makeToolAssetCounts({ skill: makeToolCounts({ library: 2, synced: 2 }) }),
    });
    expect(screen.getByText(/没有可收藏的新文件/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /去收藏/ })).toBeNull();
  });

  it('索引部分失败时提示状态不完整', () => {
    const counts: ToolAssetCounts = makeToolAssetCounts(
      { skill: makeToolCounts({ library: 2, synced: 1 }) },
      { partial: true, failedTools: ['workbuddy'] },
    );
    renderSummary({ counts });
    expect(screen.getByText(/部分工具状态暂不可用/)).toBeInTheDocument();
  });

  it('未纳入声明源的类别（memory）不直出英文 code，也不留孤立数字', () => {
    const { container } = renderSummary({
      counts: makeToolAssetCounts({
        memory: makeToolCounts({ pendingImport: 2 }),
        skill: makeToolCounts({ library: 2, synced: 2 }),
      }),
    });
    expect(container.textContent).not.toMatch(/memory/);
    expect(screen.queryByTestId('count-row-memory')).toBeNull();
    expect(screen.queryByText(/可收藏 2/)).toBeNull();
  });

  it('本组件文案不含禁用词', () => {
    const FORBIDDEN = ['Hub', '入库', '未分发', '分发', '保险箱', '沉淀', '投放'];
    const cases: Array<Partial<ComponentProps<typeof ToolAssetSummary>>> = [
      { counts: makeToolAssetCounts({ skill: makeToolCounts({ library: 2, synced: 1, pendingImport: 1 }) }) },
      { installed: false },
      { counts: null },
      { counts: makeToolAssetCounts({}, { projectCount: 2 }) },
    ];
    for (const props of cases) {
      const { container } = renderSummary({
        discovered: makeDiscoveredFiles({ skills: [{ path: 'D:/demo/skills/demo/SKILL.md', size: 10 }] }),
        ...props,
      });
      const text = container.textContent ?? '';
      for (const word of FORBIDDEN) {
        expect({ text, word }).toEqual({ text: text.replace(word, '⁂'), word });
      }
    }
  });
});
