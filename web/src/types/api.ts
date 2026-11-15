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
  /** 目标路径当前是否存在（add-zero-config-onboarding T5，分发四分类用） */
  targetExists?: boolean;
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

/**
 * 扫描发现的文件类别（与后端 src/core/types.ts 的 DiscoveredCategory 对齐）
 *
 * `preference` 仅作适配器兜底（历史 preferences/ 目录），不进收藏向导分组
 * （add-memory-category D5）；`command` 不列入：单工具专属，已停止扫描（D3）。
 */
export type DiscoveredCategory =
  | 'identity'
  | 'skill'
  | 'rule'
  | 'mcp'
  | 'agent'
  | 'memory'
  | 'preference';
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
  /** 是否二进制（refine-skill-cards-wizard T14）：扫描时后端判定的静态字段 */
  binary: boolean;
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
  /** 仲裁合并草案：仅 strategy==='merge' 且非空白时后端以此为准落盘 */
  mergeDraft?: string;
  /** 是否二进制：从扫描结果透传，后端缺省时自行判定 */
  binary?: boolean;
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
    /** 跳过原因：当前仅二进制请求合并时给出（binary-merge） */
    skipReason?: 'binary-merge';
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

/**
 * 资产类别代码：以后端声明源为准
 *
 * 已知值用于自动补全，`string & {}` 让接口新增的类别不需要改前端类型也能接住
 * （spec asset-center-consistency Scenario 1：新增类别不触碰前端清单）。
 */
export type AssetCategoryCode = FrontendCategory | 'memory' | (string & {});

/**
 * 资产类别声明源的一条记录（后端 src/core/asset-categories.ts 的唯一真相）
 *
 * spec: asset-center-consistency Scenario 1；前端只保留同名字段的 fallback。
 */
export interface AssetCategoryDescriptor {
  code: string;
  label: string;
  description: string;
  hubDir: string;
  /** 兼容目录（只读并入，不参与新建）：memory 用它承接历史 preferences/ */
  legacyHubDirs?: string[];
  external: boolean;
  syncable: boolean;
  doctorSupported: boolean;
  order: number;
}

export interface AssetCategoriesResponse {
  categories: AssetCategoryDescriptor[];
  declaredAt: string;
}
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

// ========== 活动日志（add-activity-log） ==========

/** 活动类型闭集（与后端 core/activity-log.ts 一致） */
export type ActivityType = 'import' | 'sync' | 'edit' | 'create';
/** 操作发起方：本期只有 web */
export type ActivityActor = 'web' | 'mcp' | 'cli';

/** 活动页的一条记录（真值来自 GET /api/activity） */
export interface ActivityEntry {
  id: string;
  at: string;
  type: ActivityType;
  actor: ActivityActor;
  summary: string;
  targets?: string[];
  counts?: Record<string, number>;
  paths?: string[];
}

export interface ActivityListResponse {
  items: ActivityEntry[];
  /** null = 没有更早的记录 */
  nextCursor: string | null;
}

