// API Contract for add-vault-connections-ui change
// 本文件定义本变更涉及的所有新 API 接口契约，前后端共用此类型定义。
// 修改本文件前必须更新对应的 spec.md

// ============================================================================
// 通用类型
// ============================================================================

/** 资产类别（动态扩展，不写死，参考 assetplex-asset-taxonomy.md） */
export type AssetCategory = 'identity' | 'skill' | 'rule' | 'mcp';
// Phase B 扩展: | 'command' | 'agent' | 'memory'

/** 资产来源 */
export type AssetSource =
  | 'trae'        // 从 TRAE 导入
  | 'workbuddy'   // 从 WorkBuddy 导入
  | 'claude'      // 从 Claude Code 导入
  | 'codex'       // 从 Codex 导入
  | 'qoder'       // 从 Qoder 导入
  | 'manual'      // 手动创建
  | 'merged';     // 多个来源合并

/** 同步状态 */
export type SyncStatus =
  | 'synced'      // 已同步（工具里的就是 Hub 最新版）
  | 'pending'     // 待更新（Hub 有更新，未推送）
  | 'conflict'    // 冲突（工具里的文件和 Hub 不一致）
  | 'not_enabled' // 未启用（该工具未开启此资产同步）
  | 'not_installed'; // 工具未安装

/** 工具安装状态 */
export type ToolInstallStatus =
  | 'installed'   // 已安装
  | 'not_installed'; // 未安装

// ============================================================================
// 资产 (Asset)
// ============================================================================

/** Hub 中的单个资产 */
export interface Asset {
  /** 资产唯一 ID（Hub 路径或 hash） */
  id: string;
  /** 资产名称（不含扩展名） */
  name: string;
  /** 资产类别 */
  category: AssetCategory;
  /** Hub 内相对路径，如 "skills/react-expert.md" */
  hubPath: string;
  /** 来源 */
  source: AssetSource;
  /** 最后修改时间 ISO 8601 */
  lastModifiedAt: string;
  /** 文件大小（字节） */
  size: number;
  /** 该资产分发到各工具的状态 */
  distributions: AssetDistribution[];
}

/** 单个资产在某个工具的分发状态 */
export interface AssetDistribution {
  /** 工具 ID，如 'trae-cn'、'workbuddy' */
  toolId: string;
  /** 工具显示名 */
  toolName: string;
  /** 同步状态 */
  status: SyncStatus;
  /** 该工具中对应的文件路径，如 "C:\\Users\\caiwe\\.trae-cn\\skills\\react-expert.md" */
  toolPath?: string;
  /** 最后同步时间 */
  lastSyncedAt?: string;
}

// ============================================================================
// 工具连接 (Connection)
// ============================================================================

/** 已连接的 AI 工具 */
export interface Connection {
  /** 工具 ID */
  toolId: string;
  /** 工具显示名 */
  toolName: string;
  /** 安装状态 */
  installStatus: ToolInstallStatus;
  /** 安装路径（已安装时） */
  installPath?: string;
  /** 工具版本（如可检测） */
  version?: string;
  /** 同步策略 */
  syncStrategy?: 'symlink' | 'copy';
  /** 最后同步时间 */
  lastSyncedAt?: string;
  /** 该工具的资产分发统计 */
  assetStats: {
    synced: number;
    pending: number;
    conflict: number;
    notEnabled: number;
  };
}

// ============================================================================
// 活动 (Activity)
// ============================================================================

/** 活动记录 */
export interface ActivityItem {
  /** 活动 ID */
  id: string;
  /** 操作类型 */
  type: 'import' | 'sync' | 'edit' | 'create' | 'delete';
  /** 操作时间 ISO 8601 */
  occurredAt: string;
  /** 操作描述（人类可读） */
  description: string;
  /** 关联的工具 ID（如适用） */
  toolId?: string;
  /** 关联的资产 ID（如适用） */
  assetId?: string;
  /** 操作结果 */
  result: 'success' | 'partial' | 'failed';
  /** 详细信息（如文件列表、策略等） */
  details?: {
    files?: Array<{
      path: string;
      action: string;
      result: 'success' | 'failed' | 'skipped';
    }>;
  };
}

