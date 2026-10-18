/**
 * api-contract: add-asset-doctor
 *
 * 与 specs/ 两 capability 一一对应。准则相关类型复用 add-llm-conflict-arbitration
 * 的 api-contract.ts（CriterionAsset / criteriaUsed / criteriaSkipped 语义一致）。
 * 禁止 any；实现落 src/core/doctor.ts + src/server/routes/doctor.ts。
 */

/** 与 src/core/swap-types.ts 的 SwapCategory 对齐（契约文档独立可读，不真实 import） */
type SwapCategory = 'identity' | 'rule' | 'skill' | 'mcp' | 'memory' | 'agent';

/** 医生服务的资产类别（mcp 一期不做模型诊断，见 proposal 非目标） */
export type DoctorAssetKind = Extract<SwapCategory, 'identity' | 'skill' | 'rule' | 'agent'> | 'command';

// ============ 诊断（specs/asset-diagnosis.spec.md）============

export type DiagnosisSeverity = 'high' | 'medium' | 'low';

/** 结论闭集（Scenario 8：其余一律解析失败） */
export type DiagnosisOverall = 'healthy' | 'needs-attention' | 'at-risk';

/** 确定性预检清单（Scenario 3 / proposal D6，机械判定不烧 token，可扩展） */
export type MechanicalCheckId =
  | 'frontmatter-missing-field' // 必填字段缺失（name/description 按类别）
  | 'description-empty' // 触发描述为空
  | 'body-over-length' // 正文超类别阈值（超长警示与草案禁用联动，fix spec Scenario 7）
  | 'shouting-rules'; // 全大写强调滥用

export interface DiagnosisIssue {
  severity: DiagnosisSeverity;
  /** 引用准则 slug；机械项为固定 'mechanical:<checkId>' */
  criterion: string;
  /** 哪里有问题（人类可读中文） */
  finding: string;
  /** 怎么改 */
  suggestion: string;
  /** 是否可生成改写草案 */
  fixable: boolean;
}

export interface DiagnoseRequest {
  kind: DoctorAssetKind;
  /** 相对 Hub 根路径，如 'skills/handoff/SKILL.md'；仅限库内资产（环境条目 403） */
  hubRelativePath: string;
}

/** POST /api/doctor/diagnose 响应 */
export interface DiagnosisReport {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  overall: DiagnosisOverall;
  issues: DiagnosisIssue[];
  /** 本次进入 prompt 的准则 slug */
  criteriaUsed: string[];
  /** 因 appliesTo/预算未参与的条数 */
  criteriaSkipped: number;
  /** 机械项与模型项混合，全部来自缓存才为 true */
  cached: boolean;
  /** AI 未配置时为 true：仅含机械 issues，前端展示配置引导（Scenario 7） */
  mechanicalOnly: boolean;
  model: string;
  generatedAt: string;
}

/** GET /api/doctor/estimate?category= 批量前预算估算（Scenario 5 / proposal D5） */
export interface DiagnoseEstimate {
  category: DoctorAssetKind;
  /** 库内该类别资产总数 */
  total: number;
  /** 已有缓存报告（不消耗调用） */
  cacheHits: number;
  /** 预计实际调用数 = total - cacheHits；>50 前端要求二次确认 */
  willCall: number;
}

// ============ 修复与分发（specs/fix-and-distribute.spec.md）============

/** POST /api/doctor/fix-draft 请求：对选中问题生成草案（不写库） */
export interface FixDraftRequest {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 要修复的 issues 下标（子集）；全部已修复或纯建议项拒绝 400 */
  issueIndexes: number[];
}

/** 草案响应：库内零变化，仅回文本（Scenario 1） */
export interface FixDraftResponse {
  /** 修订后的完整文件内容（可编辑后再 apply） */
  draftContent: string;
  /** 逐问题修复说明：对应哪条建议改在哪 */
  changeNotes: Array<{ issueIndex: number; note: string }>;
  /** 原文超出审视范围时为 true：前端禁用应用并警示（Scenario 7） */
  contentTruncated: boolean;
  cached: boolean;
  model: string;
}

/** POST /api/doctor/apply 请求：用户确认后写库 + 可选分发（Scenario 2-6） */
export interface DoctorApplyRequest {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 最终采纳内容（可能经用户编辑）；服务端与草案哈希不一致也接受——以用户版本为准 */
  finalContent: string;
  /** false = 只改库不分发（Scenario 6） */
  distribute: boolean;
  /** distribute=true 时的目标工具（缺省 = 已安装该资产的全部工具） */
  targets?: string[];
}

/** 分发执行使用 swap 既有类型（不另建通道，proposal D2） */
export type DoctorDispatchItem = {
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  /** 写入成功时回传本次 swap 执行 id，供「回滚本次分发」入口调用 /api/swap/rollback */
  swapId?: string;
};

/** apply 响应：写库结果 + 逐工具分发结果如实回报 */
export interface DoctorApplyResponse {
  saved: true;
  /** 旧版备份引用（库内撤销入口用，Scenario 3） */
  backupRef: string;
  /** 未分发时为空数组；失败项含 swap 语义原因（Scenario 5） */
  dispatch: DoctorDispatchItem[];
  /** 整体回滚可用性（任一工具写成功即 true） */
  rollbackAvailable: boolean;
}

/**
 * 错误约定（沿用 { error }）：
 * - 400 AI 配置不完整（诊断/草案；机械-only 报告除外）/ issueIndexes 非法
 * - 403 hubRelativePath 指向非库内资产（环境条目不提供医生）
 * - 404 资产文件不存在
 * - 422 模型输出非法（overall/decision 闭集外、草案缺内容），失败隔离（Scenario 8）
 */
