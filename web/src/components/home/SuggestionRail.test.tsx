/**
 * 首页建议条测试（add-asset-governance L3）
 *
 * spec: specs/proactive-guidance.spec.md Scenario 1/3/5/6
 * 断言：结论式首屏、一键入口、无弹窗、本次忽略按会话生效。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuggestionRail } from './SuggestionRail';
import { api } from '@/lib/api';
import type { GovernanceSuggestionsResponse, GovernanceSuggestionItem } from '@/types/api';

vi.mock('@/lib/api', () => ({ api: { getGovernanceSuggestions: vi.fn() } }));

function suggestion(id: GovernanceSuggestionItem['id'], impact: number): GovernanceSuggestionItem {
  return {
    id,
    executable: true,
    title: `${id} 建议`,
    reason: `${id} 原因`,
    scale: { assets: impact, estimatedCalls: 0 },
    action: { label: '去处理', route: '/duplicates' },
    impact,
  };
}

function payload(overrides: Partial<GovernanceSuggestionsResponse> = {}): GovernanceSuggestionsResponse {
  return {
    suggestions: [suggestion('duplicates', 4), suggestion('completeness', 12), suggestion('distribution', 9)],
    info: [],
    firstRun: {
      headline: '扫到 25 个资产，其中 4 个重复/近重复，12 个缺关键信息',
      stats: { assetCount: 25, duplicateCount: 4, missingInfoCount: 12 },
      primary: { label: '帮我收拾', route: '/duplicates' },
      secondary: { label: '先看看' },
      clean: false,
    },
    aiConfigured: true,
    emptyMessage: null,
    ...overrides,
  };
}

function renderRail(onOpenRemediation?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SuggestionRail {...(onOpenRemediation === undefined ? {} : { onOpenRemediation })} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SuggestionRail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('首屏给结论句与主次 CTA，主 CTA 直达重复治理（Scenario 1）', async () => {
    vi.spyOn(api, 'getGovernanceSuggestions').mockResolvedValue(payload());
    renderRail();
    expect(await screen.findByTestId('first-run-briefing')).toHaveTextContent('扫到 25 个资产');
    expect(screen.getByText('重复 4 项 · 缺关键信息 12 项')).toBeInTheDocument();
    const primary = screen.getByText('帮我收拾').closest('a');
    expect(primary).toHaveAttribute('href', '/duplicates');
    fireEvent.click(screen.getByTestId('first-run-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('first-run-briefing')).toBeNull());
  });

  it('说明文字与规模可见，且不弹模态框（Scenario 4/5）', async () => {
    vi.spyOn(api, 'getGovernanceSuggestions').mockResolvedValue(payload({ firstRun: null }));
    renderRail();
    expect(await screen.findByTestId('suggestion-completeness')).toHaveTextContent('涉及 12 个资产');
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });

  it('本次忽略后该建议消失，并在同一会话内记住（Scenario 6）', async () => {
    vi.spyOn(api, 'getGovernanceSuggestions').mockResolvedValue(payload({ firstRun: null }));
    const first = renderRail();
    await screen.findByTestId('suggestion-completeness');
    const item = screen.getByTestId('suggestion-completeness');
    fireEvent.click(item.querySelector('button:last-child') as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByTestId('suggestion-completeness')).toBeNull());
    first.unmount();

    renderRail();
    expect(await screen.findByTestId('suggestion-duplicates')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('suggestion-completeness')).toBeNull());
  });

  it('无可做之事显示固定文案而非硬凑（Scenario 3）', async () => {
    vi.spyOn(api, 'getGovernanceSuggestions').mockResolvedValue(
      payload({ suggestions: [], firstRun: null, emptyMessage: '状态良好，暂无需要处理的事项' }),
    );
    renderRail();
    expect(await screen.findByText('状态良好，暂无需要处理的事项')).toBeInTheDocument();
  });
});
