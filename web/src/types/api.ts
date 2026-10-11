/**
 * API 响应类型定义（与后端 src/core/types.ts 对齐）
 */

export interface ToolStatus {
  name: string;
  installed: boolean;
  configDirExists: boolean;
  version?: string;
  configDir: string;
  error?: string;
  enabled?: boolean;
}

export interface HubItem {
  type: string;
  relativePath: string;
  absolutePath: string;
  content?: string;
}

export interface SyncTarget {
  tool: string;
  targetPath: string;
  strategy: string;
  isDirectory: boolean;
}

export interface SyncPlanItem {
  item: HubItem;
  target: SyncTarget;
  action: string;
  reason?: string;
  /** 冲突预警（目标路径已有非 symlink 同名文件） */
  warning?: string;
}

export interface SyncPlan {
  tool: string;
  toolInstalled: boolean;
  items: SyncPlanItem[];
}

export interface SyncResult {
  tool: string;
  success: boolean;
  itemCount: number;
  skippedCount: number;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

export interface HubFileInfo {
  relativePath: string;
  absolutePath: string;
  size: number;
  modified: string;
  isDirectory: boolean;
}

export interface HubHealth {
  hubRoot: string;
  hubExists: boolean;
  hubTomlExists: boolean;
  fileCountByCategory: Record<string, number>;
  totalFiles: number;
}

export interface HubConfig {
  hub: {
    version: string;
    defaultSyncStrategy: string;
    backupDir: string;
    autoWatch: boolean;
    backupKeepCount: number;
  };
  identity: {
    profileAutoLearn: boolean;
    learnSources: string[];
    learnIntervalHours: number;
    learnMaxFacts: number;
  };
  tools: Record<string, Record<string, unknown>>;
  marketplace: {
    enabled: boolean;
    sources: string[];
    cacheDir: string;
    cacheTtlHours: number;
  };
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  modified: string;
}

// ========== 智能导入向导类型 ==========

export type DiscoveredCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'preference';
export type ConflictStatus = 'none' | 'exists' | 'differs';
export type ConflictStrategy = 'merge' | 'overwrite' | 'skip';

export interface DiscoveredItem {
  absolutePath: string;
  relativePath: string;
  size: number;
  modified: string;
  category: DiscoveredCategory;
  hubTargetPath: string;
  conflict: ConflictStatus;
  existingSize?: number;
  tool: string;
}

export interface ToolInventory {
  toolName: string;
  displayName: string;
  installed: boolean;
  configDir: string;
  items: DiscoveredItem[];
}

export interface ImportItem {
  tool: string;
  absolutePath: string;
  hubTargetPath: string;
  category: DiscoveredCategory;
  conflict: ConflictStatus;
  strategy?: ConflictStrategy;
}

export interface ImportResult {
  success: boolean;
  created: number;
  merged: number;
  overwritten: number;
  skipped: number;
  errors: number;
  items: Array<{
    tool: string;
    hubTargetPath: string;
    status: 'created' | 'merged' | 'overwritten' | 'skipped' | 'error';
    message?: string;
  }>;
}

// ========== Diff 预览类型 ==========

export interface DiffContent {
  sourceContent: string;
  hubContent: string | null;
  sourcePath: string;
  hubTargetPath: string;
}

// ========== 首页 Overview 类型 ==========

export type FrontendCategory = 'identity' | 'skill' | 'rule' | 'mcp';
/** 首页资产快照的类别口径：含走专用接口的智能体（external 类别） */
export type OverviewCategory = FrontendCategory | 'agent';
export type ConnectionStatus = 'synced' | 'pending' | 'not_connected' | 'not_installed';

export interface ConnectionInfo {
  toolId: string;
  toolName: string;
  status: ConnectionStatus;
  assetCount: number;
  pendingCount: number;
  lastSyncedAt?: string;
}

export interface ActivityItem {
  id: string;
  type: 'import' | 'sync' | 'edit' | 'create';
  description: string;
  occurredAt: string;
}

export interface OverviewData {
  assetStats: Record<OverviewCategory, number>;
  connections: ConnectionInfo[];
  recentActivities: ActivityItem[];
  hubInitialized: boolean;
  healthScore: number;
}

// ========== 资产库类型 ==========

export type AssetSource = 'trae' | 'workbuddy' | 'claude' | 'codex' | 'qoder' | 'manual' | 'merged';
export type AssetSyncStatus = 'synced' | 'pending' | 'conflict' | 'not_enabled' | 'not_installed';

export interface AssetDistribution {
  toolId: string;
  toolName: string;
  status: AssetSyncStatus;
  toolPath?: string;
  lastSyncedAt?: string;
}

export interface Asset {
  id: string;
  name: string;
  category: FrontendCategory;
  hubPath: string;
  source: AssetSource;
  lastModifiedAt: string;
  size: number;
  distributions: AssetDistribution[];
}

export interface AssetDetail extends Asset {
  content: string;
}

export interface AssetListResult {
  items: Asset[];
  total: number;
}

// ========== 智能体只读盘点类型 ==========

export type AgentTool = 'trae' | 'codebuddy' | 'claude' | 'codex' | 'hub';
export type AgentKind =
  | 'custom-subagent'
  | 'expert'
  | 'builtin-persona'
  | 'plugin-agent';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tool: AgentTool;
  kind: AgentKind;
  sourcePath: string;
  lastModifiedAt: string | null;
  userCreated: boolean;
  extra?: Record<string, string>;
}

