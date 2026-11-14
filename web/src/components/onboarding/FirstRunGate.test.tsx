/**
 * 首跑路由守卫测试（add-zero-config-onboarding T16）
 *
 * spec Requirement 1/8：仅未初始化且未标记时进入向导；已完成用户直接看首页；
 * 状态接口失败不白屏（渲染 children，不写标记）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstRunGate } from '@/components/onboarding/FirstRunGate';
import { api } from '@/lib/api';
import type { OnboardingStateResponse } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: { getOnboardingState: vi.fn() },
}));

function makeState(over: Partial<OnboardingStateResponse> = {}): OnboardingStateResponse {
  return {
    hubRoot: '/tmp/demo-hub',
    initialized: true,
    onboarded: false,
    autoEnter: false,
    assetCount: 3,
    lastOutcome: null,
    tools: [],
    ...over,
  };
}

function renderGate(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <FirstRunGate>
                <div>home-page</div>
              </FirstRunGate>
            }
          />
          <Route path="/onboarding" element={<div>onboarding-page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getOnboardingState).mockReset();
});

describe('FirstRunGate（T16）', () => {
  it('autoEnter=true 时重定向到向导', async () => {
    vi.mocked(api.getOnboardingState).mockResolvedValue(
      makeState({ initialized: false, autoEnter: true, assetCount: 0 }),
    );
    renderGate();
    expect(await screen.findByText('onboarding-page')).toBeTruthy();
  });

  it('已完成用户直接渲染首页', async () => {
    vi.mocked(api.getOnboardingState).mockResolvedValue(
      makeState({ onboarded: true, autoEnter: false }),
    );
    renderGate();
    expect(await screen.findByText('home-page')).toBeTruthy();
  });

  it('状态接口失败时渲染首页而非白屏', async () => {
    vi.mocked(api.getOnboardingState).mockRejectedValue(new Error('服务不可达'));
    renderGate();
    expect(await screen.findByText('home-page')).toBeTruthy();
  });
});