// ============================================================================
// API 接口定义
// ============================================================================

// ---- 首页聚合数据 ----

/** GET /api/hub/overview — 首页所需的聚合数据 */
export interface GetOverviewApi {
  method: 'GET';
  path: '/api/hub/overview';
  response: {
    /** 资产统计（按类别） */
    assetStats: Record<AssetCategory, number>;
    /** 工具连接列表及状态 */
    connections: Connection[];
    /** 最近活动（最多 5 条） */
    recentActivities: ActivityItem[];
    /** Hub 是否已初始化 */
    hubInitialized: boolean;
    /** Hub 健康度（0-100） */
    healthScore: number;
  };
}

// ---- 资产库 ----

/** GET /api/assets — 列出 Hub 中的资产 */
export interface ListAssetsApi {
  method: 'GET';
  path: '/api/assets';
  query: {
    category?: AssetCategory;
    search?: string;
  };
  response: {
    items: Asset[];
    total: number;
  };
}

/** GET /api/assets/:id — 获取单个资产详情 */
export interface GetAssetApi {
  method: 'GET';
  path: '/api/assets/:id';
  response: Asset & {
    /** 资产内容（Markdown 或 JSON 文本） */
    content: string;
  };
}

/** POST /api/assets — 创建新资产 */
export interface CreateAssetApi {
  method: 'POST';
  path: '/api/assets';
  body: {
    name: string;
    category: AssetCategory;
    content: string;
  };
  response: {
    asset: Asset;
  };
}

/** PUT /api/assets/:id — 更新资产内容 */
export interface UpdateAssetApi {
  method: 'PUT';
  path: '/api/assets/:id';
  body: {
    content: string;
  };
  response: {
    asset: Asset;
  };
}

/** GET /api/assets/:id/distribution — 获取资产的分发配置 */
export interface GetAssetDistributionApi {
  method: 'GET';
  path: '/api/assets/:id/distribution';
  response: {
    distributions: AssetDistribution[];
  };
}

/** PUT /api/assets/:id/distribution — 更新资产的分发配置 */
export interface UpdateAssetDistributionApi {
  method: 'PUT';
  path: '/api/assets/:id/distribution';
  body: {
    /** 每个工具是否启用同步 */
    enabledTools: string[];
  };
  response: {
    distributions: AssetDistribution[];
  };
}

// ---- 连接（工具） ----

/** GET /api/connections — 列出所有工具连接 */
export interface ListConnectionsApi {
  method: 'GET';
  path: '/api/connections';
  response: {
    connections: Connection[];
  };
}

/** GET /api/connections/:toolId — 获取工具详情 */
export interface GetConnectionApi {
  method: 'GET';
  path: '/api/connections/:toolId';
  response: Connection & {
    /** 该工具的资产分发状态列表 */
    assetDistributions: Array<{
      asset: Asset;
      status: SyncStatus;
      lastSyncedAt?: string;
    }>;
    /** 该工具中未入库的文件 */
    unimportedFiles: Array<{
      path: string;
      size: number;
      category: AssetCategory;
    }>;
  };
}

/** POST /api/connections/:toolId/sync — 同步 Hub 资产到工具 */
export interface SyncConnectionApi {
  method: 'POST';
  path: '/api/connections/:toolId/sync';
  body: {
    /** 要同步的资产 ID 列表，空表示同步所有 */
    assetIds?: string[];
  };
  response: {
    /** 同步任务 ID（异步执行） */
    syncJobId: string;
  };
}

// ---- 活动 ----

/** GET /api/activity — 列出活动记录 */
export interface ListActivityApi {
  method: 'GET';
  path: '/api/activity';
  query: {
    type?: ActivityItem['type'];
    limit?: number;
    cursor?: string; // 分页游标
  };
  response: {
    items: ActivityItem[];
    nextCursor?: string;
  };
}

/** GET /api/activity/:id — 获取活动详情 */
export interface GetActivityApi {
  method: 'GET';
  path: '/api/activity/:id';
  response: ActivityItem;
}
