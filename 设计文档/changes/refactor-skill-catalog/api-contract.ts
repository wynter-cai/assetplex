/**
 * api-contract: refactor-skill-catalog
 *
 * 对应 specs/skill-catalog.spec.md 的 R1–R7。本文件只做契约声明，不真实 import；
 * 实现落 src/core/（聚合与摘要纯逻辑）+ src/server/routes/skills.ts（catalog / estimate / summary）
 * + src/server/routes/skill-distribution.ts（preview / execute）。
 *
 * 复用声明（语义以现有实现为准，不在此重定义）：
 * - SkillProvenance / SkillFunction / SkillFunctionSource：refactor-skill-origin-taxonomy + add-skill-ai-classification
 * - DiagnosisOverall / DiagnosisSeverity / DiagnosisIssue / DiagnosisReport：src/core/types.ts、add-asset-doctor
 * - DiagnosisRuleSet.version → 本契约的 rulesVersion（add-diagnosis-rules）
 * - SwapRollbackResult：enable-tool-hot-swap（回滚入口返回原契约，不新造）
 * - 分发状态索引：GET /api/distributions（fix-trust-and-consistency）
 *
 * 约束：禁止 any；**本契约新增的路径字段**一律为「Hub 内相对路径」或「工具内相对路径」，
 * 不得新增本机绝对路径与用户名。既有 `SkillInfo.path` 为现状字段（前端据此做详情与
 * 医生路径换算），本期保留不动，但看板/摘要/分发新增字段一律不复用绝对路径。
 */

// ============ 基础枚举（与现有实现同名同值）============

export type SkillProvenance = 'self' | 'marketplace' | 'plugin' | 'builtin' | 'github';

/**
 * 来源三分组（仅看板聚合视图，proposal D2）：
 * self = 自建；platform = 官方内置 + 插件自带；imported = 市场安装 + GitHub 源
 */
export type SkillProvenanceGroup = 'self' | 'platform' | 'imported';

/** 来源无法判定（目录与元数据都不能给出结论）：归入 platform 并显式标记，不冒充官方内置 */
export type SkillProvenanceUncertain = 'unknown';

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

export type SkillFunctionSource = 'manual' | 'ai' | 'keyword';

/** 分类依据（R2.3：卡片/详情可查）；目录 > 元数据 > 关键词，手动与 AI 为覆盖层 */
export type SkillClassificationBasis = 'directory' | 'metadata' | 'keyword' | 'ai' | 'manual';

export type DiagnosisOverall = 'healthy' | 'needs-attention' | 'at-risk';

export type DiagnosisSeverity = 'high' | 'medium' | 'low';

// ============ 既有 SkillInfo 的增量扩展（R1/R2）============

/**
 * GET /api/skills 与 GET /api/skills/catalog 中条目共用的增量字段。
 * 现有字段（id/name/provenance/inLibrary/path/functionCategory/functionSource/variants…）保持不变。
 */
export interface SkillInfoCatalogFields {
  /** 主 SKILL.md 最后修改时间（ISO）；读不到时 null，禁止用当前时间伪造 */
  lastModifiedAt: string | null;
  /** 三分组视图值（由 provenance 派生，不下发独立真值） */
  provenanceGroup: SkillProvenanceGroup;
  /** 目录与元数据均无法判定来源时为 'unknown'；该值下 provenance 仍按既有兜底，但 UI 必须标注「来源待确认」 */
  provenanceUncertain?: SkillProvenanceUncertain;
  /** 来源判定依据（R2.2/R2.3） */
  provenanceBasis: SkillClassificationBasis;
  /** 用途判定依据（R2.3） */
  functionBasis: SkillClassificationBasis;
  /** 上次体检摘要的展示投影；从未体检为 undefined */
  diagnosis?: SkillDiagnosisSummaryView;
}

/** 对外技能条目 = 既有字段 + 增量字段（实现时扩展 SkillApiInfo，不另建同名类型） */
export interface SkillInfo extends SkillInfoCatalogFields {
  id: string;
  name: string;
  description: string;
  functionCategory: SkillFunction;
  functionSource: SkillFunctionSource;
  provenance: SkillProvenance;
  inLibrary: boolean;
  /** 既有字段：主副本物理路径；仅用于本地详情与医生路径换算（本期不改语义，看板不新增同类字段） */
  path: string;
  tool: string;
  variants: number;
  source?: string;
  workspaceName?: string;
  workspacePath?: string;
  version?: string;
}

// ============ R1 全貌看板 ============

/** GET /api/skills/catalog?scope=asset&function=&provenance=&status=&search= */
export interface SkillCatalogOverview {
  generatedAt: string;
  /** 看板固定资产口径（环境技能只在折叠入口里计数，不进看板分类） */
  scope: 'asset';
  /** 与 GET /api/skills 同筛选条件下的 total 完全一致（proposal D3） */
  total: number;
  groups: {
    /** 三组 + 「来源待确认」单独计数（R2.5） */
    provenance: SkillCatalogGroup[];
    /** 九类用途，按既有顺序 */
    function: SkillCatalogGroup[];
  };
  countByProvenanceGroup: Record<SkillProvenanceGroup | 'unknown', number>;
  /** 最近更新（最多 5 条；按 lastModifiedAt 倒序，null 不入选） */
  recent: SkillCatalogRecentItem[];
  diagnosis: SkillCatalogDiagnosisTotals;
  aiClassify: SkillCatalogAiClassify;
  /** 局部数据不可用（如摘要存储读取失败）：对应分组显示「统计暂不可用」，不得用 0 冒充 */
  partial?: {
    diagnosisUnavailable?: boolean;
    aiClassifyUnavailable?: boolean;
  };
}

