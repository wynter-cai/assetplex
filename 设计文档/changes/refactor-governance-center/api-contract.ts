/**
 * api-contract: refactor-governance-center
 *
 * 对应 specs/governance-center.spec.md 八个 Requirement。
 * 本文件只做契约声明，不真实 import；实现落：
 * - src/core/quality-overview.ts（聚类与排序纯函数）
 * - src/server/routes/governance.ts（overview / issues 扩展）
 * - src/server/routes/governance-batch.ts（跨类别诊断预估）
 * - src/core/governance-remediation.ts + src/server/routes/remediation.ts（计划按规则过滤）
 * - src/server/routes/diagnosis.ts（规则列表扩展 / 校验；依赖 add-diagnosis-rules T4-T5）
 *
 * ============ 复用声明（语义以现有实现为准，本文件不重定义） ============
 *
 * 只读 / 聚合
 * - GET  /api/governance/health           GovernanceHealth（四维健康分）
 * - GET  /api/governance/issues           单维度问题清单（本变更逐项补 ruleId / confidence / evidence）
 * - GET  /api/governance/suggestions      首页建议（质量中心不消费，避免第二套建议）
 * - GET  /api/home/dashboard              待处理数 / 状态条（三个入口同源的唯一来源）
 * - GET  /api/asset-categories            类别清单（动态，不写死）
 * - GET  /api/doctor/estimate?category=   单类别预算估算（作为按类别预估的既有口径，保留）
 * - POST /api/doctor/diagnose             单资产诊断（批量诊断由前端编排，逐资产调用；不新造批量执行接口）
 *
 * 写链路（批量修复唯一引擎，本变更不新造）
 * - POST /api/governance/remediation/plan   生成计划（零写库、零模型调用）
 * - POST /api/governance/remediation/apply  一次确认后逐项执行：草案 → 备份 → 写库 → 可选分发
 * - POST /api/governance/remediation/undo   按 batchId 整批恢复库内旧版
 *
 * 重复项（质量中心组子项，页面与接口不动）
 * - POST /api/governance/duplicates/scan | merge-draft | apply | undo
 *
 * 规则与忽略（契约已由 add-diagnosis-rules 声明，T4-T5 未实施前按“未就绪”降级）
 * - GET    /api/diagnosis/rules            规则列表（本变更扩展用户规则与告警字段）
 * - GET    /api/diagnosis/ignore           忽略清单
 * - POST   /api/diagnosis/ignore           新增忽略
 * - DELETE /api/diagnosis/ignore           恢复
 *
 * 裁决准则（迁移入口不改数据面）
 * - GET  /api/criteria、GET /api/criteria/pack、POST /api/criteria/import-pack
 * - 单条准则的增删改复用既有写文件接口 POST/PUT/DELETE /api/files*
 *
 * 用户规则文件的写入同样复用 /api/files（保存前先调本文件新增的 validate）。
 *
 * ============ 新增接口与理由 ============
 * 1) GET  /api/governance/overview
 *    现有 /issues 是“单维度 + 分页平铺”，无法回答“哪一类问题最多、先改哪类”，
 *    也不携带跨类别聚类、影响面排序与覆盖度。故新增一个只读聚合端点。
 * 2) POST /api/governance/diagnose/estimate
 *    现有 GET /doctor/estimate 只接受单个 category，无法一次给出跨类别合计、
 *    按规则过滤后的调用数，以及不可诊断项明细（禁止静默丢弃）。
 * 3) POST /api/diagnosis/rules/validate
 *    /api/files 写入不具备规则结构知识；保存前需要一个零写库的校验端点。
 * 4) 扩展现有端点（不新开端点）：
 *    - /api/governance/issues 逐项补 ruleId / confidence / evidence / ignored
 *    - /api/governance/remediation/plan 请求体支持 ruleIds 过滤，计划项输出 ruleIds 与类别分布
 *    - /api/diagnosis/rules 响应补用户规则加载结果、覆盖关系与告警
 */

