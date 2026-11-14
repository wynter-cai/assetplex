/**
 * 结果屏「查看详情」（add-zero-config-onboarding 走查）
 *
 * spec Requirement 3：同一资产在多处维护必须能展开看到每个工具的落点与版本，
 * 让用户自己判断「要不要统一」，而不是直接被判定为错误。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultScreen } from './ResultScreen';
import type { OnboardingInsightGroup, ScanWithInsights } from '@/types/api';

const GROUP: OnboardingInsightGroup = {
  category: 'rule',
  name: 'style',
  hubTargetPath: 'rules/always/style.md',
  tools: ['trae-cn', 'codex'],
  distinctVersions: 2,
  comparedCopies: 2,
  copies: [
    {
      tool: 'trae-cn',
      path: '/tmp/demo/trae/rules/always/style.md',
      size: 2048,
      modified: '2026-11-01T00:00:00.000Z',
      contentHash: 'aaaaaa111111',
    },
    {
      tool: 'codex',
      path: '/tmp/demo/codex/rules/always/style.md',
      size: 4096,
      modified: '2026-11-02T00:00:00.000Z',
      contentHash: 'bbbbbb222222',
    },
  ],
};

const SCAN: ScanWithInsights = {
  inventories: [
    {
      toolName: 'trae-cn',
      displayName: 'TRAE CN',
      installed: true,
      configDir: '/tmp/demo/trae',
      items: [
        {
          absolutePath: '/tmp/demo/trae/rules/always/style.md',
          relativePath: 'style.md',
          size: 2048,
          modified: '2026-11-01T00:00:00.000Z',
          category: 'rule',
          hubTargetPath: 'rules/always/style.md',
          conflict: 'none',
          tool: 'trae-cn',
          binary: false,
        },
      ],
    },
    {
      toolName: 'codex',
      displayName: 'Codex',
      installed: true,
      configDir: '/tmp/demo/codex',
      items: [
        {
          absolutePath: '/tmp/demo/codex/rules/always/style.md',
          relativePath: 'style.md',
          size: 4096,
          modified: '2026-11-02T00:00:00.000Z',
          category: 'rule',
          hubTargetPath: 'rules/always/style.md',
          conflict: 'none',
          tool: 'codex',
          binary: false,
        },
      ],
    },
  ],
  insights: {
    duplicateGroups: [GROUP],
    versionMismatchGroups: [GROUP],
    coverageGroups: [],
    installedTools: ['trae-cn', 'codex'],
  },
};

describe('ResultScreen 洞察详情', () => {
  it('重复维护可展开，看到每个工具的路径与版本', () => {
    render(<ResultScreen scan={SCAN} onCollect={vi.fn()} onSkip={vi.fn()} />);

    const toggle = screen.getByTestId('insight-toggle-dup-rules/always/style.md');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = screen.getByTestId('insight-detail-dup-rules/always/style.md');
    expect(detail).toHaveTextContent('/tmp/demo/trae/rules/always/style.md');
    expect(detail).toHaveTextContent('/tmp/demo/codex/rules/always/style.md');
    expect(detail).toHaveTextContent('版本 aaaaaa');
    expect(detail).toHaveTextContent('版本 bbbbbb');
    expect(detail).toHaveTextContent('内容已经不一样了');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('insight-detail-dup-rules/always/style.md')).not.toBeInTheDocument();
  });

  it('无重复时如实说明，不出现详情入口', () => {
    const empty: ScanWithInsights = {
      inventories: SCAN.inventories,
      insights: {
        duplicateGroups: [],
        versionMismatchGroups: [],
        coverageGroups: [],
        installedTools: ['trae-cn', 'codex'],
      },
    };
    render(<ResultScreen scan={empty} onCollect={vi.fn()} onSkip={vi.fn()} />);
    expect(
      screen.getByText('各工具里没有同名资产，不需要合并或多处对照。'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('insight-toggle-dup-rules/always/style.md')).not.toBeInTheDocument();
  });
});