export interface SkillCatalogGroup {
  /** 来源组：self / platform / imported / unknown；用途组：九个 SkillFunction 值 */
  key: string;
  label: string;
  count: number;
  /** 组内最近更新时间（ISO）；全组无有效时间时为 null */
  latestModifiedAt: string | null;
  /** 组内摘要分布；failed 不计入——失败的诊断不写摘要，只在本次结果面板出现 */
  diagnosis: {
    unchecked: number;
    stale: number;
    healthy: number;
    needsAttention: number;
    atRisk: number;
  };
}

export interface SkillCatalogRecentItem {
  id: string;
  name: string;
  provenance: SkillProvenance;
  provenanceGroup: SkillProvenanceGroup;
  lastModifiedAt: string;
}

export interface SkillCatalogDiagnosisTotals {
  /** 有摘要且未过期 */
  checked: number;
  /** 有摘要但正文已变 */
  stale: number;
  /** 从未体检 */
  unchecked: number;
  atRisk: number;
  needsAttention: number;
  healthy: number;
  /** 摘要合计问题数（只算未过期） */
  issues: { high: number; medium: number; low: number };
}

/** AI 归类成本披露（R2.4 / proposal D1） */
export interface SkillCatalogAiClassify {
  aiConfigured: boolean;
  /** 当前仅靠关键词、且未被手动覆盖的条数（与现有「待分类 N」同义） */
  pending: number;
  /** 其中命中内容缓存的条数（零调用） */
  cacheHits: number;
  /** 需要真实调用的条数 = pending - cacheHits */
  needCall: number;
}

// ============ R1/R5 上次体检摘要 ============

/** 服务端存储形态：内容哈希由服务端按当前文件内容计算，前端不得回传 */
export interface SkillDiagnosisSummary {
  /** Hub 内相对路径，如 'skills/demo-skill/SKILL.md' */
  hubRelativePath: string;
  /** sha256(当前正文)；与读取时不一致即视为过期 */
  contentHash: string;
  overall: DiagnosisOverall;
  issueCounts: { high: number; medium: number; low: number };
  /** true = 本次只有机械检查，语义项未评估 */
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  checkedAt: string;
}

/** 下发展示形态：不含哈希与绝对路径 */
export interface SkillDiagnosisSummaryView {
  overall: DiagnosisOverall;
  issueCounts: { high: number; medium: number; low: number };
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  checkedAt: string;
  /** true = 期间正文已变化，问题数不计入看板合计（R1.3） */
  stale: boolean;
}

/** PUT /api/skills/diagnosis-summary：一次批量诊断结束后回写（R5.4） */
export interface PutSkillDiagnosisSummariesRequest {
  items: Array<{
    id: string;
    overall: DiagnosisOverall;
    issueCounts: { high: number; medium: number; low: number };
    mechanicalOnly: boolean;
    rulesVersion: string;
    model: string;
    checkedAt: string;
  }>;
}

export interface PutSkillDiagnosisSummariesResponse {
  saved: number;
  /** 未写入的条目及原因；不得整体失败（部分成功语义） */
  rejected: Array<{
    id: string;
    reason: 'not-found' | 'not-in-library' | 'invalid';
  }>;
}

// ============ R4 子集诊断预估 ============

/**
 * POST /api/skills/diagnose/estimate
 * 只算「可诊断子集」的成本；执行仍由前端逐条调用既有 POST /api/doctor/diagnose，
 * 以保留单条失败隔离与逐条进度（不新增批量诊断写接口）。
 */
export interface SkillDiagnoseEstimateRequest {
  /** 技能 id 列表（本次所选）；空数组 → 400 */
  ids: string[];
}

export interface SkillDiagnoseEstimate {
  /** 请求中的条目数（去重后，含不可诊断项） */
  total: number;
  /** 可诊断数（库内且文件可读） */
  diagnosable: number;
  /** 不可诊断明细：不得静默丢弃（R4.3 / R4.5） */
  unDiagnosable: Array<{
    id: string;
    name: string;
    reason: 'not-in-library' | 'missing-file' | 'not-found';
  }>;
  /** 命中未过期摘要的数量（≈ 缓存命中，不消耗调用） */
  cacheHits: number;
  /** 预计真实调用次数；aiConfigured=false 时恒为 0 */
  willCall: number;
  aiConfigured: boolean;
  /** true = 本次只跑机械检查（R4.5 / R7.3） */
  mechanicalOnly: boolean;
  overSelectionLimit: boolean;
  overCallLimit: boolean;
  /** willCall > confirmThreshold（R4.6） */
  confirmRequired: boolean;
  limits: {
    /** 单次选择上限，建议 100 */
    maxSelection: number;
    /** 二次确认阈值，建议 50 */
    confirmThreshold: number;
    /** 单次实际调用硬上限，建议 200；超出必须分批 */
    maxCalls: number;
  };
  /**
   * 执行目标清单（T6 实现补充）：可诊断技能及其库内相对路径，
   * 前端据此逐条调用 `POST /api/doctor/diagnose`，不自行把绝对路径换算成库内路径。
   */
  targets: Array<{ id: string; name: string; hubRelativePath: string }>;
}

