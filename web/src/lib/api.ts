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
  AgentListResult,
  AgentDetailResult,
  AgentInfo,
  AgentKind,
  AgentTool,
  SkillListResult,
  SkillInfo,
  SkillFunction,
  SkillProvenance,
  SkillAssetScope,
  CriterionAsset,
  CriteriaPackTemplate,
  CriteriaPackImportResult,
  LibraryStatus,
  CurateBatchResult,
  AiClassifyConfigView,
  SaveAiClassifyConfigInput,
  AiClassifyResult,
  ArbitrationRequest,
  ArbitrationResponse,
  DiagnosisReport,
  DiagnoseEstimate,
  DoctorAssetKind,
  DoctorApplyRequest,
  DoctorApplyResponse,
  DoctorUndoResponse,
  FixDraftResponse,
  ProjectListResult,
  ProjectOpenTarget,
  WorkspacesResponse,
  UpdateWorkspacesInput,
  SwapToolCandidate,
  SwapPreview,
  SwapOverwriteDecision,
  SwapExecuteResult,
  SwapRollbackResult,
  SwapHistoryEntry,
  GithubDiscoverResult,
  GithubSkillPreview,
  GithubCurateItemInput,
  GithubCurateResult,
  GithubClassifyEstimate,
  GithubClassifyResult,
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

  // Agents（只读盘点）
  listAgents: (params?: { tool?: AgentTool; kind?: AgentKind; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.tool) qs.set('tool', params.tool);
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<AgentListResult>(`/agents${q ? `?${q}` : ''}`);
  },
  getAgent: (id: string) =>
    request<AgentDetailResult>(`/agents/${encodeURIComponent(id)}`),
  createAgent: (body: { name: string; description?: string; content: string }) =>
    request<{ agent: AgentInfo }>('/agents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAgent: (id: string, content: string) =>
    request<{ agent: AgentInfo }>(`/agents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  deleteAgent: (id: string) =>
    request<{ success: boolean }>(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Skills（分类全貌，只读 + 职能覆盖；scope 视图口径预设）
  listSkills: (params?: { scope?: SkillAssetScope | 'all'; function?: SkillFunction; provenance?: SkillProvenance; status?: LibraryStatus; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.scope) qs.set('scope', params.scope);
    if (params?.function) qs.set('function', params.function);
    if (params?.provenance) qs.set('provenance', params.provenance);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<SkillListResult>(`/skills${q ? `?${q}` : ''}`);
  },
  overrideSkillFunction: (id: string, functionCategory: SkillFunction) =>
    request<{ skill: SkillInfo }>(`/skills/${encodeURIComponent(id)}/function`, {
      method: 'PUT',
      body: JSON.stringify({ functionCategory }),
    }),
  getSkill: (id: string) =>
    request<{ skill: SkillInfo; rawContent: string }>(`/skills/${encodeURIComponent(id)}`),
  createSkill: (body: { name: string; description?: string; content: string }) =>
    request<{ skill: SkillInfo }>('/skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSkill: (id: string, content: string) =>
    request<{ skill: SkillInfo }>(`/skills/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  deleteSkill: (id: string) =>
    request<{ success: boolean }>(`/skills/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  batchSetSkillFunction: (ids: string[], functionCategory: SkillFunction) =>
    request<{ updated: SkillInfo[]; missing: string[] }>('/skills/function-batch', {
      method: 'POST',
      body: JSON.stringify({ ids, functionCategory }),
    }),
  curateSkill: (body: { id: string; name?: string }) =>
    request<{ skill: SkillInfo }>('/skills/curate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  curateSkillsBatch: (ids: string[]) =>
    request<CurateBatchResult>('/skills/curate-batch', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // Criteria 裁决准则（列表/准则包只读聚合；单条增删改复用上方 /files 接口）
  listCriteria: () =>
    request<{ criteria: CriterionAsset[] }>('/criteria'),
  listCriteriaPack: () =>
    request<{ templates: CriteriaPackTemplate[] }>('/criteria/pack'),
  importCriteriaPack: (slugs: string[]) =>
    request<CriteriaPackImportResult>('/criteria/import-pack', {
      method: 'POST',
      body: JSON.stringify({ slugs }),
    }),

  // AI 智能分类（配置 + 显式触发，结果按内容 hash 缓存）
  getAiClassifyConfig: () =>
    request<AiClassifyConfigView>('/skills/ai-classify/config'),
  saveAiClassifyConfig: (body: SaveAiClassifyConfigInput) =>
    request<AiClassifyConfigView>('/skills/ai-classify/config', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  aiClassifySkills: (ids?: string[]) =>
    request<AiClassifyResult>('/skills/ai-classify', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),

  // 冲突仲裁（advisory-only：后端只读+调模型，永不落盘；采纳由导入确认提交）
  arbitrate: (body: ArbitrationRequest) =>
    request<ArbitrationResponse>('/arbitration', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // 资产医生（advisory-only：诊断只读永不写库；修复入口在 Phase F）
  doctorDiagnose: (body: { kind: DoctorAssetKind; hubRelativePath: string }) =>
    request<DiagnosisReport>('/doctor/diagnose', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  doctorEstimate: (category: DoctorAssetKind) =>
    request<DiagnoseEstimate>(`/doctor/estimate?category=${encodeURIComponent(category)}`),

  // 医生修复链（Phase F）：草案零写库；落盘唯一入口 apply 携带用户确认内容；撤销走备份区不进 swap
  doctorFixDraft: (body: { kind: DoctorAssetKind; hubRelativePath: string; issueIndexes: number[] }) =>
    request<FixDraftResponse>('/doctor/fix-draft', { method: 'POST', body: JSON.stringify(body) }),
  doctorApply: (body: DoctorApplyRequest) =>
    request<DoctorApplyResponse>('/doctor/apply', { method: 'POST', body: JSON.stringify(body) }),
  doctorUndo: (backupRef: string) =>
    request<DoctorUndoResponse>('/doctor/undo', { method: 'POST', body: JSON.stringify({ backupRef }) }),

  // Workspaces（项目级技能工作区发现）
  getWorkspaces: () => request<WorkspacesResponse>('/workspaces'),
  updateWorkspaces: (body: UpdateWorkspacesInput) =>
    request<WorkspacesResponse>('/workspaces', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // Projects（AI-Coding 项目可视化）
  listProjects: (params?: { existingOnly?: boolean; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.existingOnly) qs.set('existingOnly', 'true');
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<ProjectListResult>(`/projects${q ? `?${q}` : ''}`);
  },
  openProject: (id: string, target: ProjectOpenTarget) =>
    request<{ ok: boolean }>(`/projects/${encodeURIComponent(id)}/open`, {
      method: 'POST',
      body: JSON.stringify({ target }),
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

  // Swap（工具热切换 enable-tool-hot-swap）
  getSwapTools: () => request<{ tools: SwapToolCandidate[] }>('/swap/tools'),
  swapPreview: (tool: string) =>
    request<SwapPreview>('/swap/preview', {
      method: 'POST',
      body: JSON.stringify({ tool }),
    }),
  swapExecute: (tool: string, previewGeneratedAt: string, overwriteDecisions: SwapOverwriteDecision[]) =>
    request<SwapExecuteResult>('/swap/execute', {
      method: 'POST',
      body: JSON.stringify({ tool, previewGeneratedAt, overwriteDecisions }),
    }),
  swapRollback: (swapId: string) =>
    request<SwapRollbackResult>('/swap/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId }),
    }),
  getSwapHistory: () => request<{ history: SwapHistoryEntry[] }>('/swap/history'),

  // GitHub 技能发现（add-github-skill-source：发现/预览/入库/打标，均显式手动触发）
  github: {
    discover: (source: string, force = false) =>
      request<GithubDiscoverResult>('/github/discover', {
        method: 'POST',
        body: JSON.stringify({ source, force }),
      }),
    preview: (body: { repo: string; sha: string; skillPath: string }) =>
      request<GithubSkillPreview>('/github/preview', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    curate: (body: { repo: string; sha: string; items: GithubCurateItemInput[] }) =>
      request<GithubCurateResult>('/github/curate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    classifyEstimate: (body: { repo: string; sha: string; skillPaths: string[] }) =>
      request<GithubClassifyEstimate>('/github/classify/estimate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    classify: (body: { repo: string; sha: string; skillPaths: string[] }) =>
      request<GithubClassifyResult>('/github/classify', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
};
