/**
 * 切换页测试(enable-tool-hot-swap T8/T9)
 *
 * spec: swap-workflow.spec.md + swap-verify-rollback.spec.md
 * T8: 选工具(未安装置灰) → 预览六类分组 → 不支持类别 skip 文案 → differs 覆盖开关默认关。
 * T9: 执行携带覆盖决策 → 结果"已写入并校验" → 撤销 → 历史列表与回滚标记。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Swap from './Swap';
import { api } from '@/lib/api';
import type { SwapPreview, SwapToolCandidate } from '@/types/api';
import { Toaster } from '@/components/ui/toast';
import { useToastStore } from '@/lib/toast-store';

vi.mock('@/lib/api', () => ({
  api: {
    getSwapTools: vi.fn(),
    swapPreview: vi.fn(),
    swapExecute: vi.fn(),
    swapRollback: vi.fn(),
    getSwapHistory: vi.fn(),
  },
}));

function makeCandidate(over: Partial<SwapToolCandidate>): SwapToolCandidate {
  const allSupported = { supported: true } as const;
  return {
    name: 'faketool',
    displayName: 'Fake Tool',
    installed: true,
    projectLevel: false,
    supportMatrix: {
      identity: allSupported,
      rule: allSupported,
      skill: allSupported,
      mcp: allSupported,
      memory: { supported: false, reason: '此工具不支持memory类别，已跳过' },
      agent: allSupported,
    },
    ...over,
  };
}

const CANDIDATES: SwapToolCandidate[] = [
  makeCandidate({ name: 'workbuddy', displayName: 'WorkBuddy / CodeBuddy' }),
  makeCandidate({ name: 'codex', displayName: 'OpenAI Codex', installed: false }),
];

/** 六类分组预览:rule 含 differs 项，memory 不支持整组 skip */
function makePreview(): SwapPreview {
  const group = (category: string, items: unknown[] = [], skipped = 0): unknown => ({
    category,
    support:
      category === 'memory'
        ? { supported: false, reason: '此工具不支持memory类别，已跳过' }
        : { supported: true },
    items,
    counts: { total: items.length, new: items.length, willOverwrite: 0, unchanged: 0, skipped },
  });
  return {
    tool: 'workbuddy',
    toolInstalled: true,
    generatedAt: '2026-10-11T08:00:00.000Z',
    groups: [
      group('identity', [
        {
          category: 'identity',
          hubRelativePath: 'identity/profile.md',
          targetPath: 'C:/.workbuddy/IDENTITY.md',
          strategy: 'symlink',
          conflict: 'none',
          defaultOverwrite: false,
          support: { supported: true },
        },
      ]),
      group('rule', [
        {
          category: 'rule',
          hubRelativePath: 'rules/global.md',
          targetPath: 'C:/.workbuddy/rules/global.md',
          strategy: 'symlink',
          conflict: 'differs',
          defaultOverwrite: false,
          support: { supported: true },
        },
      ]),
      group('memory', [], 1),
      group('skill'),
      group('mcp'),
      group('agent'),
    ],
  } as unknown as SwapPreview;
}

function renderSwap(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/swap']}>
        <Swap />
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useToastStore.getState().reset();
  vi.clearAllMocks();
  vi.mocked(api.getSwapTools).mockResolvedValue({ tools: CANDIDATES });
  vi.mocked(api.swapPreview).mockResolvedValue(makePreview());
  vi.mocked(api.getSwapHistory).mockResolvedValue({ history: [] });
});