// ============ R6 批量分发 ============

/** POST /api/skills/distribution/preview 请求 */
export interface SkillDistributionPreviewRequest {
  ids: string[];
}

/** 目标工具内的相对路径（如 'skills/demo-skill/SKILL.md'），不含本机绝对路径与用户名 */
export type ToolRelativePath = string;

export interface SkillDistributionFileImpact {
  total: number;
  /** 目标不存在，本次新增 */
  created: number;
  /** 目标已存在且内容不同，需覆盖 */
  overwritten: number;
  /** 目标已存在且内容一致，无需写入 */
  unchanged: number;
  /** 目标已存在且不是本工具托管（冲突），默认跳过，需显式勾选覆盖 */
  conflicts: number;
}

export interface SkillDistributionToolImpact {
  tool: string;
  displayName: string;
  installed: boolean;
  /** 该工具是否支持技能类别（不支持时整行不可选） */
  supported: boolean;
  /** installed=false / supported=false 时说明原因 */
  skipReason?: string;
  /** 默认勾选：仅「已安装、支持且已存在本次任一技能」的工具（R6.2） */
  defaultSelected: boolean;
  /** 影响清单生成时工具检测失败：状态未知，不可勾选，也不推断为未安装（R7.6） */
  statusUnknown?: boolean;
  files: SkillDistributionFileImpact;
  /** 最多 3 条示例，便于用户核对写到哪；只给工具内相对路径 */
  sampleTargets: ToolRelativePath[];
}

export interface SkillDistributionPreview {
  /** 绑定本次预览快照；execute 必须回传，过期或目录已变返回 409 */
  token: string;
  generatedAt: string;
  expiresAt: string;
  /** 本次参与分发的库内技能 */
  skills: Array<{ id: string; name: string; hubRelativePath: string }>;
  /** 不可分发明细（R6.5）：未入库 / 文件缺失 */
  ineligible: Array<{
    id: string;
    name: string;
    reason: 'not-in-library' | 'missing-file' | 'not-found';
  }>;
  tools: SkillDistributionToolImpact[];
  totals: {
    tools: number;
    files: number;
    created: number;
    overwritten: number;
    unchanged: number;
    conflicts: number;
  };
  /** 备份口径说明（真实备份由 swap 执行时生成，见 rollback） */
  backup: {
    policy: 'swap';
    note: string;
  };
}

/** POST /api/skills/distribution/execute 请求 */
export interface SkillDistributionExecuteRequest {
  /** preview 返回的 token；快照过期/目录变化 → 409，要求重新预览 */
  token: string;
  /** 用户勾选的目标；空数组 → 400（不勾等于不分发） */
  targets: Array<{
    tool: string;
    /** 是否覆盖冲突文件（conflicts > 0 时用户显式勾选）；false = 冲突项跳过 */
    overwriteConflicts: boolean;
  }>;
}

export interface SkillDistributionResultItem {
  skillId: string;
  skillName: string;
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  /** skipped/failed 时必填，原样展示给用户 */
  reason?: string;
  /** written 时回传该工具的 swap 执行 id（同一工具本次共用） */
  swapId?: string;
}

export interface SkillDistributionExecuteResponse {
  results: SkillDistributionResultItem[];
  counts: { written: number; skipped: number; failed: number };
  /** 有任一写入即可回滚；逐工具对应 POST /api/swap/rollback 的 swapId（R6.4） */
  rollback: Array<{ tool: string; swapId: string }>;
  /** 执行后是否已刷新分发索引（true 时前端可直接刷新卡片状态） */
  distributionIndexRefreshed: boolean;
}

// ============ 错误约定（沿用 { error: string }）============

/**
 * - 400 ids 缺失/非字符串数组/空数组；摘要 items 结构非法
 * - 403 预览或执行中出现未入库技能（路由层以 ineligible 明细返回后整体 400，不逐条 403）
 * - 404 preview token 不存在；技能文件不存在
 * - 409 preview token 已过期或目标目录已变化（须重新预览）；同一 token 重复执行
 * - 422 诊断摘要字段非法（overall 闭集外、issueCounts 非非负整数）
 * - 500 其他
 *
 * 降级不是错误：
 * - 未配置 AI 端点时 estimate 返回 200 + mechanicalOnly=true / willCall=0
 * - 看板某项数据不可用时 catalog 仍返回 200，并以 partial 标记不可用项；
 *   对应计数不得填 0 冒充，前端显示「统计暂不可用」
 */
export type SkillCatalogApiError = { error: string };