export interface AgentListResult {
  items: AgentInfo[];
  total: number;
  countByKind: Record<AgentKind, number>;
  countByTool: Record<AgentTool, number>;
}

export interface AgentDetailResult {
  agent: AgentInfo;
  rawContent: string;
}

// ========== 技能分类全貌类型 ==========

export type SkillFunction =
  | 'coding'
  | 'writing'
  | 'browser'
  | 'data'
  | 'devops'
  | 'ai-integration'
  | 'design'
  | 'workflow'
  | 'other';

/** 纯出处四类（MECE：按这个技能最初从哪来，互斥且穷尽） */
export type SkillProvenance = 'self' | 'marketplace' | 'plugin' | 'builtin';

/** 库状态（管理轴，独立于出处）：in=已入我的库，out=未入库 */
export type LibraryStatus = 'in' | 'out';

/** 分类来源：手动覆盖 / AI 分类 / 关键词规则兜底 */
export type SkillFunctionSource = 'manual' | 'ai' | 'keyword';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  functionCategory: SkillFunction;
  /** 纯出处（这个技能最初从哪来，替代旧 origin 六值对外语义） */
  provenance: SkillProvenance;
  /** 是否已入我的库（替代旧 origin=vault 的对外表达） */
  inLibrary: boolean;
  tool: string;
  /** 物理主文件路径（contract refactor-skill-origin-taxonomy：替代旧 sourcePath） */
  path: string;
  version: string;
  functionSource: SkillFunctionSource;
  /** 收藏溯源（仅库内技能）：内部格式 `${origin}:${sourcePath}`；自建技能无此字段 */
  source?: string;
  /** 所属项目名（工作区目录名）；仅项目技能有值 */
  workspaceName?: string;
  /** 所属项目工作区绝对路径；仅项目技能有值 */
  workspacePath?: string;
  /** 副本数（不含主本；contract: variants: number，不再透传路径数组） */
  variants: number;
}

