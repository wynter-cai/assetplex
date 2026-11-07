/**
 * 导入向导无冲突路径确认屏测试（queued-import-preview）
 *
 * 契约：Step 2 无冲突时不得一键直接落盘——先进 Step 3 预览"将导入哪些条目、
 * 各自预期动作（新增/跳过）"，用户显式点「开始收藏」才执行；
 * 有冲突路径（Step 2「下一步」→ 冲突确认）行为不回归。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Import from './Import';
import { api } from '@/lib/api';
import type { DiscoveredItem, ImportResult, ToolInventory } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    scanTools: vi.fn(),
    executeImport: vi.fn(),
    // FileItem 的类别徽章走声明源（add-memory-category T10）
    getAssetCategories: vi.fn(),
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
    binary: false,
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

function renderPage(): ReturnType<typeof render> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Import />
    </QueryClientProvider>,
  );
}

/** Step 1 → Step 2（默认库存 2 项，单条目用例传 1） */
async function goToStep2(expected = 2): Promise<void> {
  await screen.findByText(new RegExp(`共发现 ${expected} 个文件`));
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
}

beforeEach(() => {
  vi.mocked(api.scanTools).mockReset();
  vi.mocked(api.executeImport).mockReset();
  vi.mocked(api.executeImport).mockResolvedValue(makeResult());
  vi.mocked(api.getAssetCategories).mockReset();
  vi.mocked(api.getAssetCategories).mockRejectedValue(new Error('清单接口不可用'));
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

  it('「下一步」进确认屏：未点「开始收藏」前绝不落盘，按状态分组预览', async () => {
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
    // 无冲突时只有两组，且默认折叠：路径不在 DOM
    expect(screen.queryByTestId('confirm-group-conflict')).toBeNull();
    expect(screen.queryByText('rules/a.md')).toBeNull();
    expect(screen.queryByText('rules/b.md')).toBeNull();

    // 展开后可逐条预览，动作词与 Step 4 一致
    fireEvent.click(screen.getByRole('button', { name: /新增文件（1）/ }));
    expect(screen.getByText('rules/a.md')).toBeDefined();
    expect(screen.getByText('将写入我的库')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /库内已存在（1）/ }));
    expect(screen.getByText('rules/b.md')).toBeDefined();
    expect(screen.getByText('已存在，跳过不覆盖')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /开始收藏/ }));
    await waitFor(() => expect(api.executeImport).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.executeImport).mock.calls[0][0];
    expect(sent).toHaveLength(2);
    expect(sent.map((i) => i.hubTargetPath).sort()).toEqual(['rules/a.md', 'rules/b.md']);
  });

  it('三组标题与计数：冲突组默认展开，其余折叠，计数之和等于选中数', async () => {
    vi.mocked(api.scanTools).mockResolvedValue({
      inventories: makeInventory([
        makeItem({ conflict: 'differs', existingSize: 80 }),
        makeItem({ hubTargetPath: 'rules/b.md', absolutePath: 'd:/demo/toolA/rules/b.md', conflict: 'exists', existingSize: 100 }),
        makeItem({ hubTargetPath: 'rules/c.md', absolutePath: 'd:/demo/toolA/rules/c.md', conflict: 'none' }),
      ]),
    });
    renderPage();
    await goToStep2(3);
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(api.executeImport).not.toHaveBeenCalled();
    await screen.findByRole('heading', { name: '确认收藏' });

    const conflictGroup = screen.getByTestId('confirm-group-conflict');
    expect(within(conflictGroup).getByRole('button', { name: /内容冲突（1）/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /库内已存在（1）/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /新增文件（1）/ })).toBeDefined();

    // 冲突组默认展开：冲突项直接可见（含策略选择）
    expect(screen.getByText('rules/a.md')).toBeDefined();
    expect(screen.getByRole('button', { name: '智能合并' })).toBeDefined();
    // 另两组折叠：条目不渲染
    expect(screen.queryByText('rules/b.md')).toBeNull();
    expect(screen.queryByText('rules/c.md')).toBeNull();
  });

  it('某种状态为空时该组不渲染（不出现 0 计数空组）', async () => {
    vi.mocked(api.scanTools).mockResolvedValue({
      inventories: makeInventory([
        makeItem({ conflict: 'differs', existingSize: 80 }),
        makeItem({ hubTargetPath: 'rules/b.md', absolutePath: 'd:/demo/toolA/rules/b.md', conflict: 'exists', existingSize: 100 }),
      ]),
    });
    renderPage();
    await goToStep2();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    await screen.findByRole('heading', { name: '确认收藏' });
    expect(screen.queryByTestId('confirm-group-new')).toBeNull();
    expect(screen.queryByRole('button', { name: /新增文件/ })).toBeNull();
  });

  it('二进制条目默认不勾选，全选不勾选，手动可勾选', async () => {
    vi.mocked(api.scanTools).mockResolvedValue({
      inventories: makeInventory([
        makeItem(),
        makeItem({
          hubTargetPath: 'skills/demo/_icon.png',
          absolutePath: 'd:/demo/toolA/skills/demo/_icon.png',
          category: 'skill',
          binary: true,
        }),
      ]),
    });
    const { container } = renderPage();
    await goToStep2();

    const boxes = (): HTMLInputElement[] =>
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    await waitFor(() => expect(boxes()).toHaveLength(2));

    // 进 Step 2 的自动全选：文本选中、图标不选
    expect(boxes()[0].checked).toBe(true);
    expect(boxes()[1].checked).toBe(false);

    // 先取消全选，再全选：二进制仍不勾选
    fireEvent.click(screen.getByRole('button', { name: '取消全选' }));
    expect(boxes().every((b) => !b.checked)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '全选' }));
    expect(boxes()[0].checked).toBe(true);
    expect(boxes()[1].checked).toBe(false);

    // 手动可勾选
    fireEvent.click(boxes()[1]);
    expect(boxes()[1].checked).toBe(true);
  });

  it('二进制冲突默认跳过、不提供智能合并，请求体带 strategy=skip', async () => {
    vi.mocked(api.scanTools).mockResolvedValue({
      inventories: makeInventory([
        {
          ...makeItem({
            hubTargetPath: 'skills/demo/_icon.png',
            absolutePath: 'd:/demo/toolA/skills/demo/_icon.png',
            category: 'skill',
            conflict: 'differs',
            existingSize: 80,
            binary: true,
          }),
        },
      ]),
    });
    renderPage();
    await goToStep2(1);

    // 二进制默认不勾选，手动勾上才能进入确认屏
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    await screen.findByRole('heading', { name: '确认收藏' });
    expect(screen.queryByRole('button', { name: '智能合并' })).toBeNull();
    expect(screen.getByRole('button', { name: '跳过' })).toBeDefined();
    expect(screen.getByText(/二进制文件无法逐行合并/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /开始收藏/ }));
    await waitFor(() => expect(api.executeImport).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.executeImport).mock.calls[0][0];
    expect(sent[0].strategy).toBe('skip');
    expect(sent[0].binary).toBe(true);
  });
});