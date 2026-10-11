/**
 * API Contract: enable-tool-hot-swap(工具热切换)
 *
 * 新增一组 /api/swap/* 路由(编排层),复用现有 SyncEngine,不改动
 * /sync/plan、/sync/run 既有契约。后端纯逻辑落 core/swap.ts。
 *
 * 关键类型变更(需先落 src/core/types.ts,再实现):
 *   - HubItemType 追加 'memory'(现含 identity|skill|rule|preference|mcp|command|agent,缺 memory)
 *   - 类别集合保持可扩展,不写死数量(taxonomy §六.1)
 *
 * 命名对齐既有类型:SyncTarget / SyncStrategy / ConflictStatus 复用 types.ts 定义。
 */

/** 切换包覆盖的六类资产(不含 preference) */
export type SwapCategory =
  | 'identity'
  | 'rule'
  | 'skill'
  | 'mcp'
  | 'memory'
  | 'agent';

/** 单个投放项在预览中的冲突判定(对齐既有 ConflictStatus) */
export type SwapConflictStatus = 'none' | 'exists' | 'differs';

/** 目标工具对某类别的支持情况 */
export type CategorySupport =
  | { supported: true }
  | { supported: false; reason: string }; // 例:'此工具不支持,已跳过'

/** 预览中的单个资产项 */
export interface SwapPreviewItem {
  category: SwapCategory;
  /** 我的库内相对路径,如 'identity/profile.md' */
  hubRelativePath: string;
  /** 将写入目标工具的路径(可能为空:类别不支持时) */
  targetPath: string;
  /** 目标同步策略(复用 SyncStrategy) */
  strategy: 'symlink' | 'copy' | 'native-import' | 'per-project';
  conflict: SwapConflictStatus;
  /** differs 项默认 false(不覆盖),需显式置 true 才计入覆盖 */
  defaultOverwrite: boolean;
  /** 该类别在此工具是否支持;不支持则不参与执行 */
  support: CategorySupport;
}

/** 按类别分组的预览 */
export interface SwapCategoryGroup {
  category: SwapCategory;
  support: CategorySupport;
  items: SwapPreviewItem[];
  /** 计数摘要,供概览展示 */
  counts: { total: number; new: number; willOverwrite: number; unchanged: number; skipped: number };
}

/** 一次切换预览(GET 目标工具后生成) */
export interface SwapPreview {
  tool: string;
  toolInstalled: boolean;
  groups: SwapCategoryGroup[];
  /** 生成本预览的时间戳(ISO),执行时需回传校验时效 */
  generatedAt: string;
}

/** POST /api/swap/preview 请求体 */
export interface SwapPreviewRequest {
  tool: string;
}

/** 用户对冲突项的显式覆盖决定(仅 differing 项需决策) */
export interface SwapOverwriteDecision {
  hubRelativePath: string;
  overwrite: boolean;
}

/** POST /api/swap/execute 请求体 */
export interface SwapExecuteRequest {
  tool: string;
  /** 回传预览生成时间,若工具目录在此期间已变化则拒绝执行,要求重新预览 */
  previewGeneratedAt: string;
  overwriteDecisions: SwapOverwriteDecision[];
}

/** 单资产验证结论(回读:存在 + 可解析 + 与源一致) */
export interface SwapVerifyResult {
  hubRelativePath: string;
  targetPath: string;
  /** 诚实边界:仅表"已写入并校验",不代表工具已加载 */
  exists: boolean;
  parseable: boolean;
  matchesSource: boolean;
  passed: boolean;
  /** 未通过时的维度说明与路径 */
  failure?: string;
}

/** 单个投放项的执行结果 */
export interface SwapItemResult {
  hubRelativePath: string;
  category: SwapCategory;
  action: 'written' | 'skipped' | 'failed';
  /** skipped 原因(如冲突未确认覆盖 / 类别不支持) */
  reason?: string;
  verify?: SwapVerifyResult;
}

/** POST /api/swap/execute 响应 */
export interface SwapExecuteResult {
  tool: string;
  /** 本次切换唯一 id,供回滚与历史引用 */
  swapId: string;
  success: boolean; // 无 failed 项且核心投放通过
  counts: { written: number; skipped: number; failed: number };
  items: SwapItemResult[];
  /** 是否存在可回滚备份(differs 覆盖项产生) */
  rollbackAvailable: boolean;
  createdAt: string;
}

/** POST /api/swap/rollback 请求体 */
export interface SwapRollbackRequest {
  swapId: string;
}

/** POST /api/swap/rollback 响应 */
export interface SwapRollbackResult {
  swapId: string;
  restored: number; // 从备份恢复的覆盖文件数
  removed: number; // 本次新增被移除的文件数
  success: boolean;
  error?: string;
}

/** GET /api/swap/history 单条 */
export interface SwapHistoryEntry {
  swapId: string;
  tool: string;
  createdAt: string;
  counts: { written: number; skipped: number; failed: number };
  rolledBack: boolean;
  rollbackAvailable: boolean;
}

/** GET /api/swap/tools 候选目标 */
export interface SwapToolCandidate {
  name: string;
  displayName: string;
  installed: boolean;
  /** 六类支持矩阵 */
  supportMatrix: Record<SwapCategory, CategorySupport>;
}

/**
 * 路由一览(实现于 src/server/routes/swap.ts,前缀 /api/swap):
 *   GET  /api/swap/tools              → SwapToolCandidate[]
 *   POST /api/swap/preview            body: SwapPreviewRequest  → SwapPreview
 *   POST /api/swap/execute            body: SwapExecuteRequest  → SwapExecuteResult
 *   POST /api/swap/rollback           body: SwapRollbackRequest → SwapRollbackResult
 *   GET  /api/swap/history            → SwapHistoryEntry[]
 *
 * 备份目录:Hub 内 .swap-backup/<swapId>/,保留最近 3 次(可配 swap.backupRetain)。
 * 全流程仅本机文件读写,零数据上传(宪法②);预览/执行间用 previewGeneratedAt 防 staleness。
 */
export {};
