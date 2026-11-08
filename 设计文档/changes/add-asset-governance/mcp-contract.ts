/**
 * mcp-contract: add-asset-governance
 *
 * MCP 工具入参/出参（specs/mcp-entry.spec.md）。
 * 工具实现落 src/mcp/，内部复用 core；本文件只定义契约，不做真实 import。
 * 禁止 any。
 */

type DoctorAssetKind = 'identity' | 'skill' | 'rule' | 'agent' | 'command' | 'memory';
type DiagnosisOverall = 'healthy' | 'needs-attention' | 'at-risk';
type DistributionStatus = 'synced' | 'pending' | 'conflict' | 'not_enabled' | 'not_installed';

interface DiagnosisIssue {
  severity: 'high' | 'medium' | 'low';
  criterion: string;
  finding: string;
  suggestion: string;
  fixable: boolean;
}

interface DoctorDispatchItem {
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  swapId?: string;
}

/** 全部工具失败时返回的结构化错误（宿主不崩） */
export interface McpToolError {
  code: 'INVALID_INPUT' | 'NOT_FOUND' | 'OUT_OF_HUB' | 'STALE_PENDING' | 'AI_UNAVAILABLE' | 'IO_FAILED';
  error: string;
  hint: string;
}

// ============ 只读工具 ============

export interface McpIdentityGetResult {
  content: string;
  hubRelativePath: string;
  /** 内容哈希，供 Agent 判断是否需要重新读取 */
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
  /** 未诊断过为 unknown，不得伪造成 healthy */
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
  /** 超出返回上限时为 true */
  truncated: boolean;
}

export interface McpAssetDiagnoseInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 默认 false：只跑机械项，零模型调用 */
  useAi?: boolean;
}

export interface McpAssetDiagnoseResult {
  overall: DiagnosisOverall;
  issues: DiagnosisIssue[];
  mechanicalOnly: boolean;
  aiUsed: boolean;
}

// ============ 两段式写入 ============

/** 第一段：零写库，返回 pendingChangeId（TTL 10 分钟） */
export interface McpAssetProposeInput {
  kind: DoctorAssetKind;
  mode: 'create' | 'update';
  /** update 时必填；create 时由服务端生成安全路径 */
  hubRelativePath?: string;
  /** 完整文件内容（含 frontmatter） */
  content: string;
  /** 给用户看的一句话理由 */
  rationale?: string;
}

export interface McpAssetProposeResult {
  pendingChangeId: string;
  mode: 'create' | 'update';
  hubRelativePath: string;
  previewContent: string;
  unifiedDiff: string;
  /** 过期后 commit 必须重新 propose */
  expiresAt: string;
}

/** 第二段：凭 id 落盘，写前备份；默认不分发 */
export interface McpAssetCommitInput {
  pendingChangeId: string;
  /** 默认 false：只写 Hub，不碰工具目录 */
  distribute?: boolean;
  targets?: string[];
}

export interface McpAssetCommitResult {
  saved: true;
  hubRelativePath: string;
  backupRef: string;
  dispatch: DoctorDispatchItem[];
}
