import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDistributions, distributionsFor } from './use-distributions';
import { api } from './api';
import type { DistributionIndexResponse } from '@/types/api';

/**
 * 分发索引消费层
 *
 * spec: asset-distribution-truth（资产状态来自 GET /api/distributions，
 *   索引 key 是资产在 Hub 中的相对路径 = Asset.id）
 * 关联: fix-trust-and-consistency tasks I2
 */

function payload(overrides: Partial<DistributionIndexResponse> = {}): DistributionIndexResponse {
  return {
    generatedAt: '2026-10-26T00:00:00.000Z',
    cached: false,
    partial: false,
    failedTools: [],
    index: {
      'rules/safety.md': [
        { toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced' },
        { toolId: 'codex', toolName: 'Codex', status: 'not_installed' },
      ],
    },
    projectTools: [],
    ...overrides,
  };
}

function wrapper(): React.FunctionComponent<{ children?: ReactNode }> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDistributions', () => {
  it('按资产 id 取该资产的分发条目，未知 id 返回空数组', async () => {
    vi.spyOn(api, 'getDistributions').mockResolvedValue(payload());
    const { result } = renderHook(() => useDistributions(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.generatedAt).toBe('2026-10-26T00:00:00.000Z'));
    expect(distributionsFor(result.current, 'rules/safety.md')).toHaveLength(2);
    expect(distributionsFor(result.current, 'skills/absent/SKILL.md')).toEqual([]);
    expect(result.current.partial).toBe(false);
  });

  it('partial 与 failedTools 透出给界面提示', async () => {
    vi.spyOn(api, 'getDistributions').mockResolvedValue(
      payload({ partial: true, failedTools: ['claude'] }),
    );
    const { result } = renderHook(() => useDistributions(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.partial).toBe(true));
    expect(result.current.failedTools).toEqual(['claude']);
  });

  it('refresh() 以 refresh=1 重新拉取并覆盖缓存', async () => {
    const spy = vi
      .spyOn(api, 'getDistributions')
      .mockResolvedValueOnce(payload())
      .mockResolvedValueOnce(payload({ generatedAt: '2026-10-26T01:00:00.000Z' }));
    const { result } = renderHook(() => useDistributions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.generatedAt).toBe('2026-10-26T00:00:00.000Z'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(spy).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(result.current.generatedAt).toBe('2026-10-26T01:00:00.000Z'));
  });

  it('索引请求失败时不抛错：条目为空，界面按「状态未知」渲染', async () => {
    vi.spyOn(api, 'getDistributions').mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useDistributions(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(distributionsFor(result.current, 'rules/safety.md')).toEqual([]);
  });
});