/** AI 分类配置视图（apiKey 脱敏，明文永不回传） */
export interface AiClassifyConfigView {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

/** 保存 AI 分类配置入参：apiKey 缺省表示保留已存值 */
export interface SaveAiClassifyConfigInput {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/** AI 分类单条失败明细 */
export interface AiClassifyFailure {
  id: string;
  name: string;
  error: string;
}

/** AI 分类结果：部分成功语义 */
export interface AiClassifyResult {
  classified: SkillInfo[];
  /** 其中直接命中内容缓存、未实际调用 LLM 的条数 */
  cacheHits: number;
  /** 已手动覆盖被跳过的技能 */
  skipped: Array<{ id: string; name: string }>;
  failed: AiClassifyFailure[];
}

export interface SkillListResult {
  items: SkillInfo[];
  total: number;
  countByFunction: Record<SkillFunction, number>;
  /** 出处计数（随 status/search 过滤联动） */
  countByProvenance: Record<SkillProvenance, number>;
  /** 库状态计数：我的库 / 未入库（随 provenance/search 联动） */
  countByStatus: { in: number; out: number };
}

/** 批量收藏单条失败明细 */
export interface CurateBatchFailure {
  id: string;
  name: string;
  error: string;
}

/** 批量收藏结果：部分成功语义 */
export interface CurateBatchResult {
  created: SkillInfo[];
  failed: CurateBatchFailure[];
}

// ========== 工作区发现（项目级技能） ==========

export interface WorkspacesConfig {
  /** 从 TRAE storage.json 自动发现 */
  autoDiscover: boolean;
  /** 手动工作区根绝对路径 */
  roots: string[];
  /** 被排除的自动发现工作区绝对路径 */
  disabledWorkspaces: string[];
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  source: 'auto' | 'manual';
  skillsDirExists: boolean;
  skillCount: number;
  disabled?: boolean;
}

export interface WorkspacesResponse {
  config: WorkspacesConfig;
  workspaces: WorkspaceInfo[];
  truncated: boolean;
  maxWorkspaces: number;
  errors: string[];
}

/** PUT 合并语义：所有字段可选，缺省保持原值 */
export type UpdateWorkspacesInput = Partial<WorkspacesConfig>;

// ========== AI-Coding 项目类型 ==========

export interface ProjectToolMarker {
  tool: string;
  marker: string;
  path: string;
}

export interface ProjectAssetStats {
  rules: number;
  skills: number;
  docs: number;
}

export interface ProjectGitInfo {
  isGitRepo: boolean;
  branch: string | null;
  hasUncommittedChanges: boolean;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  lastAccessedAt: string | null;
  exists: boolean;
  tools: ProjectToolMarker[];
  assetStats: ProjectAssetStats;
  git: ProjectGitInfo;
}

export interface ProjectListResult {
  items: ProjectInfo[];
  total: number;
  existingCount: number;
}

export type ProjectOpenTarget = 'explorer' | 'terminal' | 'ide';

// ========== 连接详情类型 ==========

export interface ConnectionDetail {
  toolId: string;
  toolName: string;
  installStatus: 'installed' | 'not_installed';
  configDir?: string;
  version?: string;
  enabled?: boolean;
  assetDistributions: Array<{
    asset: Asset;
    status: AssetSyncStatus;
    lastSyncedAt?: string;
  }>;
  unimportedFiles: Array<{
    path: string;
    size: number;
    category: FrontendCategory;
  }>;
}

// ========== 工具热切换(enable-tool-hot-swap) ==========

/** 切换包覆盖的六类资产(不含 preference) */
export type SwapCategory = 'identity' | 'rule' | 'skill' | 'mcp' | 'memory' | 'agent';

/** 单个投放项在预览中的冲突判定 */
export type SwapConflictStatus = 'none' | 'exists' | 'differs';

/** 目标工具对某类别的支持情况 */
export type SwapCategorySupport =
  | { supported: true }
  | { supported: false; reason: string };

/** 预览中的单个资产项 */
export interface SwapPreviewItem {
  category: SwapCategory;
  hubRelativePath: string;
  targetPath: string;
  strategy: 'symlink' | 'copy' | 'native-import' | 'per-project';
  conflict: SwapConflictStatus;
  /** differs 项默认 false，需显式勾选覆盖 */
  defaultOverwrite: boolean;
  support: SwapCategorySupport;
}

/** 按类别分组的预览 */
export interface SwapCategoryGroup {
  category: SwapCategory;
  support: SwapCategorySupport;
  items: SwapPreviewItem[];
  counts: { total: number; new: number; willOverwrite: number; unchanged: number; skipped: number };
}

/** 一次切换预览 */
export interface SwapPreview {
  tool: string;
  toolInstalled: boolean;
  groups: SwapCategoryGroup[];
  /** 生成时间戳，执行时回传做 staleness 校验 */
  generatedAt: string;
}

/** 覆盖决策 */
export interface SwapOverwriteDecision {
  hubRelativePath: string;
  overwrite: boolean;
}

/** 切换候选目标 */
export interface SwapToolCandidate {
  name: string;
  displayName: string;
  installed: boolean;
  supportMatrix: Record<SwapCategory, SwapCategorySupport>;
}

/** 回读验证结果(诚实边界:已写入并校验) */
export interface SwapVerifyResult {
  passed: boolean;
  exists: boolean;
  parseable: boolean;
  matchesSource: boolean;
  hubRelativePath: string;
  failure?: string;
}

/** 执行结果单项 */
export interface SwapItemResult {
  hubRelativePath: string;
  category: SwapCategory;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  verify?: SwapVerifyResult;
}

/** 执行结果 */
export interface SwapExecuteResult {
  tool: string;
  swapId: string;
  success: boolean;
  counts: { written: number; skipped: number; failed: number };
  items: SwapItemResult[];
  rollbackAvailable: boolean;
  createdAt: string;
}

/** 回滚结果 */
export interface SwapRollbackResult {
  swapId: string;
  restored: number;
  removed: number;
  success: boolean;
  error?: string;
}

/** 切换历史单条 */
export interface SwapHistoryEntry {
  swapId: string;
  tool: string;
  createdAt: string;
  counts: { written: number; skipped: number; failed: number };
  rolledBack: boolean;
  rollbackAvailable: boolean;
}
