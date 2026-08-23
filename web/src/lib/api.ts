/**
 * API 请求封装
 */

import type {
  ToolStatus,
  SyncPlan,
  SyncResult,
  HubFileInfo,
  HubHealth,
  HubConfig,
  FileContent,
  ToolInventory,
  ImportItem,
  ImportResult,
  DiffContent,
  OverviewData,
  Asset,
  AssetDetail,
  AssetListResult,
  FrontendCategory,
} from '@/types/api';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Hub
  getHubConfig: () => request<HubConfig>('/hub/config'),
  saveHubConfig: (config: HubConfig) =>
    request<{ success: boolean }>('/hub/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getHubHealth: () => request<HubHealth>('/hub/health'),
  getOverview: () => request<OverviewData>('/hub/overview'),

  // Tools
  getTools: () => request<{ tools: ToolStatus[] }>('/tools'),
  getTool: (name: string) => request<ToolStatus>(`/tools/${name}`),
  toggleTool: (name: string, enabled?: boolean) =>
    request<{ success: boolean; enabled: boolean }>(`/tools/${name}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  detectTool: (name: string) =>
    request<ToolStatus>(`/tools/${name}/detect`, { method: 'POST' }),

  // Sync
  getSyncPlan: (tools?: string[]) => {
    const qs = tools && tools.length ? `?${tools.map((t) => `tool=${encodeURIComponent(t)}`).join('&')}` : '';
    return request<{ plans: SyncPlan[] }>(`/sync/plan${qs}`);
  },
  runSync: (tools?: string[], dryRun = false) => {
    const toolQs = tools && tools.length ? tools.map((t) => `tool=${encodeURIComponent(t)}`).join('&') : '';
    const qs = [toolQs, dryRun ? 'dryRun=true' : ''].filter(Boolean).join('&');
    return request<{ results: SyncResult[] }>(`/sync/run${qs ? `?${qs}` : ''}`, { method: 'POST' });
  },
  reverseImport: (tools?: string[]) => {
    const qs = tools && tools.length ? `?${tools.map((t) => `tool=${encodeURIComponent(t)}`).join('&')}` : '';
    return request<{ results: unknown[] }>(`/sync/reverse-import${qs}`, { method: 'POST' });
  },
  getSyncHistory: () =>
    request<{ history: Array<{ timestamp: string; tool?: string; dryRun: boolean; results: unknown[] }> }>(
      '/sync/history',
    ),

  // Import Wizard
  scanTools: () => request<{ inventories: ToolInventory[] }>('/sync/scan'),
  executeImport: (items: ImportItem[]) =>
    request<ImportResult>('/sync/execute-import', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  getDiff: (sourcePath: string, hubTargetPath: string) =>
    request<DiffContent>(
      `/sync/diff?sourcePath=${encodeURIComponent(sourcePath)}&hubTargetPath=${encodeURIComponent(hubTargetPath)}`,
    ),

  // Files
  listFiles: (category?: string) =>
    request<{ files: HubFileInfo[] }>(`/files${category ? `?category=${category}` : ''}`),
  readFile: (path: string) =>
    request<FileContent>(`/files/${path}`),
  writeFile: (path: string, content: string) =>
    request<{ success: boolean }>(`/files/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  createFile: (path: string, content: string) =>
    request<{ success: boolean }>(`/files`, {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    }),
  deleteFile: (path: string) =>
    request<{ success: boolean }>(`/files/${path}`, { method: 'DELETE' }),

  // Assets
  listAssets: (params?: { category?: FrontendCategory; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<AssetListResult>(`/assets${q ? `?${q}` : ''}`);
  },
  getAsset: (id: string) =>
    request<AssetDetail>(`/assets/${encodeURIComponent(id)}`),
  createAsset: (body: { name: string; category: FrontendCategory; content: string }) =>
    request<{ asset: Asset }>('/assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAsset: (id: string, content: string) =>
    request<{ asset: Asset }>(`/assets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // Tool detail (connection detail)
  getToolDetail: (toolName: string) =>
    request<{
      tool: ToolStatus;
      discovered?: {
        identities: Array<{ path: string; size: number }>;
        rules: Array<{ path: string; size: number }>;
        skills: Array<{ path: string; size: number }>;
        mcps: Array<{ path: string; size: number }>;
      };
    }>(`/tools/${encodeURIComponent(toolName)}/detail`),
};