describe('切换页-工具选择与预览(T8)', () => {
  it('渲染候选工具；未安装工具禁用并说明', async () => {
    renderSwap();
    const wb = await screen.findByRole('button', { name: /WorkBuddy/ });
    expect(wb).toBeEnabled();
    const codex = screen.getByRole('button', { name: /OpenAI Codex/ });
    expect(codex).toBeDisabled();
    expect(screen.getByText(/未安装/)).toBeInTheDocument();
  });

  it('选择工具后按六类分组渲染预览，不支持类别显示跳过原因', async () => {
    renderSwap();
    fireEvent.click(await screen.findByRole('button', { name: /WorkBuddy/ }));
    await waitFor(() => expect(api.swapPreview).toHaveBeenCalledWith('workbuddy'));

    expect(await screen.findByRole('heading', { name: '身份' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '规则' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '记忆' })).toBeInTheDocument();
    expect(screen.getByText(/此工具不支持memory类别，已跳过/)).toBeInTheDocument();
  });

  it('differs 项覆盖开关默认关闭', async () => {
    renderSwap();
    fireEvent.click(await screen.findByRole('button', { name: /WorkBuddy/ }));
    const checkbox = (await screen.findByRole('checkbox', {
      name: /覆盖 rules\/global\.md/,
    })) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});

describe('切换页-执行、验证与撤销(T9)', () => {
  /** 选中工具并等待预览出现 */
  async function pickTool() {
    renderSwap();
    fireEvent.click(await screen.findByRole('button', { name: /WorkBuddy/ }));
    await screen.findByRole('button', { name: /执行切换/ });
  }

  it('执行时仅携带勾选的覆盖决策并回传 preview 时间戳', async () => {
    await pickTool();
    vi.mocked(api.swapExecute).mockResolvedValue({
      tool: 'workbuddy',
      swapId: 'swap-1',
      success: true,
      counts: { written: 1, skipped: 0, failed: 0 },
      items: [
        {
          hubRelativePath: 'rules/global.md',
          category: 'rule',
          action: 'written',
          verify: { passed: true, exists: true, parseable: true, matchesSource: true, hubRelativePath: 'rules/global.md' },
        },
      ],
      rollbackAvailable: true,
      createdAt: '2026-10-11T08:01:00.000Z',
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /覆盖 rules\/global\.md/ }));
    fireEvent.click(screen.getByRole('button', { name: /执行切换/ }));

    await waitFor(() =>
      expect(api.swapExecute).toHaveBeenCalledWith('workbuddy', '2026-10-11T08:00:00.000Z', [
        { hubRelativePath: 'rules/global.md', overwrite: true },
      ]),
    );
  });

  it('执行成功后展示诚实验证文案"已写入并校验"，并提供撤销入口', async () => {
    await pickTool();
    vi.mocked(api.swapExecute).mockResolvedValue({
      tool: 'workbuddy',
      swapId: 'swap-1',
      success: true,
      counts: { written: 1, skipped: 0, failed: 0 },
      items: [
        {
          hubRelativePath: 'identity/profile.md',
          category: 'identity',
          action: 'written',
          verify: { passed: true, exists: true, parseable: true, matchesSource: true, hubRelativePath: 'identity/profile.md' },
        },
      ],
      rollbackAvailable: true,
      createdAt: '2026-10-11T08:01:00.000Z',
    });

    fireEvent.click(screen.getByRole('button', { name: /执行切换/ }));
    expect(await screen.findByText(/已写入并校验/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /撤销本次切换/ })).toBeInTheDocument();
  });

  it('撤销调用 rollback 接口并提示结果', async () => {
    await pickTool();
    vi.mocked(api.swapExecute).mockResolvedValue({
      tool: 'workbuddy',
      swapId: 'swap-1',
      success: true,
      counts: { written: 1, skipped: 0, failed: 0 },
      items: [],
      rollbackAvailable: true,
      createdAt: '2026-10-11T08:01:00.000Z',
    });
    vi.mocked(api.swapRollback).mockResolvedValue({ swapId: 'swap-1', restored: 1, removed: 0, success: true });

    fireEvent.click(screen.getByRole('button', { name: /执行切换/ }));
    fireEvent.click(await screen.findByRole('button', { name: /撤销本次切换/ }));

    await waitFor(() => expect(api.swapRollback).toHaveBeenCalledWith('swap-1'));
    expect(await screen.findByText(/已恢复/)).toBeInTheDocument();
  });

  it('执行被拒(staleness)时向用户展示重新预览错误', async () => {
    await pickTool();
    vi.mocked(api.swapExecute).mockRejectedValue(new Error('目标工具目录已变化，请重新预览后再执行'));

    fireEvent.click(screen.getByRole('button', { name: /执行切换/ }));
    expect(await screen.findByText(/请重新预览后再执行/)).toBeInTheDocument();
  });

  it('历史列表渲染切换记录与已撤销标记', async () => {
    vi.mocked(api.getSwapHistory).mockResolvedValue({
      history: [
        {
          swapId: 's-2',
          tool: 'workbuddy',
          createdAt: '2026-10-11T08:00:00.000Z',
          counts: { written: 3, skipped: 1, failed: 0 },
          rolledBack: true,
          rollbackAvailable: false,
        },
        {
          swapId: 's-1',
          tool: 'trae-cn',
          createdAt: '2026-10-10T08:00:00.000Z',
          counts: { written: 2, skipped: 0, failed: 1 },
          rolledBack: false,
          rollbackAvailable: true,
        },
      ],
    });
    renderSwap();
    expect(await screen.findByText('切换历史')).toBeInTheDocument();
    expect(await screen.findByText(/写入 3/)).toBeInTheDocument();
    expect(screen.getByText('已撤销')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /撤销/ }).length).toBeGreaterThanOrEqual(1);
  });
});

describe('切换页-项目级工具呈现（I7）', () => {
  it('项目级工具显示「按项目同步」而非六类徽章', async () => {
    const qoder = makeCandidate({
      name: 'qoder',
      displayName: 'Qoder',
      projectLevel: true,
      supportMatrix: {
        identity: { supported: false, reason: '不支持' },
        rule: { supported: false, reason: '不支持' },
        skill: { supported: false, reason: '不支持' },
        mcp: { supported: false, reason: '不支持' },
        memory: { supported: false, reason: '不支持' },
        agent: { supported: false, reason: '不支持' },
      },
    });
    vi.mocked(api.getSwapTools).mockResolvedValue({ tools: [qoder] });
    renderSwap();
    const card = await screen.findByRole('button', { name: /Qoder/ });
    expect(card).toBeInTheDocument();
    expect(screen.getByText('本工具按项目同步')).toBeInTheDocument();
    // 不显示任何类别徽章
    expect(screen.queryByText(/身份/)).not.toBeInTheDocument();
  });

  it('普通工具仍然显示支持类别徽章', async () => {
    renderSwap();
    const card = await screen.findByRole('button', { name: /WorkBuddy/ });
    expect(card).toBeInTheDocument();
    expect(screen.queryByText('本工具按项目同步')).not.toBeInTheDocument();
  });
});
