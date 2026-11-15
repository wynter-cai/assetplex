/**
 * api-contract: refactor-asset-pipeline
 *
 * 单资产流水线（诊断 → 治理 → 分发）收进资产详情。本变更**只新增一个只读接口**
 * `GET /api/doctor/summary`，其余全部复用既有契约，不新增任何写接口、不新增分发通道。
 *
 * 契约边界（与既有变更对齐，避免两套口径）：
 * - 诊断报告字段：`RuleFinding` / `DiagnosisCoverage` / `evidence` 以 src/core/types.ts 与
 *   `changes/add-diagnosis-rules/specs/diagnosis-rules.spec.md` 为准。
 * - 修复链路：`/api/doctor/fix-draft` → `/api/doctor/apply` → `/api/doctor/undo`
 *   以 `changes/add-asset-doctor/api-contract.ts` 为准（advisory-only、确认后落盘、备份可撤销）。
 * - 分发：`POST /api/sync/run`（本地写入 + 备份）+ `POST /api/swap/rollback`（按 swapId 回滚）。
 * - 批量整改 `/api/governance/remediation/*` 仍服务全局治理，**本变更不调用**。
 */

// ============ 复用：诊断 ============

/** 与 src/core/types.ts 的 DOCTOR_ASSET_KINDS 对齐（含 memory；mcp 一期不做语义诊断） */
export type DoctorAssetKind = 'identity' | 'skill' | 'rule' | 'agent' | 'command' | 'memory';

export type DiagnosisSeverity = 'high' | 'medium' | 'low';

/** 结论闭集；其余一律视为解析失败（沿用 add-asset-doctor Scenario 8） */
export type DiagnosisOverall = 'healthy' | 'needs-attention' | 'at-risk';

export type DiagnosisConfidence = 'high' | 'medium' | 'low';

export type FindingSource = 'rule' | 'llm';

/** 证据：路径必须是库内相对路径；line 为 null 表示无法定位到行 */
export interface FindingEvidence {
  hubRelativePath: string;
  line: number | null;
  /** ≤200 字，必须能在原文中定位 */
  snippet: string;
  snippetIndex?: number;
}

/** 一条问题：必须绑定规则编号；insufficientEvidence 时不计分、不可修复、不进建议 */
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
  insufficientEvidence: boolean;
  fixable: boolean;
  /** 命中忽略清单后仍返回，供「已忽略 N 条 / 恢复」入口使用 */
  ignored: boolean;
}

export interface DiagnosisSkippedReason {
  mode: 'static' | 'llm';
  reason: 'no-ai-config' | 'budget' | 'timeout';
  count: number;
}

/** 本轮到底查了什么、没查什么 */
export interface DiagnosisCoverage {
  evaluatedRules: number;
  skippedRules: number;
  skippedReasons: DiagnosisSkippedReason[];
}

/**
 * POST /api/doctor/diagnose 响应（复用；此处列出本变更读取的字段）
 *
 * - `cached=true`：模型语义部分来自缓存（三要素命中），本轮未调用模型。
 * - `mechanicalOnly=true`：未配置 AI，只有机械 / 静态结论。
 * - `aiEvaluated`：区别于「配置了但失败」。
 * - `issues` 为 findings 的兼容投影，前端新代码优先读 `findings`，缺失时回退 `issues`。
 */
export interface DiagnosisReport {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  overall: DiagnosisOverall;
  findings: RuleFinding[];
  issues: Array<{
    severity: DiagnosisSeverity;
    criterion: string;
    finding: string;
    suggestion: string;
    fixable: boolean;
  }>;
  rulesVersion: string;
  coverage: DiagnosisCoverage;
  criteriaUsed: string[];
  criteriaSkipped: number;
  cached: boolean;
  mechanicalOnly: boolean;
  aiEvaluated: boolean;
  rejected: number;
  model: string;
  generatedAt: string;
}

// ============ 新增：单资产诊断摘要（零模型） ============

/**
 * GET /api/doctor/summary?kind=<DoctorAssetKind>&hubRelativePath=<库内相对路径>
 *
 * 为什么必须新增而不是复用 diagnose：
 * 详情打开即需要「上次结论 / 是否仍然有效 / 现在点一次会不会调模型」，而 `/diagnose`
 * 会执行一轮诊断并可能真实调用模型——打开页面不能隐式花钱。本接口只读本机记录与缓存键，
 * **保证零模型调用**；机械检查也不在服务端重跑（摘要只读上次结果）。
 *
 * - `state = 'never'`：该资产没有任何成功诊断记录。
 * - `state = 'valid'`：上次诊断的三要素与当前一致，再诊断不会调用模型。
 * - `state = 'stale'`：三要素至少一项已变；`lastRun` 仍返回（前端标「上次结果」）。
 *
 * 失败语义：记录损坏 / 内容不可读时 `state='never'` 且 `available=false`，
 * 不让详情页整体失败（spec Requirement 6 Scenario 6.7）。
 */
export interface DoctorSummaryResponse {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** false = 本机记录或资产内容读取失败；此时其余字段按未诊断处理 */
  available: boolean;
  state: 'never' | 'valid' | 'stale';
  lastRun: DoctorLastRunSummary | null;
  /** state='stale' 时的变化项；state!='stale' 时为空数组 */
  staleReasons: Array<'content' | 'criteria' | 'model'>;
  /** 是否已配置完整的 AI 端点（baseUrl/apiKey/model） */
  aiConfigured: boolean;
  /**
   * 现在点「重新诊断」是否会产生模型调用。
   * 由服务端按「当前正文 + 当前准则集哈希 + 当前模型」计算缓存键后判定，
   * 未配置 AI 时恒为 false。前端不得自行推断。
   */
  willCallModel: boolean;
}

