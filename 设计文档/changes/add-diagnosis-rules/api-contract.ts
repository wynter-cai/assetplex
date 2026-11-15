/**
 * api-contract: add-diagnosis-rules
 *
 * 对应 specs/diagnosis-rules.spec.md 七个 Requirement。
 * 本文件只做契约声明，不真实 import；实现落 src/core/diagnosis-*.ts 与
 * src/server/routes/diagnosis.ts，并扩展 src/server/routes/doctor.ts。
 *
 * 复用声明（语义以现有实现为准，不在此重定义）：
 * - DoctorAssetKind / DiagnosisSeverity / DiagnosisOverall：src/core/types.ts
 * - DiagnosisIssue（旧）：保留给未升级的前端与缓存，新响应同时返回 findings
 * - DiagnosisReport（旧）：POST /api/doctor/diagnose 的旧字段全部保留，新增字段向后兼容
 * - LlmClient / AiClassifyConfig：src/core/skill-ai-classification.ts、ai-config.ts
 * - GovernanceHealth / HealthIssueRef：src/core/governance-health.ts
 */

type DoctorAssetKind = 'identity' | 'skill' | 'rule' | 'agent' | 'command' | 'memory';

type DiagnosisSeverity = 'high' | 'medium' | 'low';

type DiagnosisOverall = 'healthy' | 'needs-attention' | 'at-risk';

/** 旧问题条目：criterion 对静态项为 mechanical:<checkId>，对 AI 项为自由准则 slug。新链路继续产出，保证兼容 */
interface LegacyDiagnosisIssue {
  severity: DiagnosisSeverity;
  criterion: string;
  finding: string;
  suggestion: string;
  fixable: boolean;
}

// ============ 规则注册表（Requirement 1）============

/** cross = 跨资产通用规则；在 appliesTo 的每个类别下展示，但全库只计一次 */
export type RuleCategory = DoctorAssetKind | 'cross';

/** static = 零模型调用；llm = 语义增量（必须带证据，且只能从候选规则中选） */
export type RuleMode = 'static' | 'llm';

export interface DiagnosisRule {
  /** 稳定编号，如 SK-04、SEC-01；同一条规则的编号永不复用 */
  id: string;
  category: RuleCategory;
  /** category=cross 时必填，列出适用的七类资产；其余规则缺省为 [category] */
  appliesTo?: DoctorAssetKind[];
  severity: DiagnosisSeverity;
  mode: RuleMode;
  /** 判定信号：可机械判的写成可执行条件；语义判的写成需要模型确认的语义特征 */
  signal: string;
  /** 建议改法：具体到可执行动作，不写「注意质量」类空话 */
  recommendation: string;
  /** 依据出处（调研分册条目 / 官方文档 / 项目既有规则），供用户核对 */
  source: string;
}

export interface DiagnosisRuleSet {
  /** 语义变更必须递增（spec Scenario 6.4）；仅改文案可不升 */
  version: string;
  updatedAt: string;
  rules: DiagnosisRule[];
}

/** GET /api/diagnosis/rules：治理中心分类页与资产编写指南共用同一份 */
export interface DiagnosisRuleListResponse extends DiagnosisRuleSet {
  /** 按类别计数；cross 单列，不计入七类 */
  counts: Record<RuleCategory, number>;
  /** 按 mode 计数，用于「静态 / AI」口径披露 */
  modeCounts: Record<RuleMode, number>;
}

// ============ 证据与 finding（Requirement 2 / 3）============

/** line 为 null 表示无法定位到具体行（此时必须给 snippetIndex，前端标注「片段序号」） */
export interface FindingEvidence {
  /** 库内相对路径，禁止绝对路径与用户名 */
  hubRelativePath: string;
  line: number | null;
  /** 片段，长度 ≤ 200 字；必须能在原文中定位（Scenario 3.3） */
  snippet: string;
  snippetIndex?: number;
}

/** rule = 静态规则命中；llm = AI 语义增量 */
export type FindingSource = 'rule' | 'llm';

export interface RuleFinding {
  /** 报告内唯一，用于忽略/恢复与前端 key */
  id: string;
  ruleId: string;
  category: RuleCategory;
  severity: DiagnosisSeverity;
  confidence: 'high' | 'medium' | 'low';
  source: FindingSource;
  /** 规则一句话标题（来自注册表，不由模型生成） */
  title: string;
  /** 哪里有问题（结合证据的人话描述） */
  finding: string;
  /** 不修会发生什么；AI 未参与时允许为空串 */
  impact: string;
  /** 怎么改（具体动作；可引用 recommendation 并按证据细化） */
  suggestion: string;
  evidence: FindingEvidence[];
  /** true = 证据不足，前端显示「无法确定」，不计分、不可修复、不进建议（Scenario 3.2） */
  insufficientEvidence: boolean;
  /** 无证据或无 ruleId 一律 false（proposal 复用行约束） */
  fixable: boolean;
  /** 命中忽略清单：仍在响应中返回，供「已忽略 N 条 / 恢复」入口使用 */
  ignored: boolean;
}

