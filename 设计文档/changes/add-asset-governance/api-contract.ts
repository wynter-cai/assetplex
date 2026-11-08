/**
 * api-contract: add-asset-governance
 *
 * 对应 specs/ 四个 capability。DiagnosisIssue / DiagnosisOverall / DoctorAssetKind
 * 语义来自 src/core/types.ts；分发结果沿用 add-asset-doctor 的 DoctorDispatchItem。
 * 禁止 any；实现落 src/core/governance-*.ts + duplicates.ts + src/server/routes/governance.ts + src/mcp/。
 */

type DoctorAssetKind = 'identity' | 'skill' | 'rule' | 'agent' | 'command' | 'memory';

interface DoctorDispatchItem {
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  swapId?: string;
}

// ============ 健康分（specs/asset-health-score.spec.md）============

export type HealthDimensionId = 'completeness' | 'quality' | 'distribution' | 'uniqueness';

/** not-applicable：无评估对象，权重剔除；data-missing：读取失败，降级展示不伪造分数 */
export type DimensionApplicability = 'applicable' | 'not-applicable' | 'data-missing';

export type HealthGrade = 'empty' | 'at-risk' | 'needs-attention' | 'good' | 'excellent';

export interface HealthIssueRef {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  fixable: boolean;
}

export interface HealthDimension {
  id: HealthDimensionId;
  label: string;
  applicability: DimensionApplicability;
  /** 声明权重：完整性 30 / 规范性 30 / 分发一致性 25 / 唯一性 15 */
  weight: number;
  effectiveWeight: number;
  /** 0-100；not-applicable 时为 null，禁止用 0 代替 */
  score: number | null;
  evaluatedAssets: number;
  issueCount: number;
  /** 最多 5 条，完整清单走 /api/governance/issues */
  topIssues: HealthIssueRef[];
}

/** GET /api/governance/health?refresh=0|1（refresh=1 须先返回估算再执行） */
export interface GovernanceHealth {
  /** totalAssets=0 时为 0 且 grade=empty，前端不展示分数 */
  score: number;
  grade: HealthGrade;
  totalAssets: number;
  dimensions: HealthDimension[];
  qualityMode: 'mechanical+ai' | 'mechanical-only';
  computedAt: string;
  cached: boolean;
}

/** GET /api/governance/issues?dimension=&severityFloor=&limit=&offset= */
export interface GovernanceIssueList {
  dimension: HealthDimensionId;
  total: number;
  items: HealthIssueRef[];
}

// ============ 一键整改（specs/asset-health-score.spec.md Scenario 7-9）============

export interface RemediationPlanRequest {
  kinds?: DoctorAssetKind[];
  dimension?: HealthDimensionId;
  /** 默认 20，服务端硬上限 20 */
  maxAssets?: number;
}

export interface RemediationPlanItem {
  id: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  /** 对应 DiagnosisReport.issues 下标 */
  issueIndexes: number[];
  issueSummary: string;
  severity: 'high' | 'medium' | 'low';
  /** 0 = 全部命中缓存；1 = 需一次草案调用 */
  estimatedCalls: 0 | 1;
  cached: boolean;
}

/** 不可整改项必须给原因，不能静默丢弃 */
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
  generatedAt: string;
}

export interface RemediationApplyRequest {
  itemIds: string[];
  /** 默认 false 只改库；true 时按 targets 或已安装工具分发 */
  distribute: boolean;
  targets?: string[];
}