// 复用类型（真实 import 路径，本文件本身不参与构建）
import type {
  DiagnosisConfidence,
  DiagnosisRule,
  DiagnosisRuleSet,
  DiagnosisSeverity,
  DoctorAssetKind,
  FindingEvidence,
  FindingSource,
  RuleCategory,
  RuleMode,
} from '../../src/core/types.js';
import type { GovernanceHealth, HealthDimensionId } from '../../src/core/governance-health.js';
import type {
  RemediationPlan,
  RemediationPlanItem,
  RemediationSkipItem,
} from '../../src/core/governance-remediation.js';
import type { RemediationApplyResponse } from '../../src/server/routes/remediation.js';

// ============ 1. 全局体检报告（Requirement 2）============

/** 聚类键来源：ruleId 可用时按规则编号；未就绪时按标题归一化，前端必须如实标注 */
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
  /** 深链目标：/vault/<类别>?asset=<库内相对路径>（Requirement 7） */
  deepLink: string;
}

/** 一条「问题类型」：同一规则（或同一标题）在多资产上的命中合并 */
export interface QualityIssueCluster {
  /** 稳定 key，用于前端选择与批量圈选 */
  key: string;
  keySource: ClusterKeySource;
  /** 规则编号；keySource=title 时为 null，禁止前端自造 */
  ruleId: string | null;
  title: string;
  /** 首次出现该聚类的类别；跨类别通用规则标 cross */
  category: RuleCategory;
  severity: DiagnosisSeverity;
  mode: RuleMode;
  /** 受影响资产数（去重） */
  assetCount: number;
  /** 命中次数（同一资产可多次命中，如多处缺字段） */
  hitCount: number;
  severityDistribution: Record<DiagnosisSeverity, number>;
  fixableAssetCount: number;
  /** 全静态聚类恒为 0 */
  estimatedCalls: number;
  cachedCount: number;
  /** 影响面分 = assetCount × 严重度权重（high 3 / medium 2 / low 1）；用于排序，不是评分 */
  impactScore: number;
  /** 最多 3 条样例，完整清单走 /api/governance/issues 或聚类展开分页 */
  samples: QualityClusterAssetRef[];
}

/** 本轮到底评估了什么（Requirement 2.5 / 5.2） */
export interface QualityCoverage {
  rulesVersion: string;
  evaluatedRules: number;
  skippedRules: number;
  skippedReasons: Array<{
    reason: 'no-ai-config' | 'semantic-disabled' | 'budget' | 'timeout' | 'rule-invalid' | 'no-channel';
    count: number;
  }>;
  /** MCP 等有规则但一期无诊断执行通道的条数，必须如实披露 */
  noChannelRules: number;
  ignoredCount: number;
  semanticEvaluated: boolean;
}

/** GET /api/governance/overview?refresh=0|1 */
export interface QualityOverview {
  /** 复用四维健康分，不重算算法 */
  health: GovernanceHealth;
  clusters: QualityIssueCluster[];
  /** 排序口径写进响应，前端不得自行重排 */
  sortRule: 'impact-desc-calls-asc';
  /** 待处理总数，必须与 /api/home/dashboard 同源同值 */
  pendingTotal: number;
  coverage: QualityCoverage;
  generatedAt: string;
  cached: boolean;
}

// ============ 2. /issues 扩展（Requirement 2.1 / 3.4 / 7.1）============

/** GET /api/governance/issues 的单项：在既有 HealthIssueRef 上补字段（缺省时按旧字段渲染） */
export interface GovernanceIssueItem {
  id: string;
  ruleId: string | null;
  keySource: ClusterKeySource;
  severity: DiagnosisSeverity;
  confidence: DiagnosisConfidence;
  source: FindingSource;
  title: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  fixable: boolean;
  ignored: boolean;
  evidence: FindingEvidence[];
  deepLink: string;
}

export interface GovernanceIssueListResponse {
  dimension: HealthDimensionId;
  total: number;
  items: GovernanceIssueItem[];
}

// ============ 3. 跨类别批量诊断（Requirement 3）============

export type BatchDiagnoseTargetKind = DoctorAssetKind;