/** 上次运行摘要（不含正文，不含绝对路径） */
export interface DoctorLastRunSummary {
  overall: DiagnosisOverall;
  issueCount: number;
  /** 高严重度条数 */
  highSeverityCount: number;
  /** 证据充分且可修复的条数 */
  fixableCount: number;
  /** 已忽略条数（沿 add-diagnosis-rules D7：忽略必须透明） */
  ignoredCount: number;
  /** true = 仅机械 / 静态结论，语义未评估 */
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  generatedAt: string;
}

/**
 * 本机持久化结构（`~/.assetplex/doctor-last.json`，按 `kind + '\u0000' + hubRelativePath` 索引）
 *
 * 用途：让摘要能判断「三要素是否变了」。只存摘要与指纹，**不存正文、不上传**。
 * 唯一写入点 = 诊断成功路径；读取方不得改写。
 */
export interface DoctorLastRunRecord extends DoctorLastRunSummary {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 指纹：用于与当前值比对，判断 staleReasons */
  inputs: {
    contentHash: string;
    criteriaHash: string;
    model: string;
  };
}

// ============ 复用：修复链路（详见 add-asset-doctor/api-contract.ts） ============

/** POST /api/doctor/fix-draft：生成草案，库内零变化 */
export interface FixDraftRequest {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 要修复的问题下标；越界 / 非 fixable → 400 */
  issueIndexes: number[];
}

export interface FixDraftResponse {
  draftContent: string;
  changeNotes: Array<{ issueIndex: number; note: string }>;
  /** 超长资产后端直接拒绝；恒 false 也保留字段 */
  contentTruncated: boolean;
  cached: boolean;
  model: string;
}

/** POST /api/doctor/apply：一次确认后 备份 → 写库 → 可选逐工具分发 */
export interface DoctorApplyRequest {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 用户最终采纳内容（可能被编辑）；以用户版本为准 */
  finalContent: string;
  distribute: boolean;
  targets?: string[];
}

export interface DoctorDispatchItem {
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  /** 写入成功时的 swap 执行 id，供逐项回滚 */
  swapId?: string;
}

export interface DoctorApplyResponse {
  saved: true;
  backupRef: string;
  dispatch: DoctorDispatchItem[];
  rollbackAvailable: boolean;
}

/** POST /api/doctor/undo：按 backupRef 恢复库内旧版（分发侧回滚走 /api/swap/rollback） */
export interface DoctorUndoRequest {
  backupRef: string;
}

export interface DoctorUndoResponse {
  restored: true;
  hubRelativePath: string;
}

// ============ 复用：分发 ============

/**
 * POST /api/sync/run?tool=<name>&...&backup=1
 *
 * 工具清单来自 `GET /api/tools`，类别支持矩阵来自 `GET /api/swap/tools`，
 * 同步状态真值来自 `GET /api/distributions`（前端不得用 `asset.distributions` 冒充）。
 * 「重试失败项」= 只把上次失败的工具名作为 tool 参数重发，成功项不重发。
 */
export interface SyncResult {
  tool: string;
  success: boolean;
  itemCount: number;
  skippedCount: number;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

export interface SyncRunResponse {
  results: SyncResult[];
  backupRef?: string | null;
  backupWarnings?: string[];
}

/** POST /api/swap/rollback：按 apply/分发返回的 swapId 回滚单个工具 */
export interface SwapRollbackRequest {
  swapId: string;
}

// ============ 前端深链契约（非 HTTP，仅约定地址形态） ============

/**
 * 单资产地址：`/vault/<类别>?asset=<encodeURIComponent(库内相对路径)>`
 *
 * - 资产库的 `asset.id` 即库内相对路径（与 `hubPath` 同值），可直接作为参数。
 * - 详情是否打开以该参数为唯一真源；关闭详情移除参数（`replace`，不新增历史记录）。
 * - 返回来源：从质量中心 / 首页进入时，详情内返回使用浏览器后退语义；不硬编码来源页。
 * - 参数指向的资产不存在时，落到类别列表并提示，不发起诊断请求。
 */
export interface AssetDeepLinkQuery {
  asset?: string;
}

// ============ 错误约定（沿用 { error }） ============

/**
 * GET /api/doctor/summary
 * - 400 `kind` 不在闭集 / `hubRelativePath` 缺失或为空
 * - 403 `hubRelativePath` 指向非库内资产（与 diagnose 同守卫；环境条目不提供摘要）
 * - 200 且 `available=false`：记录损坏 / 文件读不到（不是错误，脏数据不拖垮详情）
 *
 * POST /api/doctor/diagnose（复用）
 * - 403 非库内 / 404 文件不存在 / 422 模型输出非法 / 500 其他
 * - AI 未配置不是错误：200 + mechanicalOnly=true
 *
 * POST /api/doctor/fix-draft（复用）
 * - 400 issueIndexes 非法或含不可修复项 / 404 文件不存在 / 422 模型输出非法
 *
 * POST /api/doctor/apply（复用）
 * - 400 finalContent 为空或 distribute 非法 / 404 文件不存在 / 500 其他
 * - 分发项失败不改变 HTTP 状态：逐项在 `dispatch` 中如实回报
 */

// ============ 明确不做 ============

/**
 * - ❌ 不新增 `/api/remediations`：单资产修复走既有 `/api/doctor/*`；
 *   批量整改走 `/api/governance/remediation/*`（本变更不接入）。
 * - ❌ 不新增分发接口：一律 `/api/sync/run` + `/api/swap/rollback`。
 * - ❌ 不扩展 `/api/doctor/estimate`：它以类别为单位，服务批量预算；
 *   单资产成本由 `DoctorSummaryResponse.willCallModel` 回答。
 * - ❌ 不新增自动诊断 / 后台任务 / 流式接口。
 */