export interface OverviewData {
  assetStats: Record<OverviewCategory, number>;
  connections: ConnectionInfo[];
  recentActivities: ActivityItem[];
  hubInitialized: boolean;
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

/**
 * 分发索引里的一条记录（真值来自 GET /api/distributions，后端 src/core/distribution-status.ts）
 *
 * `Asset.distributions` 已不再供数（/api/assets 恒返回空数组），
 * 卡片圆点一律从这里取。
 */
export interface AssetDistributionInfo {
  toolId: string;
  toolName: string;
  status: AssetSyncStatus;
  targetPath?: string;
  detail?: string;
}

/** 项目级工具（如 Qoder）：不按单资产上报，只报已接入项目数 */
export interface ProjectToolInfo {
  toolId: string;
  toolName: string;
  projectCount: number;
}

export interface DistributionIndexResponse {
  generatedAt: string;
  /** true = 命中服务端 30s 缓存 */
  cached: boolean;
  /** true = 至少一个工具判定失败，界面需提示「部分工具状态暂不可用」 */
  partial: boolean;
  failedTools: string[];
  /** key = 资产在 Hub 中的相对路径（= Asset.id） */
  index: Record<string, AssetDistributionInfo[]>;
  projectTools: ProjectToolInfo[];
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategoryCode;
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

/** 纯出处五类（MECE：按这个技能最初从哪来，互斥且穷尽） */
export type SkillProvenance = 'self' | 'marketplace' | 'plugin' | 'builtin' | 'github';

/** 库状态（管理轴，独立于出处）：in=已入我的库，out=未入库 */
export type LibraryStatus = 'in' | 'out';

/** 视图口径（refactor-skill-asset-first-view）：资产=入库∪自建；环境=未入库非自建 */
export type SkillAssetScope = 'asset' | 'environment';

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
  /** 出处计数（随 scope/status/search 过滤联动）；Partial 以容出处类别动态扩展（新出处未回填时读 0） */
  countByProvenance: Partial<Record<SkillProvenance, number>>;
  /** 库状态计数：我的库 / 未入库（随 scope/provenance/search 联动） */
  countByStatus: { in: number; out: number };
  /** 视图口径计数：资产/环境（随 function/provenance/status/search 联动，不含 scope 自身维度） */
  countByScope: { asset: number; environment: number };
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

// ========== GitHub 技能发现（add-github-skill-source，对齐 api-contract.ts） ==========

/** 候选技能（发现阶段内存对象，未确认入库前不落盘） */
export interface GithubCandidate {
  name: string;
  description: string;
  /** 仓库内 SKILL.md 相对路径，如 'skills/foo/SKILL.md' */
  skillPath: string;
  /** 技能目录相对路径（附属归属），根布局为 '' */
  dirPath: string;
  sizeBytes: number;
  supportingFileCount: number;
  /** 超护栏被跳过原因（如 'over-size-limit'），正常为空 */
  skippedReason?: string;
  /** 打标后回填的九职能（未打标为 undefined） */
  functionCategory?: SkillFunction;
}

/** POST /api/github/discover 响应 */
export interface GithubDiscoverResult {
  repo: string;
  sha: string;
  shortSha: string;
  candidates: GithubCandidate[];
  notes: string[];
  cached: boolean;
}

export interface GithubSupportingFile {
  path: string;
  sizeBytes: number;
  binary: boolean;
}

/** POST /api/github/preview 响应 */
export interface GithubSkillPreview {
  skillPath: string;
  name: string;
  description: string;
  content: string;
  contentTruncated: boolean;
  supportingFiles: GithubSupportingFile[];
}

/** 单条入库动作（同名已存在时生效，缺省 skip） */
export type GithubCurateAction = 'overwrite' | 'skip';

export interface GithubCurateItemInput {
  skillPath: string;
  name?: string;
  action?: GithubCurateAction;
}

/** POST /api/github/curate 响应 */
export interface GithubCurateResult {
  created: SkillInfo[];
  skipped: Array<{ skillPath: string; name: string }>;
  failed: Array<{ skillPath: string; name?: string; error: string }>;
  backupRefs: string[];
  suggestDoctor: boolean;
}

/** POST /api/github/classify/estimate 响应 */
export interface GithubClassifyEstimate {
  total: number;
  cacheHits: number;
  willCall: number;
  aiConfigured: boolean;
}

/** POST /api/github/classify 单条打标结果 */
export interface GithubCandidateTag {
  skillPath: string;
  function: SkillFunction | null;
  cached: boolean;
  error?: string;
}

export interface GithubClassifyResult {
  tags: GithubCandidateTag[];
  called: number;
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

// ========== 连接页三口径计数 ==========

/**
 * 单类别三口径（服务端派生：src/server/lib/tool-asset-counts.ts）
 *
 * 三者互不可加总，界面数字必须紧跟口径名（proposal D4）；
 * 前端禁止用 `filter(...).length` 自行统计，否则同一类别又会长出第二个真相。
 */
export interface ToolCategoryCounts {
  /** 我的库：Hub 内该类资产入口数（与工具无关） */
  library: number;
  /** 已同步：该工具中状态为 synced 的库内资产数 */
  synced: number;
  /** 可收藏：该工具扫到且我的库里没有的条目数 */
  pendingImport: number;
}

export interface ToolAssetCounts {
  /** key = 类别 code；声明源之外的类别照实补上 */
  byCategory: Record<string, ToolCategoryCounts>;
  /** 项目级工具已接入项目数；null = 按单资产同步的普通工具（proposal D3） */
  projectCount: number | null;
  /** 索引部分工具判定失败，需提示「部分工具状态暂不可用」 */
  partial: boolean;
  failedTools: string[];
  generatedAt: string;
}

/** 工具里扫到、但我的库还没有的文件（服务端只下发可收藏条目） */
export interface DiscoveredFileEntry {
  path: string;
  size: number;
}

export interface DiscoveredFiles {
  identities: DiscoveredFileEntry[];
  rules: DiscoveredFileEntry[];
  skills: DiscoveredFileEntry[];
  mcps: DiscoveredFileEntry[];
}

// ========== 工具类别支持矩阵与分发回滚 ==========

/** 资产类别（不含 preference） */
export type AssetWriteCategory = 'identity' | 'rule' | 'skill' | 'mcp' | 'memory' | 'agent';

/** 目标工具对某类别的支持情况 */
export type AssetWriteCategorySupport =
  | { supported: true }
  | { supported: false; reason: string };

/** 候选目标（资产医生分发确认、资产分发对话框共用） */
export interface AssetWriteToolCandidate {
  name: string;
  displayName: string;
  installed: boolean;
  supportMatrix: Record<AssetWriteCategory, AssetWriteCategorySupport>;
  /** 项目级工具（syncStrategy='per-project'），前端据此渲染能力说明而非类别徽章（D3/I7） */
  projectLevel: boolean;
  /** 项目级工具的已配置项目数；非项目级工具不填（K3） */
  projectCount?: number;
}

/** 回滚一次分发的结果 */
export interface AssetWriteRollbackResult {
  swapId: string;
  restored: number;
  removed: number;
  success: boolean;
  error?: string;
}

// ========== 裁决准则元资产(add-llm-conflict-arbitration) ==========

/** 准则适用资产类别（'all' 为通配） */
export type CriterionAppliesTo =
  | 'all'
  | 'identity'
  | 'skill'
  | 'rule'
  | 'mcp'
  | 'command'
  | 'agent'
  | 'memory';

/** 库内准则（frontmatter 解析后 + 正文） */
export interface CriterionAsset {
  slug: string;
  relativePath: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  appliesTo: CriterionAppliesTo[];
  source?: string;
  body: string;
}

/** 内置业内准则包模板元数据（不含正文，UI 勾选导入用） */
export interface CriteriaPackTemplate {
  slug: string;
  name: string;
  description: string;
  priority: number;
  appliesTo: CriterionAppliesTo[];
  source: string;
}

/** 准则包导入结果 */
export interface CriteriaPackImportResult {
  inserted: string[];
  rejected: string[];
}

// ========== 冲突仲裁（add-llm-conflict-arbitration） ==========

/** 仲裁可受理的资产类别（与后端 ARBITRATION_CATEGORIES 闭集对齐） */
export type ArbitrationRequestCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'memory';

export type ArbitrationDecision = 'keep-left' | 'keep-right' | 'merge' | 'manual-review';

export interface ArbitrationRequest {
  category: ArbitrationRequestCategory;
  /** 左侧（导入源）文件绝对路径 */
  leftPath: string;
  /** 右侧（Hub 现有）路径：Hub 相对路径或绝对路径 */
  rightPath: string;
  leftLabel?: string;
  rightLabel?: string;
}

export interface ArbitrationResponse {
  decision: ArbitrationDecision;
  rationale: string;
  /** 仅 decision==='merge' 时存在：可编辑合并草案 */
  mergedContent?: string;
  /** 本次参与裁决的准则 slug 清单 */
  criteriaUsed: string[];
  /** 因预算未参与的准则条数 */
  criteriaSkipped: number;
  /** 命中内容哈希缓存（未重复调模型） */
  cached: boolean;
  model: string;
  generatedAt: string;
}

// ========== 资产医生（add-asset-doctor Phase E） ==========

/** 医生服务的资产类别（与后端 DOCTOR_ASSET_KINDS 闭集对齐；mcp 一期不做） */
export type DoctorAssetKind = 'identity' | 'skill' | 'rule' | 'agent' | 'command' | 'memory';

export type DiagnosisOverall = 'healthy' | 'needs-attention' | 'at-risk';

export type DiagnosisSeverity = 'high' | 'medium' | 'low';

export interface DiagnosisIssue {
  severity: DiagnosisSeverity;
  /** 准则 slug；机械项为 'mechanical:<checkId>' */
  criterion: string;
  finding: string;
  suggestion: string;
  /** 是否可生成改写草案（Phase F 接入点） */
  fixable: boolean;
}

export type DiagnosisConfidence = 'high' | 'medium' | 'low';

/** 规则集覆盖的七类资产（比医生类别多 mcp） */
export type RuleAssetCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'command' | 'agent' | 'memory';

/** 规则类别：七类资产 + cross（跨资产通用，计数单列、不计入七类） */
export type DiagnosisRuleCategory = RuleAssetCategory | 'cross';

/** static = 零模型调用；llm = 语义增量 */
export type DiagnosisRuleMode = 'static' | 'llm';

/** 一条可稳定引用的检查项（add-diagnosis-rules T7） */
export interface DiagnosisRule {
  /** 稳定编号，如 SK-04；永不复用 */
  id: string;
  category: DiagnosisRuleCategory;
  /** category=cross 时列出适用类别 */
  appliesTo?: RuleAssetCategory[];
  severity: DiagnosisSeverity;
  mode: DiagnosisRuleMode;
  signal: string;
  recommendation: string;
  source: string;
}

/** GET /api/diagnosis/rules：规则清单与计数同源 */
export interface DiagnosisRuleListResponse {
  version: string;
  updatedAt: string;
  rules: DiagnosisRule[];
  counts: Record<DiagnosisRuleCategory, number>;
  modeCounts: Record<DiagnosisRuleMode, number>;
}

// ========== 规则来源与用户规则（refactor-governance-center T7） ==========

export type RuleOrigin = 'builtin' | 'user';

export type RuleLoadWarningReason =
  | 'missing-field'
  | 'invalid-category'
  | 'invalid-severity'
  | 'invalid-mode'
  | 'duplicate-id'
  | 'invalid-applies-to'
  | 'unparsable';

export interface RuleLoadWarning {
  originLabel: string;
  ruleId: string | null;
  reason: RuleLoadWarningReason;
}

export interface RuleWithOrigin extends DiagnosisRule {
  origin: RuleOrigin;
  overridesBuiltin: boolean;
  originLabel: string;
}

/** GET /api/diagnosis/rules 扩展视图（含用户规则来源时） */
export interface DiagnosisRuleListView extends DiagnosisRuleListResponse {
  rules: RuleWithOrigin[];
  sources: { builtinCount: number; userCount: number; overriddenRuleIds: string[] };
  loadPolicy: 'category-on-demand';
  userRules: { directory: string; loaded: number; warnings: RuleLoadWarning[] };
}

/** POST /api/diagnosis/rules/validate：保存前校验，零写库 */
export interface RuleValidateResponse {
  ok: boolean;
  errors: Array<{ line: number | null; ruleId: string | null; message: string }>;
  warnings: RuleLoadWarning[];
  effectiveRules: number;
}

/** GET /api/diagnosis/ignore 响应 */
export interface IgnoreListResponse {
  items: IgnoredFinding[];
  /** 内容已变更、自动失效的条数 */
  expired: number;
}

/** 问题来源：静态规则 / 模型语义 */
export type FindingSource = 'rule' | 'llm';

/** 证据：路径必须是库内相对路径；line 为 null 表示无法定位到行 */
export interface FindingEvidence {
  hubRelativePath: string;
  line: number | null;
  /** ≤200 字，必须能在原文中定位 */
  snippet: string;
  snippetIndex?: number;
}

/** 一条问题（add-diagnosis-rules 契约）：必须绑定规则编号 */
export interface RuleFinding {
  id: string;
  ruleId: string;
  severity: DiagnosisSeverity;
  confidence: DiagnosisConfidence;
  source: FindingSource;
  title: string;
  finding: string;
  /** AI 未参与时允许为空串 */
  impact: string;
  suggestion: string;
  evidence: FindingEvidence[];
  /** 证据不足：不计分、不可修复、不进建议 */
  insufficientEvidence: boolean;
  fixable: boolean;
  /** 命中忽略清单后仍返回，供「已忽略 N 条」入口使用 */
  ignored: boolean;
}

/** 忽略清单条目：按 ruleId + 库内路径 + 内容哈希绑定，内容变更后自动失效 */
export interface IgnoredFinding {
  ruleId: string;
  hubRelativePath: string;
  contentHash: string;
  ignoredAt: string;
}

/** POST /api/diagnosis/ignore 响应 */
export interface IgnoreFindingResponse {
  ignored: IgnoredFinding;
  /** 该规则在该资产上是否还有未忽略命中（按整条忽略，恒为 0） */
  remainingForRule: number;
}

/** DELETE /api/diagnosis/ignore 响应 */
export interface RestoreFindingResponse {
  ruleId: string;
  hubRelativePath: string;
  restored: boolean;
}

export interface DiagnosisSkippedReason {
  mode: 'static' | 'llm';
  reason: 'no-ai-config' | 'budget' | 'timeout';
  count: number;
}

/** 本轮查了什么、没查什么 */
export interface DiagnosisCoverage {
  evaluatedRules: number;
  skippedRules: number;
  skippedReasons: DiagnosisSkippedReason[];
}

export interface DiagnosisReport {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  overall: DiagnosisOverall;
  /** 优先读 findings；缺失时回退 issues（旧响应兼容） */
  findings?: RuleFinding[];
  issues: DiagnosisIssue[];
  rulesVersion?: string;
  coverage?: DiagnosisCoverage;
  criteriaUsed: string[];
  criteriaSkipped: number;
  cached: boolean;
  /** AI 未配置：仅机械项 + 配置引导（Scenario 7） */
  mechanicalOnly: boolean;
  aiEvaluated?: boolean;
  /** 模型输出被拒条数 */
  rejected?: number;
  model: string;
  generatedAt: string;
}

/** 上次诊断摘要（不含正文、不含绝对路径） */
export interface DoctorLastRunSummary {
  overall: DiagnosisOverall;
  issueCount: number;
  highSeverityCount: number;
  fixableCount: number;
  ignoredCount: number;
  /** true = 仅机械 / 静态结论，语义未评估 */
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  generatedAt: string;
}

/** GET /api/doctor/summary（零模型）：详情打开即用的上次结论 */
export interface DoctorSummaryResponse {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** false = 本机记录或资产内容读取失败；其余字段按未诊断处理 */
  available: boolean;
  state: 'never' | 'valid' | 'stale';
  lastRun: DoctorLastRunSummary | null;
  /** state='stale' 时的变化项 */
  staleReasons: Array<'content' | 'rules' | 'model'>;
  aiConfigured: boolean;
  /** 现在点「重新诊断」是否会产生模型调用（服务端判定，前端不得自行推断） */
  willCallModel: boolean;
}

/** GET /api/doctor/estimate 响应（批量前预算护栏，Scenario 5） */
export interface DiagnoseEstimate {
  category: DoctorAssetKind;
  total: number;
  cacheHits: number;
  /** >50 前端二次确认 */
  willCall: number;
}

// ---------- 修复与分发（add-asset-doctor Phase F） ----------

/** POST /api/doctor/fix-draft 响应（Scenario 1：草案阶段库内零变化） */
export interface FixDraftResponse {
  /** 修订后的完整文件内容（可编辑后再 apply） */
  draftContent: string;
  /** 逐问题修复说明 */
  changeNotes: Array<{ issueIndex: number; note: string }>;
  /** 恒 false（超长后端直接拒绝）；字段保留与契约对齐 */
  contentTruncated: boolean;
  cached: boolean;
  model: string;
}

/** 单工具分发结果（swapId 供「回滚本次分发」） */
export interface DoctorDispatchItem {
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  swapId?: string;
}

/** POST /api/doctor/apply 请求：用户确认后写库 + 可选分发（Scenario 2-6） */
export interface DoctorApplyRequest {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 最终采纳内容（可能经用户编辑）；以用户版本为准 */
  finalContent: string;
  /** false = 只改库不分发（Scenario 6） */
  distribute: boolean;
  /** distribute=true 的目标工具；缺省 = 已安装该资产的全部工具 */
  targets?: string[];
}

/** POST /api/doctor/apply 响应（Scenario 2-6） */
export interface DoctorApplyResponse {
  saved: true;
  /** 旧版备份引用：「撤销本次修复」入口依据 */
  backupRef: string;
  dispatch: DoctorDispatchItem[];
  rollbackAvailable: boolean;
}

/** POST /api/doctor/undo 响应（Scenario 3：库内恢复旧版） */
export interface DoctorUndoResponse {
  restored: true;
  hubRelativePath: string;
}

// ========== 资产治理（add-asset-governance Phase H） ==========

export type HealthDimensionId = 'completeness' | 'quality' | 'distribution' | 'uniqueness';

export type DimensionApplicability = 'applicable' | 'not-applicable' | 'data-missing';

export type HealthGrade = 'empty' | 'at-risk' | 'needs-attention' | 'good' | 'excellent';

/** 健康卡问题摘要；完整清单走 /api/governance/issues */
export interface HealthIssueRef {
  id: string;
  severity: DiagnosisSeverity;
  title: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  fixable: boolean;
  /** 问题来源（质量中心追加，可选）：rule = 机械/静态，llm = 语义 */
  source?: FindingSource;
}

// ========== 质量中心概览（refactor-governance-center T2） ==========

export type ClusterKeySource = 'rule' | 'title';

export interface QualityClusterAssetRef {
  hubRelativePath: string;
  assetName: string;
  kind: DoctorAssetKind;
  severity: DiagnosisSeverity;
  confidence: DiagnosisConfidence;
  source: FindingSource;
  fixable: boolean;
  ignored: boolean;
  deepLink: string;
}

export interface QualityIssueCluster {
  key: string;
  keySource: ClusterKeySource;
  ruleId: string | null;
  title: string;
  category: string;
  severity: DiagnosisSeverity;
  mode: 'static' | 'llm';
  assetCount: number;
  hitCount: number;
  severityDistribution: Record<DiagnosisSeverity, number>;
  fixableAssetCount: number;
  estimatedCalls: number;
  cachedCount: number;
  impactScore: number;
  samples: QualityClusterAssetRef[];
}

export interface QualityCoverage {
  rulesVersion: string;
  evaluatedRules: number;
  skippedRules: number;
  skippedReasons: Array<{ reason: string; count: number }>;
  noChannelRules: number;
  ignoredCount: number;
  semanticEvaluated: boolean;
}

/** GET /api/governance/overview */
export interface QualityOverview {
  health: GovernanceHealth;
  clusters: QualityIssueCluster[];
  sortRule: 'impact-desc-calls-asc';
  pendingTotal: number;
  coverage: QualityCoverage;
  generatedAt: string;
  cached: boolean;
}

export interface HealthDimension {
  id: HealthDimensionId;
  label: string;
  applicability: DimensionApplicability;
  weight: number;
  effectiveWeight: number;
  /** not-applicable / data-missing 时为 null */
  score: number | null;
  evaluatedAssets: number;
  issueCount: number;
  topIssues: HealthIssueRef[];
}

/** GET /api/governance/health?refresh=0|1 */
export interface GovernanceHealth {
  score: number;
  grade: HealthGrade;
  totalAssets: number;
  dimensions: HealthDimension[];
  qualityMode: 'mechanical+ai' | 'mechanical-only';
  computedAt: string;
  cached: boolean;
}

/** GET /api/governance/issues */
export interface GovernanceIssueList {
  dimension: HealthDimensionId;
  total: number;
  items: HealthIssueRef[];
}

export interface GovernanceIssueQuery {
  dimension: HealthDimensionId;
  severityFloor?: DiagnosisSeverity;
  limit?: number;
  offset?: number;
}

// ========== 跨类别批量诊断（refactor-governance-center T4/T5） ==========

export type UnDiagnosableReason = 'env-asset' | 'unreadable' | 'unsupported-kind' | 'rule-load-failed';

export interface BatchDiagnoseEstimateRequest {
  kinds?: DoctorAssetKind[];
  clusterKeys?: string[];
  ruleIds?: string[];
}

/** POST /api/governance/diagnose/estimate 的响应（零模型零写库） */
export interface BatchDiagnoseEstimate {
  totalAssets: number;
  cacheHits: number;
  willCall: number;
  semanticSkipped: number;
  unDiagnosable: Array<{ hubRelativePath: string; kind: DoctorAssetKind; reason: UnDiagnosableReason }>;
  ruleCoverage: Array<{ kind: DoctorAssetKind; evaluatedRules: number; skippedRules: number }>;
  rulesVersion: string;
  /** 执行目标清单：前端据此逐资产发起诊断，不自行重算口径 */
  targets: Array<{ kind: DoctorAssetKind; hubRelativePath: string }>;
  limits: { maxAssets: number; confirmAboveCalls: number; hardMaxCalls: number };
  estimatedAt: string;
}

// ========== 首页行动面板（refactor-home-action-panel Phase 0） ==========

/** 工具行状态（与后端 routes/home.ts 闭集一致） */
export type HomeToolState =
  /** 已启用，分发索引判定无 conflict / pending */
  | 'synced'
  /** 已启用，但存在 conflict 或 pending */
  | 'drift'
  /** 已安装，但 hub 配置未启用 */
  | 'not_connected'
  /** 未安装 */
  | 'not_installed'
  /** 该工具分发状态读取失败（partial） */
  | 'unknown';

/** 工具与同步矩阵的一行 */
export interface HomeToolRow {
  toolId: string;
  toolName: string;
  state: HomeToolState;
  /** conflict + pending 的资产数；state='unknown' 时为 null（不填 0） */
  driftAssetCount: number | null;
  /** 最近一次同步时间；null = 尚无同步记录 */
  lastSyncedAt: string | null;
}

/** 今日待办队列（已跨维度去重、按严重度降序） */
export interface HomeIssueQueue {
  /** false = 资产快照读取失败；此时 total/bySeverity 为 null、items 为空数组 */
  available: boolean;
  /** 去重后的待治理条目总数（= 状态条「待治理」） */
  total: number | null;
  /** available=false 时为 null */
  bySeverity: Record<DiagnosisSeverity, number> | null;
  /** 严重度降序前 issuesLimit 条 */
  items: HealthIssueRef[];
}

/** 状态条四个数字（null 表示「暂不可用」，不得渲染为 0） */
export interface HomeStatusNumbers {
  /** null = 尚未算出或读取失败 */
  healthScore: number | null;
  /** 'empty' 表示库内无可评估资产（界面显示「待盘点」） */
  healthGrade: HealthGrade | null;
  totalAssets: number | null;
  /** 分发一致性问题数（资产 × 工具）；null = 分发索引不可用或该维度数据缺失 */
  unsyncedCount: number | null;
  lastBackupAt: string | null;
  backupState: 'recorded' | 'none' | 'unavailable';
}

/** GET /api/home/dashboard 响应 */
export interface HomeDashboardResponse {
  /** ISO 时间戳，本次聚合快照时间 */
  generatedAt: string;
  /** false = 库为空/未初始化：首页进入库为空态 */
  hubInitialized: boolean;
  status: HomeStatusNumbers;
  issues: HomeIssueQueue;
  /** 受支持工具全集（含未安装），未安装行置灰 */
  tools: HomeToolRow[];
  /** 最近变化，固定最多 5 条，时间倒序 */
  recentActivity: ActivityEntry[];
  /** 最近一次体检时间；null = 从未算过 */
  healthComputedAt: string | null;
  /** true = 至少一个工具读取失败 */
  partial: boolean;
  failedTools: string[];
}

/** 待办行「去资产库修改」路径（前端常量，非接口） */
export type HomeFixTargetPath =
  | '/vault/identity'
  | '/vault/skill'
  | '/vault/rule'
  | '/vault/mcp'
  | '/vault/agent'
  | '/vault/memory'
  | '/vault';

/** kind → 路径；未建类别页的 kind 回退 /vault */
export type HomeFixTargetResolver = (kind: DoctorAssetKind) => HomeFixTargetPath;

// ========== 一键整改（add-asset-governance Phase I） ==========

export interface RemediationPlanRequest {
  kinds?: DoctorAssetKind[];
  dimension?: HealthDimensionId;
  maxAssets?: number;
  /** 只处理命中这些规则的可修复项（refactor-governance-center T6） */
  ruleIds?: string[];
  /** 来自问题聚类圈选的聚类 key，仅回传来源，不参与过滤 */
  clusterKeys?: string[];
}

export interface RemediationPlanItem {
  id: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  issueIndexes: number[];
  /** 本项涉及的规则编号（去重） */
  ruleIds: string[];
  issueSummary: string;
  severity: DiagnosisSeverity;
  /** 0 = 草案命中缓存（不消耗调用）；1 = 需一次草案调用 */
  estimatedCalls: 0 | 1;
  cached: boolean;
}

export interface RemediationSkipItem {
  hubRelativePath: string;
  assetName: string;
  reason: string;
}

export interface RemediationPlan {
  items: RemediationPlanItem[];
  skipped: RemediationSkipItem[];
  totalAssets: number;
  estimatedCalls: number;
  truncated: boolean;
  batchLimit: number;
  /** 类别分布（影响清单摘要） */
  kindDistribution: Partial<Record<DoctorAssetKind, number>>;
  /** 有可修复项但因维度 / 规则过滤被排除的资产数 */
  nonBatchableCount: number;
  generatedAt: string;
}

export interface RemediationApplyRequest {
  itemIds: string[];
  distribute: boolean;
  targets?: string[];
  /** 与 plan 使用同一规则过滤，否则 itemId 对不上（T6） */
  ruleIds?: string[];
}

export interface RemediationApplyItemResult {
  itemId: string;
  hubRelativePath: string;
  status: 'fixed' | 'failed' | 'skipped';
  backupRef?: string;
  reason?: string;
}

export interface RemediationApplyResponse {
  batchId: string;
  results: RemediationApplyItemResult[];
  succeeded: number;
  failed: number;
  skipped: number;
  rollbackAvailable: boolean;
}

export interface RemediationUndoResponse {
  restored: string[];
  failures: Array<{ hubRelativePath: string; reason: string }>;
}

// ========== 重复治理（add-asset-governance Phase K） ==========

export type DuplicateKind = 'exact' | 'near' | 'gray';

export interface DuplicateMember {
  hubRelativePath: string;
  name: string;
  toolSources: string[];
  bodyLength: number;
  modifiedAt: string;
  contentHash: string;
}

export interface DuplicateGroupView {
  id: string;
  kind: DuplicateKind;
  category: DoctorAssetKind;
  similarity: number;
  members: DuplicateMember[];
  suggestedKeep: string;
  reason: string;
}

export interface DuplicateScanRequest {
  categories?: DoctorAssetKind[];
  similarityThreshold?: number;
  useAiJudgement?: boolean;
}

export interface DuplicateScanResponse {
  groups: DuplicateGroupView[];
  scannedAssets: number;
  grayCount: number;
  aiUsed: boolean;
  /** 灰区组将调用的模型次数（扫描本身零模型调用） */
  estimatedAiCalls?: number;
  generatedAt: string;
}

export interface DuplicateMergeDraftRequest {
  groupId: string;
  keepPath: string;
  allowGray?: boolean;
}

export interface DuplicateMergeDraftResponse {
  groupId: string;
  keepPath: string;
  draftContent: string;
  unifiedDiff: string;
  archivePaths: string[];
  cached: boolean;
  model: string;
}

export interface DuplicateApplyRequest {
  groupId: string;
  keepPath: string;
  finalContent: string;
  archiveMembers: string[];
  distribute: boolean;
  targets?: string[];
  allowGray?: boolean;
}

export interface DuplicateApplyResponse {
  groupId: string;
  keepPath: string;
  backupRef: string;
  archived: Array<{ from: string; to: string; status: 'archived' | 'failed'; reason?: string }>;
  dispatch: Array<{ tool: string; action: string; reason?: string }>;
  rollbackAvailable: boolean;
}

export interface DuplicateUndoResponse {
  restored: string[];
  keepRestored: boolean;
  failures: Array<{ hubRelativePath: string; reason: string }>;
}

// ========== 主动性建议（add-asset-governance Phase L） ==========

export type SuggestionId = 'duplicates' | 'completeness' | 'quality' | 'distribution' | 'ai-config';

export interface SuggestionAction {
  label: string;
  route: string;
  intent?: 'open-remediation';
}

export interface GovernanceSuggestionItem {
  id: SuggestionId;
  executable: boolean;
  title: string;
  reason: string;
  scale: { assets: number; estimatedCalls: number };
  action: SuggestionAction;
  impact: number;
}

export interface FirstRunBriefing {
  headline: string;
  stats: { assetCount: number; duplicateCount: number; missingInfoCount: number };
  primary: SuggestionAction;
  secondary: { label: string };
  clean: boolean;
}

/** GET /api/governance/suggestions（本地生成，零模型调用） */
export interface GovernanceSuggestionsResponse {
  suggestions: GovernanceSuggestionItem[];
  info: Array<{ id: string; text: string }>;
  firstRun: FirstRunBriefing | null;
  aiConfigured: boolean;
  emptyMessage: string | null;
}

// ========== 首次使用向导（add-zero-config-onboarding） ==========

/** 向导步骤闭集（与原型 s0–s6 对应） */
export type OnboardingStepId =
  | 'welcome'
  | 'scan'
  | 'result'
  | 'collect'
  | 'doctor'
  | 'distribute'
  | 'done';

export interface OnboardingToolSummary {
  toolId: string;
  displayName: string;
  installed: boolean;
  configDir: string;
}

export interface OnboardingStateResponse {
  hubRoot: string;
  initialized: boolean;
  onboarded: boolean;
  autoEnter: boolean;
  assetCount: number;
  lastOutcome: { outcome: 'completed' | 'skipped'; step: OnboardingStepId; at: string } | null;
  tools: OnboardingToolSummary[];
}

export interface OnboardingStartResponse {
  created: string[];
  skipped: string[];
  state: OnboardingStateResponse;
}

export interface OnboardingCompleteResponse {
  ok: boolean;
  persisted: boolean;
  state: OnboardingStateResponse;
}

/** 盘点洞察分组（重复 / 内容不一致 / 覆盖不全） */
export interface OnboardingInsightCopy {
  tool: string;
  path: string;
  size: number;
  modified: string;
  contentHash?: string;
}

export interface OnboardingInsightGroup {
  category: string;
  name: string;
  hubTargetPath: string;
  tools: string[];
  distinctVersions: number;
  comparedCopies: number;
  /** 每个副本的落点与版本（结果页「查看详情」） */
  copies?: OnboardingInsightCopy[];
}

export interface OnboardingInsights {
  duplicateGroups: OnboardingInsightGroup[];
  versionMismatchGroups: OnboardingInsightGroup[];
  coverageGroups: OnboardingInsightGroup[];
  installedTools: string[];
}

export interface ScanWithInsights {
  inventories: ToolInventory[];
  insights?: OnboardingInsights;
}

/** POST /api/sync/run?backup=1 的响应扩展 */
export interface SyncRunResponse {
  results: SyncResult[];
  backupRef?: string | null;
  backupWarnings?: string[];
}

/** 分发四分类（纯函数 onboarding-distribute 派生） */
export type DistributeAction = 'create' | 'overwrite' | 'conflict' | 'unchanged';


