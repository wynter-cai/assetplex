/**
 * 连接页测试（fix-ui-trust-gaps T7）
 *
 * spec: connections-controls.spec.md
 * 启用开关接线 toggle（失败回退+toast）、重新检测、重新扫描、?tool 深链、导入走 SPA 路由。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Connections from './Connections';
import { api } from '@/lib/api';
import type { ToolStatus } from '@/types/api';
import { Toaster } from '@/components/ui/toast';
import { useToastStore } from '@/lib/toast-store';

vi.mock('@/lib/api', () => ({
  api: {
    getTools: vi.fn(),
    getToolDetail: vi.fn(),
    listAssets: vi.fn(),
    toggleTool: vi.fn(),
    detectTool: vi.fn(),
  },
}));

function makeTool(over: Partial<ToolStatus>): ToolStatus {
  return {
    name: 'unknown',
    installed: true,
    configDirExists: true,
    configDir: `/tools/${over.name ?? 'x'}`,
    enabled: false,
    version: '1.0.0',
    ...over,
  };
}

const TOOLS: ToolStatus[] = [
  makeTool({ name: 'trae-cn', enabled: true, version: '3.2.1' }),
  makeTool({ name: 'workbuddy', enabled: true }),
  makeTool({ name: 'codex', installed: false, configDirExists: false, enabled: undefined, version: undefined }),
];

function detailFor(tool: ToolStatus, discovered = { identities: [], rules: [], skills: [], mcps: [] }) {
  return Promise.resolve({ tool, discovered });
}

function renderConnections(initialPath = '/connections'): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/connections" element={<Connections />} />
          <Route path="/import" element={<div>IMPORT PAGE MARKER</div>} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useToastStore.getState().reset();
  vi.clearAllMocks();
  vi.mocked(api.getTools).mockResolvedValue({ tools: TOOLS });
  vi.mocked(api.listAssets).mockResolvedValue({ items: [], total: 0 } as never);
  vi.mocked(api.getToolDetail).mockImplementation((name: string) =>
    detailFor(TOOLS.find((t) => t.name === name) ?? TOOLS[0]),
  );
  vi.mocked(api.toggleTool).mockResolvedValue({ success: true, enabled: true });
  vi.mocked(api.detectTool).mockImplementation((name: string) =>
    Promise.resolve(TOOLS.find((t) => t.name === name) ?? TOOLS[0]),
  );
});

describe('Connections 页面', () => {
  it('?tool=codex 深链直接选中对应工具', async () => {
    renderConnections('/connections?tool=codex');
    // 等待右侧详情面板加载完成（重新检测按钮仅详情面板有）
    expect(await screen.findByRole('button', { name: /重新检测/ })).toBeInTheDocument();
    expect(screen.getAllByText('OpenAI Codex').length).toBeGreaterThanOrEqual(2);
    // 未安装工具的开关不可用
    const sw = screen.getByRole('switch');
    expect(sw).toBeDisabled();
  });

  it('?tool 参数无效时回退选中第一个工具', async () => {
    renderConnections('/connections?tool=ghost');
    await screen.findByRole('button', { name: /重新检测/ });
    // 第一个工具 trae-cn enabled=true，开关应为开启态
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('点击启用开关调用 toggle，成功后 toast 确认', async () => {
    // workbuddy 当前 enabled=true；点击关闭同步
    renderConnections('/connections?tool=workbuddy');
    await screen.findByRole('button', { name: /重新检测/ });
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      fireEvent.click(sw);
    });

    expect(api.toggleTool).toHaveBeenCalledWith('workbuddy', false);
    await waitFor(() => {
      expect(screen.getByText(/已关闭.*WorkBuddy|WorkBuddy.*已关闭/)).toBeInTheDocument();
    });
  });

  it('toggle 失败时提示错误且开关回退为实际状态', async () => {
    vi.mocked(api.toggleTool).mockRejectedValueOnce(new Error('HTTP 500'));
    renderConnections('/connections?tool=workbuddy');
    await screen.findByRole('button', { name: /重新检测/ });
    const sw = screen.getByRole('switch');

    await act(async () => {
      fireEvent.click(sw);
    });

    await waitFor(() => {
      expect(screen.getByText(/操作失败/)).toBeInTheDocument();
    });
    // 数据被 invalidate 后重新拉取，开关回到服务端状态 true
    await waitFor(() => {
      expect(sw).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('点击重新检测调用 detect 接口并提示结果', async () => {
    renderConnections('/connections?tool=workbuddy');
    const btn = await screen.findByRole('button', { name: /重新检测/ });

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(api.detectTool).toHaveBeenCalledWith('workbuddy');
    await waitFor(() => {
      expect(screen.getByText(/已重新检测/)).toBeInTheDocument();
    });
  });

  it('底部按钮文案为「重新扫描」，点击后重新请求工具列表', async () => {
    renderConnections('/connections');
    await screen.findByText('TRAE 中国版');
    const before = vi.mocked(api.getTools).mock.calls.length;

    const btn = screen.getByRole('button', { name: /重新扫描/ });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(vi.mocked(api.getTools).mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('有可导入资产时，导入按钮走 SPA 路由（不整页跳转）', async () => {
    vi.mocked(api.getToolDetail).mockImplementation((name: string) =>
      Promise.resolve({
        tool: TOOLS.find((t) => t.name === name) ?? TOOLS[0],
        discovered: {
          identities: [{ path: `/x/profile.md`, size: 1234 }],
          rules: [],
          skills: [],
          mcps: [],
        },
      }),
    );
    renderConnections('/connections?tool=trae-cn');
    const link = await screen.findByRole('link', { name: /导入到 Hub/ });
    await act(async () => {
      fireEvent.click(link);
    });
    await waitFor(() => {
      expect(screen.getByText('IMPORT PAGE MARKER')).toBeInTheDocument();
    });
  });
});