export interface BatchDiagnoseEstimateRequest {
  /** 按类别圈选；缺省 = 全部可诊断类别 */
  kinds?: BatchDiagnoseTargetKind[];
  /** 按问题类型圈选（来自 QualityIssueCluster.key）；与 kinds 同时存在时取交集 */
  clusterKeys?: string[];
  /** 直接按规则编号圈选（规范编号优先，跨类别通用规则可用） */
  ruleIds?: string[];
}

export type UnDiagnosableReason = 'env-asset' | 'unreadable' | 'unsupported-kind' | 'rule-load-failed';

export interface UnDiagnosableAsset {
  hubRelativePath: string;
  kind: BatchDiagnoseTargetKind;
  reason: UnDiagnosableReason;
}

/** POST /api/governance/diagnose/estimate（零模型、零写库） */
export interface BatchDiagnoseEstimate {
  totalAssets: number;
  /** 命中内容哈希缓存、本轮不消耗调用 */
  cacheHits: number;
  /** 需真实调用模型的资产数 */
  willCall: number;
  /** 语义规则本轮不执行（AI 未配置或用户关闭） */
  semanticSkipped: number;
  unDiagnosable: UnDiagnosableAsset[];
  /** 圈选类别实际会评估的规则条数（按需加载口径） */
  ruleCoverage: Array<{ kind: BatchDiagnoseTargetKind; evaluatedRules: number; skippedRules: number }>;
  rulesVersion: string;
  limits: {
    maxAssets: number;
    confirmAboveCalls: number;
    hardMaxCalls: number;
  };
  /** 预估失败时不返回本对象，由错误约定 503 / 500 表达，前端不得自行推算 */
  estimatedAt: string;
}

// ============ 4. 跨类别批量修复（Requirement 4）============

/** 计划请求扩展：在既有 kinds / dimension / maxAssets 之上增加规则过滤 */
export interface RemediationPlanRequestV2 {
  kinds?: DoctorAssetKind[];
  dimension?: HealthDimensionId;
  /** 默认 20，服务端硬上限 20（REMEDIATION_BATCH_LIMIT） */
  maxAssets?: number;
  /** 只处理命中这些规则的可修复项；缺省 = 不按规则过滤 */
  ruleIds?: string[];
  /** 来自问题聚类圈选时的聚类 key，仅用于服务端回传来源，不参与过滤逻辑 */
  clusterKeys?: string[];
}

/** 计划项扩展：补规则编号，供影响清单展示与撤销核对 */
export interface RemediationPlanItemV2 extends RemediationPlanItem {
  ruleIds: string[];
}

export interface RemediationPlanV2 extends Omit<RemediationPlan, 'items' | 'skipped'> {
  items: RemediationPlanItemV2[];
  skipped: RemediationSkipItem[];
  /** 类别分布；用于影响清单一句话摘要 */
  kindDistribution: Partial<Record<DoctorAssetKind, number>>;
  /** 实际生效的过滤条件；null = 未按规则过滤 */
  appliedRuleIds: string[] | null;
  /** 仅建议 / 证据不足而未参与批量的条数及原因（不可静默丢弃） */
  nonBatchableCount: number;
}

/** apply / undo 契约不变（与 add-asset-governance 一致），此处只做声明 */
export interface RemediationApplyRequest {
  /** 计划项 id 列表（必须来自最近一次 plan 响应，未知 id 400） */
  itemIds: string[];
  /** false = 只改库；true = 按 targets 或已安装工具分发 */
  distribute: boolean;
  targets?: string[];
}
export type { RemediationApplyResponse };

// ============ 5. 规则与忽略管理（Requirement 5）============

/** 规则来源：内置随版本只读；user 为用户目录文件 */
export type RuleOrigin = 'builtin' | 'user';

export interface RuleWithOrigin extends DiagnosisRule {
  origin: RuleOrigin;
  /** 同编号用户规则覆盖内置时为 true */
  overridesBuiltin: boolean;
  /** 生效版本来自哪个文件（库内相对路径或构建产物标识，禁止绝对路径） */
  originLabel: string;
}

