/**
 * api-contract: fix-trust-and-consistency
 *
 * 与 specs/ 三份 capability 一一对应。契约文档独立可读，不真实 import。
 * 禁止 any；实现落 src/core/distribution-index.ts、src/core/asset-categories.ts、
 * src/server/routes/{assets,hub}.ts。
 */

// ============ 资产类别声明源（specs/asset-center-consistency.spec.md）============

/**
 * 资产类别描述符：唯一声明源为 src/core/asset-categories.ts。
 * 前端只允许保留同字段 fallback 常量，禁止维护第二份独立清单。
 */
export interface AssetCategoryDescriptor {
  /** 类别代码，用于 URL 与 API 参数（如 'identity' / 'skill'） */
  code: string;
  /** 中文显示名 */
  label: string;
  /** 一句话描述（类别页副标题） */
  description: string;
  /** Hub 内目录名（如 'skills'）；external 类别可为空串 */
  hubDir: string;
  /** true = 由专用接口供数，不走 /api/assets */
  external: boolean;
  /** 是否支持跨工具分发 */
  syncable: boolean;
  /** 是否纳入资产医生 */
  doctorSupported: boolean;
  /** 排序权重，小者靠前 */
  order: number;
}

/** GET /api/asset-categories */
export interface ListAssetCategoriesResponse {
  categories: AssetCategoryDescriptor[];
  /** 声明源版本，便于前端判断 fallback 是否需要更新 */
  declaredAt: string;
}

// ============ 分发状态索引（specs/asset-distribution-truth.spec.md）============

/**
 * 状态闭集，与既有 AssetDistribution.status 保持一致（proposal D1）。
 * 不新增 missing / unknown / not_supported。
 */
export type DistributionStatus =
  | 'synced' // 文件事实成立：符号链接指向 Hub、内容一致、或聚合文件已包含
  | 'pending' // 目标不存在（待同步）
  | 'conflict' // 目标存在但内容与 Hub 不同
  | 'not_enabled' // 工具已安装但未启用
  | 'not_installed'; // 工具未安装

export interface AssetDistributionInfo {
  /** 工具标识（如 'trae-cn'） */
  toolId: string;
  /** 工具显示名（如 'TRAE 中国版'） */
  toolName: string;
  status: DistributionStatus;
  /** 判定所依据的目标路径（目录级策略为目录路径）；未安装时缺省 */
  targetPath?: string;
}

/**
 * GET /api/distributions[?refresh=1]
 *
 * index 的 key 为资产在 Hub 中的相对路径（如 'skills/demo-skill/SKILL.md'）。
 * 只包含库内资产入口文件；未入库资产不出现。
 * 项目级策略工具（Qoder）不产生任何条目（proposal D3）。
 */
export interface DistributionIndexResponse {
  /** 本次快照生成时间（ISO） */
  generatedAt: string;
  /** true = 命中缓存；refresh=1 时恒为 false */
  cached: boolean;
  /** true = 至少一个工具判定失败，界面需提示「部分工具状态暂不可用」 */
  partial: boolean;
  /** 判定失败的工具标识，便于前端点名 */
  failedTools: string[];
  index: Record<string, AssetDistributionInfo[]>;
}

// ============ 计数口径（specs/asset-center-consistency.spec.md）============

/** 三口径：每个类别各自独立，互不可加总为空 */
export interface CategoryCounts {
  /** 我的库：Hub 内该类资产入口文件数 */
  library: number;
  /** 本机环境：工具目录中存在但未收藏的条目数（仅技能类有值，其余为 0） */
  environment: number;
  /** 可收藏：扫描到且不在我的库的条目数 */
  pendingImport: number;
}

/** 单个工具的已同步计数（来源 = 分发状态索引，不读 Hub 文件数） */
export interface ToolSyncedCounts {
  toolId: string;
  /** 按类别统计的 synced 条目数 */
  byCategory: Record<string, number>;
  total: number;
}

/**
 * GET /api/hub/overview 的增量字段（既有 assetStats / connections 保留兼容）。
 * 前端所有数字必须取自此结构，禁止就地 filter().length。
 */
export interface HubSummary {
  generatedAt: string;
  hubInitialized: boolean;
  counts: Record<string, CategoryCounts>;
  toolSynced: ToolSyncedCounts[];
}

/** GET /api/assets 的兼容约定（阶段 0） */
export interface AssetListCompatNote {
  /** 兼容字段：阶段 0 仍返回空数组，前端不得依赖；阶段 1 删除 */
  distributions: [];
}

/**
 * 错误约定（沿用 { error }）：
 * - 400 refresh 参数非法
 * - 500 索引计算整体失败（不得返回半真半假的状态；前端显示错误与重试）
 * 单工具判定失败不进 500，走 partial + failedTools。
 */
export type ApiError = { error: string };
