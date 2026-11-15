/**
 * 资产写入公共类型（remove-tool-swap B21 更名，原 enable-tool-hot-swap）
 *
 * 原契约见 设计文档/changes/enable-tool-hot-swap/api-contract.ts。
 * 纯类型 + 常量清单，不含运行时逻辑；实现见 core/asset-write.ts。
 */

import type { HubItem } from './types.js';

/** 切换包覆盖的六类资产(不含 preference) */
export type AssetWriteCategory = 'identity' | 'rule' | 'skill' | 'mcp' | 'memory' | 'agent';

/** 六类单一清单(不写死数量，随类别体系扩展) */
export const ASSET_WRITE_CATEGORIES: readonly AssetWriteCategory[] = [
  'identity',
  'rule',
  'skill',
  'mcp',
  'memory',
  'agent',
] as const;

/** 冲突判定(对齐既有 ConflictStatus) */
export type AssetWriteConflictStatus = 'none' | 'exists' | 'differs';

/** 目标工具对某类别的支持情况 */
export type CategorySupport = { supported: true } | { supported: false; reason: string };

/** 预览中的单个资产项 */
export interface AssetWritePreviewItem {
  category: AssetWriteCategory;
  /** 我的库内相对路径,如 'identity/profile.md' */
  hubRelativePath: string;
  /** 将写入目标工具的路径 */
  targetPath: string;
  /** 目标同步策略(复用 SyncStrategy) */
  strategy: 'symlink' | 'copy' | 'native-import' | 'per-project';
  conflict: AssetWriteConflictStatus;
  /** differs 项默认 false(不覆盖)，需显式置 true 才计入覆盖 */
  defaultOverwrite: boolean;
  /** 该类别在此工具是否支持;不支持则不参与执行 */
  support: CategorySupport;
}

/** 计数摘要 */
export interface AssetWriteCounts {
  total: number;
  new: number;
  willOverwrite: number;
  unchanged: number;
  skipped: number;
}

/** 按类别分组的预览 */
export interface AssetWriteCategoryGroup {
  category: AssetWriteCategory;
  support: CategorySupport;
  items: AssetWritePreviewItem[];
  counts: AssetWriteCounts;
}

/** 一次切换预览(选定目标工具后生成) */
export interface AssetWritePreview {
  tool: string;
  toolInstalled: boolean;
  groups: AssetWriteCategoryGroup[];
  /** 生成本预览的时间戳(ISO)，执行时需回传校验时效 */
  generatedAt: string;
}

/** 用户对冲突项的显式覆盖决定(仅 differs 项需决策) */
export interface AssetWriteOverwriteDecision {
  hubRelativePath: string;
  overwrite: boolean;
}

/** 单次写入执行请求体（原切换执行端点，现仅内部调用） */
export interface AssetWriteExecuteRequest {
  tool: string;
  /** 回传预览生成时间；工具目录在此期间已变化则拒绝执行，要求重新预览 */
  previewGeneratedAt: string;
  overwriteDecisions: AssetWriteOverwriteDecision[];
  /**
   * 单资产分发范围（add-asset-doctor F3）：只执行 entries 命中任一路径的写入单元
   * （技能目录单元命中主文件即整目录执行）；缺省/空数组 = 全量，既有行为不变。
   */
  onlyHubRelativePaths?: string[];
}

/** 单资产验证结论(回读:存在 + 可解析 + 与源一致) */
export interface AssetWriteVerifyResult {
  hubRelativePath: string;
  targetPath: string;
  /** 诚实边界:仅表"已写入并校验"，不代表工具已加载 */
  exists: boolean;
  parseable: boolean;
  matchesSource: boolean;
  passed: boolean;
  /** 未通过时的维度说明与路径 */
  failure?: string;
}

/** 单个投放项的执行结果 */
export interface AssetWriteItemResult {
  hubRelativePath: string;
  category: AssetWriteCategory;
  action: 'written' | 'skipped' | 'failed';
  /** skipped 原因(如冲突未确认覆盖/类别不支持) */
  reason?: string;
  verify?: AssetWriteVerifyResult;
}

/** 执行结果 */
export interface AssetWriteExecuteResult {
  tool: string;
  /** 本次切换唯一 id，供回滚与历史引用 */
  swapId: string;
  success: boolean;
  counts: { written: number; skipped: number; failed: number };
  items: AssetWriteItemResult[];
  /** 是否存在可回滚记录(覆盖备份或本次新增) */
  rollbackAvailable: boolean;
  createdAt: string;
}

/** 回滚结果 */
export interface AssetWriteRollbackResult {
  swapId: string;
  /** 从备份恢复的覆盖文件数 */
  restored: number;
  /** 本次新增被移除的文件数 */
  removed: number;
  success: boolean;
  error?: string;
}

/** 切换历史单条 */
export interface AssetWriteHistoryEntry {
  swapId: string;
  tool: string;
  createdAt: string;
  counts: { written: number; skipped: number; failed: number };
  rolledBack: boolean;
  rollbackAvailable: boolean;
}

/** 切换包中单类资产 */
export interface AssetWriteBundleCategory {
  category: AssetWriteCategory;
  support: CategorySupport;
  hubItems: HubItem[];
}

/** 切换包(六类 HubItem 汇总 + 支持矩阵) */
export interface AssetWriteBundle {
  tool: string;
  generatedAt: string;
  categories: AssetWriteBundleCategory[];
}

/** AssetWriteEngine 构造选项 */
export interface AssetWriteEngineOptions {
  /** 备份保留次数(默认 3) */
  backupRetain?: number;
}

/** GET /api/distributions/tools 候选目标(契约 api-contract.ts) */
export interface AssetWriteToolCandidate {
  name: string;
  displayName: string;
  installed: boolean;
  /** 六类支持矩阵 */
  supportMatrix: Record<AssetWriteCategory, CategorySupport>;
  /** 项目级工具（syncStrategy='per-project'），前端不显示六类徽章而显示能力说明（D3/I7） */
  projectLevel: boolean;
  /** 项目级工具的已配置项目数；非项目级工具不填（K3：未配置项目时界面给出口而不是六类「不支持」） */
  projectCount?: number;
}
