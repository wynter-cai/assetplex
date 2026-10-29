/**
 * 导入向导无冲突路径确认屏测试（queued-import-preview）
 *
 * 契约：Step 2 无冲突时不得一键直接落盘——先进 Step 3 预览"将导入哪些条目、
 * 各自预期动作（新增/跳过）"，用户显式点「开始收藏」才执行；
 * 有冲突路径（Step 2「下一步」→ 冲突确认）行为不回归。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Import from './Import';
import { api } from '@/lib/api';
import type { DiscoveredItem, ImportResult, ToolInventory } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    scanTools: vi.fn(),
    executeImport: vi.fn(),
  },
}));

function makeItem(over: Partial<DiscoveredItem> = {}): DiscoveredItem {
  return {
    absolutePath: 'd:/demo/toolA/rules/a.md',
    relativePath: 'a.md',
    size: 100,
    modified: '2026-10-01T00:00:00.000Z',
    category: 'rule',
    hubTargetPath: 'rules/a.md',
    conflict: 'none',
    tool: 'trae-cn',
    ...over,
  };
}

function makeInventory(items: DiscoveredItem[]): ToolInventory[] {
  return [
    {
      toolName: 'trae-cn',
      displayName: 'TRAE CN',
      installed: true,
      configDir: 'd:/demo/toolA',
      items,
    },
  ];
}

function makeResult(): ImportResult {
  return {
    success: true,
    created: 1,
    merged: 0,
    overwritten: 0,
    skipped: 1,
    errors: 0,
    items: [
      { tool: 'trae-cn', hubTargetPath: 'rules/a.md', status: 'created' },
      { tool: 'trae-cn', hubTargetPath: 'rules/b.md', status: 'skipped' },
    ],
  };
}

function renderPage(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <Import />
    </QueryClientProvider>,
  );
}

/** Step 1 → Step 2 */
async function goToStep2(): Promise<void> {
  await screen.findByText(/共发现 2 个文件/);
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
}

beforeEach(() => {
  vi.mocked(api.scanTools).mockReset();
  vi.mocked(api.executeImport).mockReset();
  vi.mocked(api.executeImport).mockResolvedValue(makeResult());
});

describe('Import 无冲突确认屏', () => {
  it('Step 2 无冲突时不再出现一键直达的「开始收藏」，只有「下一步」', async () => {
    vi.mocked(api.scanTools).mockResolvedValue({
      inventories: makeInventory([
        makeItem(),
        makeItem({ hubTargetPath: 'rules/b.md', absolutePath: 'd:/demo/toolA/rules/b.md', conflict: 'exists', existingSize: 100 }),
      ]),
    });
    renderPage();
    await goToStep2();

    expect(screen.queryByRole('button', { name: /开始收藏/ })).toBeNull();
    expect(screen.getByRole('button', { name: '下一步' })).toBeDefined();
  });

  it('「下一步」进确认屏：未点「开始收藏」前绝不落盘，且逐条预览预期动作', async () => {
    vi.mocked(api.scanTools).mockResolvedValue({
      inventories: makeInventory([
        makeItem(),
        makeItem({ hubTargetPath: 'rules/b.md', absolutePath: 'd:/demo/toolA/rules/b.md', conflict: 'exists', existingSize: 100 }),
      ]),
    });
    renderPage();
    await goToStep2();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(api.executeImport).not.toHaveBeenCalled();
    await screen.findByRole('heading', { name: '确认收藏' });
    // 预览清单：两条路径 + 预期动作（与 Step 4 结果徽标同词：新增/跳过）
    expect(screen.getByText('rules/a.md')).toBeDefined();
    expect(screen.getByText('rules/b.md')).toBeDefined();
    expect(screen.getByText('新增')).toBeDefined();
    expect(screen.getByText('跳过')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /开始收藏/ }));
    await waitFor(() => expect(api.executeImport).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.executeImport).mock.calls[0][0];
    expect(sent).toHaveLength(2);
    expect(sent.map((i) => i.hubTargetPath).sort()).toEqual(['rules/a.md', 'rules/b.md']);
  });

  it('有冲突路径不回归：「下一步」进冲突确认，并提示其余无冲突文件的处理方式', async () => {
    vi.mocked(api.scanTools).mockResolvedValue({
      inventories: makeInventory([
        makeItem({ conflict: 'differs', existingSize: 80 }),
        makeItem({ hubTargetPath: 'rules/b.md', absolutePath: 'd:/demo/toolA/rules/b.md', conflict: 'none' }),
      ]),
    });
    renderPage();
    await goToStep2();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(api.executeImport).not.toHaveBeenCalled();
    await screen.findByText(/1 个文件存在冲突/);
    expect(screen.getByText(/另有 1 个无冲突文件/)).toBeDefined();
  });
});