export interface RemediationApplyItemResult {
  itemId: string;
  hubRelativePath: string;
  status: 'fixed' | 'failed' | 'skipped';
  backupRef?: string;
  dispatch?: DoctorDispatchItem[];
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

export interface RemediationUndoRequest {
  batchId: string;
}

export interface RemediationUndoResponse {
  restored: string[];
  failures: Array<{ hubRelativePath: string; reason: string }>;
}

// ============ 主动性建议（specs/proactive-guidance.spec.md）============

export type SuggestionKind = 'dedup' | 'fix-issues' | 'distribute' | 'configure-ai' | 'connect-mcp' | 'info';

/** 只能指向既有流程，不引入新确认步骤 */
export type SuggestionAction =
  | { type: 'open-duplicates'; payload: { category?: DoctorAssetKind } }
  | { type: 'open-remediation'; payload: { dimension?: HealthDimensionId; itemIds?: string[] } }
  | { type: 'open-distribution'; payload: { toolId?: string } }
  | { type: 'open-settings'; payload: { section: 'ai' } }
  | { type: 'open-mcp-guide'; payload: Record<string, never> };

export interface GovernanceSuggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  rationale: string;
  impact: { assetCount: number; estimatedCalls: number };
  /** false = 信息项，最多 1 条且不占前三条 */
  executable: boolean;
  action: SuggestionAction;
}

/** GET /api/governance/suggestions：最多 3 条可执行 + 至多 1 条信息项 */
export interface GovernanceSuggestions {
  suggestions: GovernanceSuggestion[];
  generatedAt: string;
}

// ============ 重复治理（specs/duplicate-governance.spec.md）============

export type DuplicateKind = 'exact' | 'near' | 'gray';

export interface DuplicateMember {
  hubRelativePath: string;
  name: string;
  toolSources: string[];
  bodyLength: number;
  modifiedAt: string;
  /** 归一化正文哈希 */
  contentHash: string;
}

export interface DuplicateGroup {
  id: string;
  kind: DuplicateKind;
  category: DoctorAssetKind;
  /** 0-1；exact 恒为 1 */
  similarity: number;
  members: DuplicateMember[];
  /** 必须属于 members */
  suggestedKeep: string;
  reason: string;
}

export interface DuplicateScanRequest {
  categories?: DoctorAssetKind[];
  /** 默认 0.85 */
  similarityThreshold?: number;
  /** true 时才为灰区组调用模型（前端先估算） */
  useAiJudgement?: boolean;
}

export interface DuplicateScanResponse {
  groups: DuplicateGroup[];
  scannedAssets: number;
  /** 灰区待人工判断组数，不进入可执行列表 */
  grayCount: number;
  aiUsed: boolean;
  generatedAt: string;
}

/** 零写库 */
export interface DuplicateMergeDraftRequest {
  groupId: string;
  keepPath: string;
}

export interface DuplicateMergeDraftResponse {
  groupId: string;
  keepPath: string;
  draftContent: string;
  unifiedDiff: string;
  /** 将被归档（不删除）的成员路径 */
  archivePaths: string[];
  cached: boolean;
  model: string;
}

export interface DuplicateApplyRequest {
  groupId: string;
  keepPath: string;
  finalContent: string;
  /** 必须与草案 archivePaths 一致，防误归档 */
  archiveMembers: string[];
  distribute: boolean;
  targets?: string[];
}

export interface DuplicateApplyResponse {
  groupId: string;
  keepPath: string;
  backupRef: string;
  archived: Array<{ from: string; to: string; status: 'archived' | 'failed'; reason?: string }>;
  dispatch: DoctorDispatchItem[];
  rollbackAvailable: boolean;
}

export interface DuplicateUndoRequest {
  groupId: string;
}

export interface DuplicateUndoResponse {
  restored: string[];
  keepRestored: boolean;
  failures: Array<{ hubRelativePath: string; reason: string }>;
}

// MCP 工具契约见同目录 mcp-contract.ts（specs/mcp-entry.spec.md）

/**
 * HTTP 错误约定（沿用 { error }）：
 * - 400 入参非法 / 超批次上限 / archiveMembers 与计划不一致
 * - 403 路径越出 Hub / 环境条目不可写
 * - 404 资产 / 分组 / 批次不存在
 * - 409 pendingChangeId 已过期（仅 MCP）
 * - 422 模型输出非法，失败隔离不落库
 * - 503 AI 未配置但动作强制要求模型
 */
