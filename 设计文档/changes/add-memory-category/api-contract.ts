/**
 * API 契约增量：add-memory-category
 *
 * 只写本变更新增/变更的字段，完整契约见阶段 0 的 fix-trust-and-consistency/api-contract.ts。
 * 命名与 src/core/asset-categories.ts 保持一致。
 */

/** 资产类别代码（在阶段 0 的六个之上新增 memory；command 不属资产，不进此集合） */
export type AssetCategoryCode =
  | 'identity'
  | 'skill'
  | 'rule'
  | 'mcp'
  | 'agent'
  | 'memory' // 新增
  | 'criteria';

/**
 * 类别描述符（GET /api/asset-categories 的元素）
 *
 * 新增 legacyHubDirs：兼容目录。列表读取时把这些目录的内容并入本类别展示，
 * 但不参与新建（新建一律写 hubDir）。memory 用它承接历史 preferences/。
 */
export interface AssetCategoryDescriptor {
  readonly code: AssetCategoryCode;
  readonly label: string;
  readonly description: string;
  readonly hubDir: string;
  /** 兼容目录（只读并入，不写）；无则为空数组或不填 */
  readonly legacyHubDirs?: readonly string[];
  readonly external: boolean;
  readonly syncable: boolean;
  readonly doctorSupported: boolean;
  readonly order: number;
}

/** GET /api/asset-categories 响应 */
export interface ListAssetCategoriesApi {
  categories: AssetCategoryDescriptor[];
  /** 声明源版本日期，便于排查前端是否在跑旧清单 */
  declaredAt: string;
}

/**
 * GET /api/assets?category=memory 响应
 *
 * 形状与阶段 0 完全一致（ListAssetsResult），不新增字段；
 * 变化仅在 category 的合法取值集合扩张到七个代码（不含 preference、不含 command）。
 */
export interface ListAssetsByNewCategoryApi {
  items: Asset[];
  total: number;
}

/** 资产对象（与 src/core/assets.ts 的 Asset 同形，category 取值为 AssetCategoryCode 的子集） */
export interface Asset {
  id: string;
  name: string;
  category: Exclude<AssetCategoryCode, 'criteria'>;
  hubPath: string;
  source: 'trae' | 'workbuddy' | 'claude' | 'codex' | 'qoder' | 'manual' | 'merged';
  lastModifiedAt: string;
  size: number;
  distributions: AssetDistribution[];
}

export interface AssetDistribution {
  toolId: string;
  toolName: string;
  status: 'synced' | 'pending' | 'conflict' | 'not_enabled' | 'not_installed';
  toolPath?: string;
  lastSyncedAt?: string;
}

/**
 * 扫描发现项类别（内部契约，不直接下发到前端）
 *
 * 'preference' 保留为适配器 import 兜底，不再出现在发现列表；
 * 'command' 不在集合内——Claude 的 commands/ 已停止扫描（D3）。
 */
export type DiscoveredCategory =
  | 'identity'
  | 'skill'
  | 'rule'
  | 'mcp'
  | 'agent' // 本变更起由适配器扫描直接产出（原被误标 preference）
  | 'memory'
  | 'preference'; // 仅兜底

/**
 * 资产医生检查的资产类别（在既有 identity/skill/rule/agent/command 上新增 memory）
 *
 * 注意：这里的 command 是资产医生的历史能力（诊断 Hub 内 commands/ 目录），
 * 与「命令是否为资产类别」无关——本变更不撤回体检对 commands/ 的支持。
 */
export type DoctorAssetKind = 'identity' | 'skill' | 'rule' | 'agent' | 'command' | 'memory';