/** 本轮到底查了什么、没查什么（Scenario 1.3） */
export interface DiagnosisCoverage {
  evaluatedRules: number;
  skippedRules: number;
  skippedReasons: Array<{ mode: RuleMode; reason: 'no-ai-config' | 'budget' | 'timeout'; count: number }>;
}

// ============ 诊断报告（扩展旧契约）============

export interface DiagnoseRequest {
  kind: DoctorAssetKind;
  /** 仅限库内资产；环境条目 403 */
  hubRelativePath: string;
}

/** POST /api/doctor/diagnose 响应：旧字段全保留，新增 findings / coverage / rulesVersion */
export interface DiagnosisReport {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  overall: DiagnosisOverall;
  /** 新链路主结果（含静态与 AI，含被忽略项） */
  findings: RuleFinding[];
  /** 兼容字段：由 findings 投影出的旧结构；无证据项不进入此列表 */
  issues: LegacyDiagnosisIssue[];
  /** 规则集版本，用于跨版本对比（Scenario 6.2） */
  rulesVersion: string;
  coverage: DiagnosisCoverage;
  criteriaUsed: string[];
  criteriaSkipped: number;
  cached: boolean;
  /** 仍保留：AI 未配置时为 true，findings 只含静态项 */
  mechanicalOnly: boolean;
  /** AI 是否实际参与本轮（区别于「配置了但失败」） */
  aiEvaluated: boolean;
  /** 被丢弃的模型条目数（非法编号 / 证据不可定位 / 结构缺失，Scenario 7.3） */
  rejected: number;
  model: string;
  generatedAt: string;
}

// ============ 忽略清单（Requirement 4）============

export interface IgnoredFinding {
  ruleId: string;
  hubRelativePath: string;
  /** 忽略时刻的资产内容哈希；内容变更后该条失效（Scenario 4.2） */
  contentHash: string;
  ignoredAt: string;
}

export interface IgnoreFindingRequest {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  ruleId: string;
  /** 由前端回传报告时的内容哈希，服务端校验一致性，防误忽略 */
  contentHash: string;
}

/** POST /api/diagnosis/ignore */
export interface IgnoreFindingResponse {
  ignored: IgnoredFinding;
  /** 该 ruleId 在该资产上是否还有其他未忽略命中 */
  remainingForRule: number;
}

/** DELETE /api/diagnosis/ignore?hubRelativePath=&ruleId= */
export interface RestoreFindingResponse {
  ruleId: string;
  hubRelativePath: string;
  restored: boolean;
}

/** GET /api/diagnosis/ignore?kind= ：只读列表，供设置页「管理忽略」 */
export interface IgnoreListResponse {
  items: IgnoredFinding[];
  /** 因内容变更已自动失效、下次诊断会重新提示的条数 */
  expired: number;
}

// ============ 治理中心下钻（Requirement 3.4 / 5.3 口径）============

/** GET /api/governance/issues 的单项在既有 HealthIssueRef 上补三个字段 */
export interface GovernanceRuleIssue {
  id: string;
  ruleId: string | null;
  severity: DiagnosisSeverity;
  title: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  fixable: boolean;
  /** 证据可能为空（数据缺失类问题），此时前端不渲染证据区 */
  evidence: FindingEvidence[];
  confidence: 'high' | 'medium' | 'low';
  source: FindingSource;
}

// ============ 评测与回归（Requirement 6）============

/** 标注样本：期望命中集合用于回归；fixture 本身不得含真实用户数据 */
export interface DiagnosisEvalCase {
  id: string;
  kind: DoctorAssetKind;
  /** tests/fixtures/diagnosis/ 下的中性示例路径 */
  fixturePath: string;
  /** 期望命中的 ruleId；语义规则可标 mustNotFlag 表达「不应报」 */
  expectedRuleIds: string[];
  mustNotFlagRuleIds: string[];
  note: string;
}

export interface DiagnosisEvalDiff {
  caseId: string;
  missing: string[];
  unexpected: string[];
  severityChanged: Array<{ ruleId: string; from: DiagnosisSeverity; to: DiagnosisSeverity }>;
}

export interface DiagnosisEvalReport {
  rulesVersion: string;
  model: string;
  totalCases: number;
  precision: number;
  recall: number;
  humanAgreementRate: number | null;
  diffs: DiagnosisEvalDiff[];
  generatedAt: string;
}

// ============ 错误约定（沿用 { error }）============

/**
 * - 400 kind / hubRelativePath / ruleId 非法；contentHash 与当前内容不一致
 * - 403 hubRelativePath 指向非库内资产（环境条目不做诊断）
 * - 404 资产文件、忽略条目不存在
 * - 422 规则集加载失败（版本缺失 / 全部规则非法）；单条规则非法只记告警不报错
 * 降级不是错误：无 AI 配置返回 200 + mechanicalOnly=true（Scenario 7.1）
 */
export type DiagnosisApiError = { error: string };
