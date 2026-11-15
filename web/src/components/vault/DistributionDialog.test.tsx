import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DistributionDialog } from './DistributionDialog';
import { makeDistributionEntry } from '@/lib/test-factories';
import { api } from '@/lib/api';
import { useToastStore } from '@/lib/toast-store';
import type { Asset, AssetDistributionInfo, AssetWriteCategorySupport, AssetWriteToolCandidate, ToolStatus } from '@/types/api';

/**
 * 分发管理弹窗的状态来源
 *
 * spec: asset-distribution-truth Scenario 1/3/8（状态来自分发索引；缺失条目不编造状态；
 *   `pending` 全站统一叫「待同步」）
 * 关联: fix-trust-and-consistency tasks I2
 *   + add-memory-category T12（不支持记忆的工具显示原因并禁用，memory-visible Scenario 6）
 */

const asset: Asset = {
  id: 'rules/safety.md',
  name: '示例规则',
  category: 'rule',
  hubPath: 'rules/safety.md',
  source: 'manual',
  lastModifiedAt: '2026-10-01T00:00:00.000Z',
  size: 100,
  distributions: [],
};

function tool(name: string, installed: boolean): ToolStatus {
  return { name, installed, configDirExists: installed, configDir: 'demo' };
}

/** 六类支持矩阵：memory 之外的类别一律支持，memory 由参数决定 */
function candidate(name: string, memory: AssetWriteCategorySupport): AssetWriteToolCandidate {
  const supported: AssetWriteCategorySupport = { supported: true };
  return {
    name,
    displayName: name,
    installed: true,
    projectLevel: false,
    supportMatrix: {
      identity: supported,
      rule: supported,
      skill: supported,
      mcp: supported,
      agent: supported,
      memory,
    },
  };
}

interface DialogOptions {
  asset?: Asset;
  /** 支持矩阵候选；不传 = 矩阵拿不到（接口失败/未落地） */
  distributionTools?: AssetWriteToolCandidate[];
  onSync?: () => void;
}

