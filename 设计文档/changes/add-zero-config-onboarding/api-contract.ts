/**
 * API 契约：add-zero-config-onboarding
 *
 * 本文件只记录「新增」与「扩展」部分；未列出的接口一律按现有契约复用，不得改语义。
 * 类型-only，无运行时代码。前后端并行开发以本文件为准。
 *
 * 复用（不改）：
 * - GET  /api/tools                        工具检测（installed/configDir/enabled）
 * - POST /api/sync/execute-import          收纳执行（冲突策略/二进制写入现成）
 * - GET  /api/governance/health            静态健康分（零模型）
 * - GET  /api/governance/issues            静态问题清单
 * - GET  /api/distributions                分发索引（synced/pending/conflict）
 * - GET/PUT /api/skills/ai-classify/config AI 配置（apiKey 脱敏）
 * - GET  /api/doctor/estimate              诊断调用量预估
 * - POST /api/doctor/diagnose              单资产诊断（BatchCheckup 逐条调用）
 */

/** 向导步骤（与原型 s0–s6 对应） */
export type OnboardingStepId =
  | 'welcome'
  | 'scan'
  | 'result'
  | 'collect'
  | 'doctor'
  | 'distribute'
  | 'done';

// ========== 新增：引导状态（3 个端点） ==========

export interface OnboardingToolSummary {
  toolId: string;
  displayName: string;
  installed: boolean;
  configDir: string;
}

/** GET /api/onboarding/state（只读，无副作用） */
export interface OnboardingStateResponse {
  hubRoot: string;
  /** <Hub>/hub.toml 是否存在 */
  initialized: boolean;
  /** 是否已写 onboarded 标记 */
  onboarded: boolean;
  /** 前端是否应在 `/` 自动进入向导；不自行推导 */
  autoEnter: boolean;
  /** 资产库真实资产数 */
  assetCount: number;
  lastOutcome: {
    outcome: 'completed' | 'skipped';
    step: OnboardingStepId;
    at: string;
  } | null;
  tools: OnboardingToolSummary[];
}

/** POST /api/onboarding/start：幂等创建骨架（不含身份/规则空模板） */
export interface OnboardingStartResponse {
  created: string[];
  skipped: string[];
  state: OnboardingStateResponse;
}

/** POST /api/onboarding/complete */
export interface OnboardingCompleteRequest {
  outcome: 'completed' | 'skipped';
  step: OnboardingStepId;
}

export interface OnboardingCompleteResponse {
  ok: boolean;
  /** 标记写入失败为 false；前端提示但不阻断跳转 */
  persisted: boolean;
  state: OnboardingStateResponse;
}

// ========== 扩展：扫描响应增加洞察 ==========

/** 重复/不一致/覆盖分组（单条） */
export interface OnboardingInsightGroup {
  category: string;
  name: string;
  hubTargetPath: string;
  /** 出现该资产的工具（按扫描顺序） */
  tools: string[];
  /** 组内不同内容哈希数量；缺哈希的副本不参与比对 */
  distinctVersions: number;
  comparedCopies: number;
}

export interface OnboardingInsights {
  duplicateGroups: OnboardingInsightGroup[];
  versionMismatchGroups: OnboardingInsightGroup[];
  coverageGroups: OnboardingInsightGroup[];
  installedTools: string[];
}

/**
 * GET /api/sync/scan?insights=1
 *
 * 现有响应：{ inventories: ToolInventory[] }
 * 扩展后：  { inventories, insights? }
 * - 不传 insights 时行为与现在完全一致（Import 页不受影响）
 * - insights 由服务端读取文件内容哈希后聚合，纯本地、零模型
 */
export interface ScanResponseExtension {
  insights?: OnboardingInsights;
}

// ========== 扩展：同步计划与执行 ==========

/**
 * SyncPlanItem 新增可选字段（backend src/core/types.ts）：
 *   targetExists?: boolean  // 目标路径当前是否存在（用于新增/覆盖分类）
 *
 * 其余字段（action / warning / reason / target.targetPath）保持原语义。
 * 前端四分类（纯函数，可单测）：
 *   action === 'skip'                → unchanged
 *   targetExists === false           → create
 *   targetExists === true            → overwrite
 *   且 distributions 判定为 conflict → conflict（覆盖的子集）
 */

/** POST /api/sync/run?backup=1（扩展查询参数） */
export interface SyncRunBackupExtension {
  /**
   * backup=1 时：
   * 1. 先按同一 filter 生成计划；
   * 2. 对 action !== 'skip' 且 targetExists 的目标，复制到
   *    <Hub>/.backups/onboarding/<swapId>/files/<index>，并写 manifest.json；
   * 3. 再执行原 run；保留最近 3 个批次。
   * 不传 backup 时行为与现在完全一致。
   */
  backupRef?: string | null;
}

// ========== 端点清单（新增/扩展） ==========

/**
 * | 方法 | 路径 | 类型 | 主要错误码 |
 * |---|---|---|---|
 * | GET  | /api/onboarding/state | 新增 | 500 |
 * | POST | /api/onboarding/start | 新增 | 500 |
 * | POST | /api/onboarding/complete | 新增 | 400 outcome/step 非法 / 500 |
 * | GET  | /api/sync/scan?insights=1 | 扩展（可选） | 500 |
 * | POST | /api/sync/run?backup=1 | 扩展（可选） | 400 filter 非法 / 500 |
 *
 * 注意：不新增 inventory / collect / distribute-preview / distribute-run 端点。
 */
