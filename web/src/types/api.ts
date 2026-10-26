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
  /** 仲裁合并草案：仅 strategy==='merge' 且非空白时后端以此为准落盘 */
  mergeDraft?: string;
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
  /** 项目级工具（syncStrategy='per-project'），前端据此渲染能力说明而非六类徽章（D3/I7） */
  projectLevel: boolean;
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
export type DoctorAssetKind = 'identity' | 'skill' | 'rule' | 'agent' | 'command';

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

export interface DiagnosisReport {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  overall: DiagnosisOverall;
  issues: DiagnosisIssue[];
  criteriaUsed: string[];
  criteriaSkipped: number;
  cached: boolean;
  /** AI 未配置：仅机械项 + 配置引导（Scenario 7） */
  mechanicalOnly: boolean;
  model: string;
  generatedAt: string;
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
