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
  | 'agent'
  | 'memory';

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
  /**
   * 目标路径当前是否存在（add-zero-config-onboarding T5）：
   * 分发预览用它区分新增/覆盖/冲突/无变化；未计算时缺省
   */
  targetExists?: boolean;
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

/**
 * 扫描发现的文件类别
 *
 * `preference` 仅作适配器 import 兜底（历史目录 preferences/），
 * 不再出现在收藏向导的分组里（add-memory-category D5）。
 * `command` 不列入：Claude 专属 slash command 模板已不再扫描（同 D3）。
 */
export type DiscoveredCategory =
  | 'identity'
  | 'skill'
  | 'rule'
  | 'mcp'
  | 'agent'
  | 'memory'
  | 'preference';

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
  /**
   * 是否二进制（refine-skill-cards-wizard T12）：
   * 扫描时判定的静态字段，UI 据此打徽章、默认不勾选，导入时走字节写入
   */
  binary: boolean;
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
  /**
   * 仲裁合并草案（add-llm-conflict-arbitration C4）：
   * 仅 strategy === 'merge' 且非空白时生效——直接以此为准落盘，跳过机械合并
   */
  mergeDraft?: string;
  /**
   * 是否二进制（refine-skill-cards-wizard T13）：前端从扫描结果透传；
   * 缺省时后端按源文件实际类型自行判定，避免旧客户端把图标当文本写坏
   */
  binary?: boolean;
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
  /** 跳过原因（refine-skill-cards-wizard T13）：当前仅二进制请求合并时给出 */
  skipReason?: 'binary-merge';
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

// ========== 冲突仲裁类型（add-llm-conflict-arbitration，共享基座避免循环依赖） ==========

/** 仲裁决策闭集（闭集外输出一律判失败，不新增取值） */
export const ARBITRATION_DECISIONS = ['keep-left', 'keep-right', 'merge', 'manual-review'] as const;
export type ArbitrationDecision = (typeof ARBITRATION_DECISIONS)[number];

/** 仲裁可处理的资产类别闭集（preference 不参与仲裁） */
export const ARBITRATION_CATEGORIES = ['identity', 'skill', 'rule', 'mcp', 'memory'] as const;
export type ArbitrationCategory = (typeof ARBITRATION_CATEGORIES)[number];

// ========== 资产医生类型（add-asset-doctor，共享基座） ==========

/** 医生服务的资产类别闭集（mcp 一期不做模型诊断，见 proposal 非目标） */
export const DOCTOR_ASSET_KINDS = ['identity', 'skill', 'rule', 'agent', 'command', 'memory'] as const;
export type DoctorAssetKind = (typeof DOCTOR_ASSET_KINDS)[number];

/** 诊断结论闭集（闭集外一律解析失败，Scenario 8） */
export const DIAGNOSIS_OVERALLS = ['healthy', 'needs-attention', 'at-risk'] as const;
export type DiagnosisOverall = (typeof DIAGNOSIS_OVERALLS)[number];

export const DIAGNOSIS_SEVERITIES = ['high', 'medium', 'low'] as const;
export type DiagnosisSeverity = (typeof DIAGNOSIS_SEVERITIES)[number];

/** 确定性预检项闭集（机械判定不烧 token，proposal D6） */
export const MECHANICAL_CHECK_IDS = [
  'frontmatter-missing-field',
  'description-empty',
  'body-over-length',
  'shouting-rules',
] as const;
export type MechanicalCheckId = (typeof MECHANICAL_CHECK_IDS)[number];

/** 诊断问题条目：机械项 criterion 固定为 'mechanical:<checkId>' */
export interface DiagnosisIssue {
  severity: DiagnosisSeverity;
  criterion: string;
  finding: string;
  suggestion: string;
  /** 是否可生成改写草案 */
  fixable: boolean;
}

// ========== 规则注册表与证据（add-diagnosis-rules，共享基座） ==========

/**
 * 规则集覆盖的七类资产：比 DoctorAssetKind 多出 mcp（医生一期不诊断 mcp，但规则集含 11 条 MCP 规则）
 */
export const RULE_ASSET_CATEGORIES = [
  'identity',
  'skill',
  'rule',
  'mcp',
  'command',
  'agent',
  'memory',
] as const;
export type RuleAssetCategory = (typeof RULE_ASSET_CATEGORIES)[number];

/** cross = 跨资产通用规则：在 appliesTo 的每个类别下展示，但全库只计一次 */
export const RULE_CATEGORIES = [...RULE_ASSET_CATEGORIES, 'cross'] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

/** static = 零模型调用；llm = 语义增量（只能从候选规则中选且必须带证据） */
export const RULE_MODES = ['static', 'llm'] as const;
export type RuleMode = (typeof RULE_MODES)[number];

export const DIAGNOSIS_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type DiagnosisConfidence = (typeof DIAGNOSIS_CONFIDENCES)[number];

/** 一条可稳定引用的检查项（诊断、治理分类页、编写指南共用同一份） */
export interface DiagnosisRule {
  /** 稳定编号，如 SK-04、SEC-01；永不复用 */
  id: string;
  category: RuleCategory;
  /** category=cross 时必填，列出适用资产类别；其余规则缺省为 [category] */
  appliesTo?: RuleAssetCategory[];
  severity: DiagnosisSeverity;
  mode: RuleMode;
  signal: string;
  recommendation: string;
  source: string;
}

export interface DiagnosisRuleSet {
  /** 语义变更必须递增（spec Scenario 6.4） */
  version: string;
  updatedAt: string;
  rules: DiagnosisRule[];
}

/** GET /api/diagnosis/rules：治理中心分类页与编写指南共用同一份规则清单 */
export interface DiagnosisRuleListResponse extends DiagnosisRuleSet {
  /** 按类别计数；cross 单列，不计入七类（spec 统计口径） */
  counts: Record<RuleCategory, number>;
  /** 按 mode 计数，用于「静态 / AI」口径披露 */
  modeCounts: Record<RuleMode, number>;
}

/** line 为 null 表示无法定位到具体行（缺失类问题），前端标注「片段序号」 */
export interface FindingEvidence {
  /** 库内相对路径，禁止绝对路径与用户名 */
  hubRelativePath: string;
  line: number | null;
  /** 片段，长度 ≤ 200 字，必须能在原文中定位 */
  snippet: string;
  snippetIndex?: number;
}

/** rule = 静态规则命中；llm = AI 语义增量 */
export type FindingSource = 'rule' | 'llm';

/** 一次诊断产出的一条问题，必须绑定 ruleId */
export interface RuleFinding {
  /** 报告内唯一，用于忽略 / 恢复与前端 key */
  id: string;
  ruleId: string;
  category: RuleCategory;
  severity: DiagnosisSeverity;
  confidence: DiagnosisConfidence;
  source: FindingSource;
  /** 规则一句话标题（来自注册表，不由模型生成） */
  title: string;
  finding: string;
  /** AI 未参与时允许为空串 */
  impact: string;
  suggestion: string;
  evidence: FindingEvidence[];
  /** true = 证据不足：不计分、不可修复、不进建议 */
  insufficientEvidence: boolean;
  fixable: boolean;
  /** 命中忽略清单后仍在响应中返回，供「已忽略 N 条 / 恢复」入口使用 */
  ignored: boolean;
}

/** 本轮到底查了什么、没查什么 */
export interface DiagnosisCoverage {
  evaluatedRules: number;
  skippedRules: number;
  skippedReasons: Array<{ mode: RuleMode; reason: 'no-ai-config' | 'budget' | 'timeout'; count: number }>;
}
