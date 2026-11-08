/**
 * MCP 工具公共类型与依赖注入契约（add-asset-governance J2/J3）
 *
 * 稳健起见把类型从处理器中拆出，保持单文件 ≤300 行。
 */

import type { DiagnosisIssue, DoctorAssetKind, DiagnosisOverall } from './types.js';
import type { DistributionStatus } from './distribution-status.js';
import type { GovernanceHealth, HealthIssueRef, HealthGrade, HealthDimensionId, DimensionApplicability } from './governance-health.js';
import type { PendingChangeStore } from './mcp-pending.js';

/** 单个资产正文返回上限：超出截断并标注 truncated */
export const ASSET_CONTENT_LIMIT = 8000;

export interface McpIdentityGetResult {
  content: string;
  hubRelativePath: string;
  versionHash: string;
  updatedAt: string;
}

export interface McpAssetsListInput {
  kind?: DoctorAssetKind;
  limit?: number;
}

export interface McpAssetSummary {
  name: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  diagnosisOverall: DiagnosisOverall | 'unknown';
  distribution: Array<{ toolId: string; status: DistributionStatus }>;
}

export interface McpAssetGetInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
}

export interface McpAssetGetResult {
  content: string;
  hubRelativePath: string;
  truncated: boolean;
}

export interface McpAssetDiagnoseInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  useAi?: boolean;
}

export interface McpAssetDiagnoseResult {
  overall: DiagnosisOverall;
  issues: DiagnosisIssue[];
  mechanicalOnly: boolean;
  aiUsed: boolean;
}

export interface McpAssetProposeInput {
  kind: DoctorAssetKind;
  mode: 'create' | 'update';
  hubRelativePath?: string;
  content: string;
  rationale?: string;
}

export interface McpAssetProposeResult {
  pendingChangeId: string;
  mode: 'create' | 'update';
  hubRelativePath: string;
  previewContent: string;
  unifiedDiff: string;
  expiresAt: string;
}

export interface McpAssetCommitInput {
  pendingChangeId: string;
  distribute?: boolean;
  targets?: string[];
}

export interface DoctorDispatchItem {
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  swapId?: string;
}

export interface McpAssetCommitResult {
  saved: true;
  hubRelativePath: string;
  backupRef: string;
  dispatch: DoctorDispatchItem[];
}

/** 健康分摘要来源（由 Node 层装配，core 只读） */
export interface McpHealthSource {
  health: GovernanceHealth;
  issues: HealthIssueRef[];
}

export interface McpHealthSummary {
  score: number;
  grade: HealthGrade;
  totalAssets: number;
  qualityMode: GovernanceHealth['qualityMode'];
  computedAt: string;
  cached: boolean;
  dimensions: Array<{
    id: HealthDimensionId;
    label: string;
    score: number | null;
    weight: number;
    effectiveWeight: number;
    applicability: DimensionApplicability;
    issueCount: number;
  }>;
  topIssues: HealthIssueRef[];
}

export interface McpToolDeps {
  /** 路径是否在本机 Hub 内（拒绝越界） */
  isHubInternalPath(hubRelativePath: string): boolean;
  fileExists(hubRelativePath: string): boolean;
  readIdentity(): { content: string; hubRelativePath: string; updatedAt: string } | null;
  listAssets(input: McpAssetsListInput): McpAssetSummary[] | Promise<McpAssetSummary[]>;
  readAsset(hubRelativePath: string): string | null;
  health(): McpHealthSource | Promise<McpHealthSource>;
  diagnose(input: McpAssetDiagnoseInput): Promise<McpAssetDiagnoseResult>;
  pending: PendingChangeStore;
  commit: {
    /** 写前备份，返回可供撤销的引用；目标不存在时抛错 */
    backup(hubRelativePath: string): string;
    write(hubRelativePath: string, content: string): void;
    distribute(hubRelativePath: string, targets?: string[]): Promise<DoctorDispatchItem[]>;
  };
}

export interface McpToolHandlers {
  identityGet(): McpIdentityGetResult;
  assetsList(input: McpAssetsListInput): Promise<{ items: McpAssetSummary[]; total: number }>;
  assetGet(input: McpAssetGetInput): McpAssetGetResult;
  healthGet(): Promise<McpHealthSummary>;
  assetDiagnose(input: McpAssetDiagnoseInput): Promise<McpAssetDiagnoseResult>;
  assetPropose(input: McpAssetProposeInput): McpAssetProposeResult;
  assetCommit(input: McpAssetCommitInput): Promise<McpAssetCommitResult>;
}
