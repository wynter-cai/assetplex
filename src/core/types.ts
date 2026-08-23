/**
 * AssetPlex 公共类型定义
 */

/** 同步策略 */
export type SyncStrategy =
  | 'native-import' // Claude Code 的 @import 原生导入
  | 'symlink' // 符号链接
  | 'copy' // 复制（用于 Codex 的 TOML 等）
  | 'hybrid' // 混合（自动选择最优策略）
  | 'per-project'; // 项目级分发（Qoder）

/** MCP 配置格式 */
export type McpFormat = 'json' | 'toml';

/** Hub 中的条目类型 */
export type HubItemType =
  | 'identity'
  | 'skill'
  | 'rule'
  | 'preference'
  | 'mcp'
  | 'command'
  | 'agent';

/** Hub 条目 */
export interface HubItem {
  type: HubItemType;
  /** 相对于 hub 根目录的路径，如 'identity/profile.md' */
  relativePath: string;
  /** 绝对路径 */
  absolutePath: string;
  /** 文件内容（可选，仅在需要时加载） */
  content?: Buffer;
}

/** 同步目标 */
export interface SyncTarget {
  /** 目标工具名 */
  tool: string;
  /** 目标绝对路径 */
  targetPath: string;
  /** 同步策略 */
  strategy: SyncStrategy;
  /** 是否目录 */
  isDirectory: boolean;
}

/** 工具检测状态 */
export interface ToolStatus {
  /** 工具名 */
  name: string;
  /** 是否安装 */
  installed: boolean;
  /** 配置目录是否存在 */
  configDirExists: boolean;
  /** 版本（如果能检测到） */
  version?: string;
  /** 配置目录绝对路径 */
  configDir: string;
  /** 错误信息（如果检测失败） */
  error?: string;
}

/** Lint 警告 */
export interface LintWarning {
  level: 'warn' | 'error';
  message: string;
  /** 相关文件路径 */
  path?: string;
  /** 相关工具 */
  tool?: string;
}

/** 同步结果 */
export interface SyncResult {
  tool: string;
  success: boolean;
  /** 同步的条目数 */
  itemCount: number;
  /** 跳过的条目数 */
  skippedCount: number;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings: string[];
  /** 耗时（毫秒） */
  durationMs: number;
}

/** 同步动作类型 */
export type SyncAction = 'symlink' | 'copy' | 'native-import' | 'per-project' | 'skip';

/** 单个同步条目的计划 */
export interface SyncPlanItem {
  /** Hub 中的条目 */
  item: HubItem;
  /** 同步目标 */
  target: SyncTarget;
  /** 实际执行的动作 */
  action: SyncAction;
  /** skip 的原因（仅 action='skip' 时） */
  reason?: string;
  /** 冲突预警（目标路径已有非 symlink 同名文件） */
  warning?: string;
}

/** 单个工具的同步计划 */
export interface SyncPlan {
  /** 工具名 */
  tool: string;
  /** 工具是否已安装 */
  toolInstalled: boolean;
  /** 计划条目列表 */
  items: SyncPlanItem[];
}

/** Sync CLI 选项 */
export interface SyncOptions {
  /** 仅同步指定工具（单个，兼容 CLI） */
  tool?: string;
  /** 仅同步指定的多个工具（前端多选目标） */
  tools?: string[];
  /** 预览不写入 */
  dryRun?: boolean;
  /** JSON 输出 */
  json?: boolean;
}

// ========== 扫描/导入相关类型（智能导入向导 Phase A） ==========

/** 扫描发现的文件类别 */
export type DiscoveredCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'preference';

/** 冲突状态 */
export type ConflictStatus = 'none' | 'exists' | 'differs';

/** 扫描发现的单个条目 */
export interface DiscoveredItem {
  /** 源文件绝对路径 */
  absolutePath: string;
  /** 相对路径（相对于工具配置目录） */
  relativePath: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间（ISO 字符串） */
  modified: string;
  /** 文件类别 */
  category: DiscoveredCategory;
  /** 导入到 Hub 的目标路径，如 'identity/profile.md' */
  hubTargetPath: string;
  /** 冲突状态 */
  conflict: ConflictStatus;
  /** 若 Hub 已存在同名文件，其内容大小 */
  existingSize?: number;
  /** 所属工具 */
  tool: string;
}

/** 单个工具的扫描结果 */
export interface ToolInventory {
  toolName: string;
  displayName: string;
  installed: boolean;
  configDir: string;
  items: DiscoveredItem[];
}

/** 冲突解决策略 */
export type ConflictStrategy = 'merge' | 'overwrite' | 'skip';

/** 导入请求中的单个条目 */
export interface ImportItem {
  tool: string;
  absolutePath: string;
  hubTargetPath: string;
  category: DiscoveredCategory;
  conflict: ConflictStatus;
  /** 冲突解决策略（仅 conflict !== 'none' 时有效） */
  strategy?: ConflictStrategy;
}

/** 导入请求 */
export interface ImportRequest {
  items: ImportItem[];
}

/** 单个条目的导入结果 */
export interface ImportResultItem {
  tool: string;
  hubTargetPath: string;
  status: 'created' | 'merged' | 'overwritten' | 'skipped' | 'error';
  message?: string;
}

/** 导入结果 */
export interface ImportResult {
  success: boolean;
  created: number;
  merged: number;
  overwritten: number;
  skipped: number;
  errors: number;
  items: ImportResultItem[];
}
