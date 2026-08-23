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
  assetStats: Record<FrontendCategory, number>;
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