export interface RuleLoadWarning {
  /** 库内相对路径或构建产物标识 */
  originLabel: string;
  /** 可定位到规则编号时给出，否则为 null */
  ruleId: string | null;
  reason:
    | 'missing-field'
    | 'invalid-category'
    | 'invalid-severity'
    | 'invalid-mode'
    | 'duplicate-id'
    | 'invalid-applies-to'
    | 'unparsable';
}

/** GET /api/diagnosis/rules?category=&origin= （扩展 add-diagnosis-rules 已声明响应） */
export interface DiagnosisRuleListView extends DiagnosisRuleSet {
  rules: RuleWithOrigin[];
  counts: Record<RuleCategory, number>;
  modeCounts: Record<RuleMode, number>;
  sources: {
    builtinCount: number;
    userCount: number;
    overriddenRuleIds: string[];
  };
  /** 按需加载：只加载目标类别 + 跨资产通用规则 */
  loadPolicy: 'category-on-demand';
  userRules: {
    /** 用户规则目录（Hub 内相对路径，禁止绝对路径） */
    directory: string;
    loaded: number;
    warnings: RuleLoadWarning[];
  };
  /** 规则接口未就绪时前端只读降级用；接口正常时不返回 */
  unavailableReason?: string;
}

/** POST /api/diagnosis/rules/validate：保存前校验，零写库 */
export interface RuleValidateRequest {
  /** 待保存的完整文件内容（YAML 文本），由前端读取编辑区传入 */
  content: string;
  /** 目标库内相对路径，用于冲突检查与告警定位 */
  targetPath: string;
}

export interface RuleValidateResponse {
  ok: boolean;
  /** 逐条错误；ok=true 时为空数组 */
  errors: Array<{ line: number | null; ruleId: string | null; message: string }>;
  /** 不影响保存的告警（如覆盖内置、通用规则缺 appliesTo 已跳过） */
  warnings: RuleLoadWarning[];
  /** 校验后实际会生效的规则条数 */
  effectiveRules: number;
}

/** 忽略清单沿用 add-diagnosis-rules 的 IgnoredFinding / IgnoreFindingRequest / IgnoreListResponse */
export type IgnoreRefreshHint = {
  /** 因内容变更已自动失效的条数，需在清单中标「已失效」 */
  expired: number;
  /** 忽略条数变化后是否建议重算健康分 */
  recomputeHealth: boolean;
};

// ============ 6. 裁决准则（Requirement 6）============

/** 迁移只改入口，不改数据面：准则 CRUD 继续走 /api/criteria 与 /api/files */
export interface QualityCriteriaEntry {
  /** 质量中心内的准则页地址 */
  path: '/quality/criteria';
  /** 旧地址（替换式重定向来源） */
  legacyPath: '/vault/criteria';
  /** 准则不计入健康分、不新增 ruleId 的提示文案键 */
  noticeKey: 'criteria-preference-only';
}

// ============ 7. 深链（Requirement 7）============

/** 质量中心到资产详情的唯一衔接方式；不携带修复动作参数 */
export interface AssetDeepLink {
  category: DoctorAssetKind;
  hubRelativePath: string;
  href: string;
}

// ============ 错误与降级约定（沿用 { error }）============

/**
 * 400 入参非法（kinds / clusterKeys / ruleIds 不在闭集、数量为 0、maxAssets 非整数）
 * 403 路径越出 Hub / 环境条目不可写（诊断与修复仍只服务库内资产）
 * 404 资产、批次、忽略条目不存在
 * 409 同一批次执行中重复发起 / 规则文件正在被另一请求写入
 * 422 规则集致命错误（版本缺失或全部规则非法），单条坏规则只告警不报错
 * 429 同一时段批量并发超限（前端并发上限 4，超限以该码回传）
 * 500 预估失败 / 聚合失败
 * 503 AI 未配置且动作强制要求模型（仅语义修复草案；静态诊断降级为 200 + 未评估标记）
 *
 * 降级不是错误：
 * - 无 AI → 200，semanticSkipped > 0、coverage.semanticEvaluated=false
 * - 规则/忽略接口未就绪 → 200，DiagnosisRuleListView.unavailableReason 非空（只读降级）
 * - 维度数据缺失 → 200，对应维度 applicability='data-missing'
 */
export type GovernanceCenterApiError = { error: string };
