/**
 * refactor-home-action-panel API 契约（一期：Phase 0 只读）
 *
 * 设计原则：能复用的一律复用，只有「首页一次成型需要的数据」才新增聚合接口。
 *
 * ── 复用（不改契约）
 * GET  /api/governance/health   四维健康分（/governance 临时容器页使用；首页由新聚合接口内部同源取数）
 * GET  /api/governance/issues   单维度问题清单（/governance 临时容器页使用）
 * GET  /api/activity            活动日志（活动页使用；首页最近变化由新聚合接口带出 5 条）
 * GET  /api/doctor/diagnose     单资产体检报告（首页待办「查看」使用，只读）
 * GET  /api/distributions       分发索引（首页聚合接口内部使用，30s 缓存）
 *
 * ── 新增（只读）
 * GET  /api/home/dashboard      首页行动面板一次成型所需数据
 *
 * 为什么新增而不是前端拼：状态条、待办、矩阵要共用同一次治理快照与同一份分发索引，
 * 前端分别请求再各算一遍必然出现「状态条 12 / 待办 15」这类自相矛盾，
 * 也违反「数字必须来自后端」的既有约束（asset-center-consistency）。
 */

import type {
  ActivityEntry,
  DiagnosisSeverity,
  DoctorAssetKind,
  HealthGrade,
  HealthIssueRef,
} from '../../../web/src/types/api';

/** 上面 import 的类型即既有契约，本变更不扩展其字段；下面只定义新接口。 */

// ============ GET /api/home/dashboard ============

/** 查询参数 */
export interface GetHomeDashboardQuery {
  /** 待办队列返回条数，1-20，缺省 5；不影响 total */
  issuesLimit?: number;
  /** 1 = 绕过治理快照 30s 缓存强制重算（「重新体检」） */
  refresh?: '0' | '1';
}

/** 工具行状态 */
export type HomeToolState =
  /** 已启用，且分发索引判定无 conflict / pending */
  | 'synced'
  /** 已启用，但存在 conflict 或 pending */
  | 'drift'
  /** 已安装，但 hub 配置未启用 */
  | 'not_connected'
  /** 未安装 */
  | 'not_installed'
  /** 该工具分发状态读取失败（partial） */
  | 'unknown';

/** 工具与同步矩阵的一行 */
export interface HomeToolRow {
  toolId: string;
  toolName: string;
  state: HomeToolState;
  /** 该工具下 conflict + pending 的资产数；state='unknown' 时为 null（不填 0） */
  driftAssetCount: number | null;
  /** 最近一次同步到该工具的时间；null = 尚无同步记录（不填健康分/备份时间） */
  lastSyncedAt: string | null;
}

/** 今日待办队列（已跨维度去重、按严重度降序） */
export interface HomeIssueQueue {
  /** false = 资产快照读取失败；此时 total/bySeverity 为 null、items 为空数组 */
  available: boolean;
  /**
   * 去重后的待治理条目总数（= 状态条「待治理」）。
   * 去重键为「资产 + 检查项 + 发现内容」：规范性维度包含全部机械项，
   * 与完整性维度直接相加会重复计数，因此总数不得等于四维 issueCount 之和。
   */
  total: number | null;
  /** 去重后的严重度分布；available=false 时为 null */
  bySeverity: Record<DiagnosisSeverity, number> | null;
  /** 严重度降序前 issuesLimit 条；行渲染字段与 HealthIssueRef 一致 */
  items: HealthIssueRef[];
}

/** 状态条四个数字（null 一律表示「暂不可用」，不得渲染为 0） */
export interface HomeStatusNumbers {
  /** 健康分；null = 尚未算出或读取失败 */
  healthScore: number | null;
  /** 等级；'empty' 表示库内无可评估资产（界面显示「待盘点」，不显示 0 分） */
  healthGrade: HealthGrade | null;
  /** 参与评估的库内资产数；null = 不可用 */
  totalAssets: number | null;
  /**
   * 未同步处数 = 分发一致性问题数（资产 × 工具，与健康分「分发一致性」维度 issueCount 同口径）。
   * null = 分发索引不可用或该维度数据缺失；界面文案为「N 处未同步」。
   */
  unsyncedCount: number | null;
  /** 最近一次备份时间（三处备份根目录取最新） */
  lastBackupAt: string | null;
  /** 'recorded' 有时间 / 'none' 从未备份 / 'unavailable' 探测失败（区分空态文案） */
  backupState: 'recorded' | 'none' | 'unavailable';
}

/** GET /api/home/dashboard 响应 */
export interface HomeDashboardResponse {
  /** ISO 时间戳，本次聚合快照时间 */
  generatedAt: string;
  /** false = 库为空/未初始化：首页进入库为空态 */
  hubInitialized: boolean;
  status: HomeStatusNumbers;
  issues: HomeIssueQueue;
  /** 受支持工具全集（含未安装），未安装行置灰 */
  tools: HomeToolRow[];
  /** 最近变化，固定最多 5 条，时间倒序 */
  recentActivity: ActivityEntry[];
  /** 健康分计算时间（「最近一次体检」文案）；null = 从未算过 */
  healthComputedAt: string | null;
  /** true = 至少一个工具读取失败 */
  partial: boolean;
  failedTools: string[];
}

// ============ 待办行「去资产库修改」路径映射（前端常量，非接口） ============

/**
 * 问题条目 kind → 资产库类别路由。
 * 未列出的 kind 一律回退 `/vault`（不得拼出 404 路径）。
 */
export type HomeFixTargetPath =
  | '/vault/identity'
  | '/vault/skill'
  | '/vault/rule'
  | '/vault/mcp'
  | '/vault/agent'
  | '/vault/memory'
  | '/vault';

/** kind（DoctorAssetKind）→ 路径；command 等未建类别页的 kind 回退 /vault */
export type HomeFixTargetResolver = (kind: DoctorAssetKind) => HomeFixTargetPath;

// ============ 不新增的接口（明确记录，避免二期误加） ============

/**
 * 不做「/api/home/status」「/api/governance/queue」等拆分接口：
 * 一期首页只需要一次请求，拆开会让首页与 /governance 各自缓存、各自过期，
 * 再次出现口径不一致。二期治理中心（B12）若需要可分页的全量清单，
 * 再在 /governance 下新增独立契约，不复用本文件类型。
 */
export type NoAdditionalEndpointsInPhase0 = never;