function renderDialog(distributions: AssetDistributionInfo[], options: DialogOptions = {}): QueryClient {
  vi.spyOn(api, 'getTools').mockResolvedValue({
    tools: [tool('trae-cn', true), tool('codex', true), tool('ghost', false)],
  });
  vi.spyOn(api, 'getDistributionTools').mockResolvedValue({ tools: options.distributionTools ?? [] });
  vi.spyOn(api, 'getAssetCategories').mockResolvedValue({ categories: [], declaredAt: '2026-10-29' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DistributionDialog
        asset={options.asset ?? asset}
        open
        onOpenChange={vi.fn()}
        distributions={distributions}
        onSync={options.onSync}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

afterEach(() => {
  vi.restoreAllMocks();
  useToastStore.getState().reset();
});

describe('DistributionDialog 状态来源', () => {
  it('索引里的真值决定每个工具的状态文案', async () => {
    renderDialog([
      makeDistributionEntry({ toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced' }),
      makeDistributionEntry({ toolId: 'codex', toolName: 'Codex', status: 'pending' }),
    ]);

    expect(await screen.findByText('已同步')).toBeInTheDocument();
    // pending 统一叫「待同步」，不再出现旧文案「待更新」
    expect(screen.getByText('待同步')).toBeInTheDocument();
    expect(screen.queryByText('待更新')).not.toBeInTheDocument();
  });

  it('索引里没有条目的工具不编造状态，也不写「未同步」', async () => {
    renderDialog([makeDistributionEntry({ toolId: 'trae-cn', status: 'synced' })]);

    await screen.findByText('已同步');
    expect(screen.getByText('状态未知')).toBeInTheDocument();
    expect(screen.queryByText('未同步')).not.toBeInTheDocument();
  });

  it('未安装的工具照实说明，不靠索引', async () => {
    renderDialog([]);

    expect(await screen.findAllByText('未安装')).toHaveLength(1);
    expect(screen.queryByText('未分发')).not.toBeInTheDocument();
  });
});

/**
 * spec: memory-visible Scenario 6（同步能力如实呈现）
 * 关联: add-memory-category tasks T12
 */
describe('DistributionDialog 类别支持矩阵', () => {
  const memoryAsset: Asset = {
    ...asset,
    id: 'memory/session.md',
    name: '会话记忆',
    category: 'memory',
    hubPath: 'memory/session.md',
  };

  it('不支持记忆的工具：该行说明具体原因并禁用开关', async () => {
    renderDialog([], {
      asset: memoryAsset,
      distributionTools: [
        candidate('trae-cn', { supported: true }),
        candidate('codex', { supported: false, reason: '此工具不支持memory类别，已跳过' }),
      ],
    });

    expect(await screen.findByText('此工具不支持记忆类别，无法同步')).toBeInTheDocument();
    const switches = screen.getAllByRole('switch');
    // 行序 = tools 接口顺序（trae-cn / codex / ghost）
    expect(switches[0]).not.toBeDisabled();
    expect(switches[1]).toBeDisabled();
  });

  it('矩阵拿不到时不编造「不支持」，只按安装状态禁用', async () => {
    renderDialog([], { asset: memoryAsset, distributionTools: [] });

    await screen.findByText('会话记忆');
    expect(screen.queryByText(/不支持记忆类别/)).not.toBeInTheDocument();
    const switches = await screen.findAllByRole('switch');
    expect(switches[0]).not.toBeDisabled();
    expect(switches[1]).not.toBeDisabled();
  });
});

/**
 * 「立即同步」真正执行分发（B9 ②）
 *
 * 旧实现只关闭弹窗，开关状态与文案都停在原始工具 code 上。
 */
describe('DistributionDialog 立即同步', () => {
  it('工具名用中文显示，未收录的保留原始 id', async () => {
    renderDialog([]);

    expect(await screen.findByText('TRAE 中国版')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Codex')).toBeInTheDocument();
    expect(screen.getByText('ghost')).toBeInTheDocument();
  });

  it('只把开启且已安装的工具交给 runSync，并请求备份与刷新索引', async () => {
    const onSync = vi.fn();
    const runSync = vi.spyOn(api, 'runSync').mockResolvedValue({
      results: [
        { tool: 'trae-cn', success: true, itemCount: 2, skippedCount: 0, errors: [], warnings: [], durationMs: 3 },
      ],
    });
    const queryClient = renderDialog(
      [
        makeDistributionEntry({ toolId: 'trae-cn', status: 'synced' }),
        makeDistributionEntry({ toolId: 'codex', status: 'synced' }),
        // 未安装的工具即便索引说已同步也不能进目标
        makeDistributionEntry({ toolId: 'ghost', status: 'synced' }),
      ],
      { onSync },
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    // 工具行落地后再点：加载中目标未知，按钮按设计是禁用的
    await screen.findByText('TRAE 中国版');
    fireEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    await waitFor(() =>
      expect(runSync).toHaveBeenCalledWith(['trae-cn', 'codex'], false, { backup: true }),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['distributions'] }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['assets'] });
    expect(onSync).toHaveBeenCalled();

    const toast = useToastStore.getState().toasts[0];
    expect(toast?.variant).toBe('success');
    expect(toast?.title).toBe('同步完成');
    expect(toast?.description).toContain('2');
  });

  it('结果就地展示：失败项可只重试失败工具（refactor-asset-pipeline T10）', async () => {
    const runSync = vi
      .spyOn(api, 'runSync')
      .mockResolvedValueOnce({
        results: [
          { tool: 'trae-cn', success: true, itemCount: 1, skippedCount: 0, errors: [], warnings: [], durationMs: 3 },
          { tool: 'codex', success: false, itemCount: 0, skippedCount: 0, errors: ['目标目录不可写'], warnings: [], durationMs: 2 },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          { tool: 'codex', success: true, itemCount: 1, skippedCount: 0, errors: [], warnings: [], durationMs: 2 },
        ],
      });
    renderDialog([
      makeDistributionEntry({ toolId: 'trae-cn', status: 'synced' }),
      makeDistributionEntry({ toolId: 'codex', status: 'synced' }),
    ]);

    await screen.findByText('TRAE 中国版');
    fireEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    expect(await screen.findByText(/失败：目标目录不可写/)).toBeInTheDocument();
    expect(screen.getByText(/已写入 1 项/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /重试失败项（1）/ }));
    await waitFor(() => expect(runSync).toHaveBeenLastCalledWith(['codex'], false, { backup: true }));
    await waitFor(() => expect(screen.queryByText(/失败：目标目录不可写/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /重试失败项/ })).not.toBeInTheDocument();
  });

  it('类别不支持的工具不进同步目标', async () => {    const runSync = vi.spyOn(api, 'runSync').mockResolvedValue({ results: [] });
    renderDialog(
      [
        makeDistributionEntry({ toolId: 'trae-cn', status: 'synced' }),
        makeDistributionEntry({ toolId: 'codex', status: 'synced' }),
      ],
      {
        asset: { ...asset, id: 'memory/session.md', name: '会话记忆', category: 'memory', hubPath: 'memory/session.md' },
        distributionTools: [
          candidate('trae-cn', { supported: true }),
          candidate('codex', { supported: false, reason: '此工具不支持memory类别，已跳过' }),
        ],
      },
    );

    await screen.findByText('TRAE 中国版');
    fireEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    await waitFor(() =>
      expect(runSync).toHaveBeenCalledWith(['trae-cn'], false, { backup: true }),
    );
  });

  it('没有可同步目标时禁用按钮，不发空请求', async () => {
    const runSync = vi.spyOn(api, 'runSync').mockResolvedValue({ results: [] });
    renderDialog([]);

    expect(await screen.findByText(/没有可同步的工具/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /立即同步/ });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(runSync).not.toHaveBeenCalled();
  });

  it('同步失败时提示具体原因', async () => {
    vi.spyOn(api, 'runSync').mockRejectedValue(new Error('写入失败：目标目录不可写'));
    renderDialog([makeDistributionEntry({ toolId: 'trae-cn', status: 'synced' })]);

    await screen.findByText('TRAE 中国版');
    fireEvent.click(screen.getByRole('button', { name: /立即同步/ }));

    await waitFor(() => expect(useToastStore.getState().toasts[0]?.variant).toBe('error'));
    expect(useToastStore.getState().toasts[0]?.description).toContain('目标目录不可写');
  });
});
