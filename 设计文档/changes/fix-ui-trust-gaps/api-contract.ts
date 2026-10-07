/**
 * API 契约：fix-ui-trust-gaps（UI 信任缺口止血）
 *
 * 约定：前后端共享本文件类型。仅列本变更涉及的接口；
 * 标 [MODIFIED] 的为本变更修改，[CONSUMED] 为已存在但前端首次接线，[UNCHANGED] 仅引用。
 * 对应 specs：overview-init-state.spec.md / connections-controls.spec.md
 */

// ─────────────────────────────────────────────────────────────
// [MODIFIED] GET /api/hub/overview
//
// 行为变化 1：hubInitialized 语义
//   旧：hubExists && hubTomlExists && totalAssets > 0
//   新：hubExists && totalAssets > 0
//   理由：保险箱目录存在且有资产即视为已开始使用；hub.toml 缺失属于
//         可自愈的配置缺口（getConfig 有默认值），不应把用户挡在首页外。
//
// 行为变化 2：assetStats 新增 agent 键（第 5 类，与前端 ASSET_CATEGORIES 对齐）
//   口径不变：保险箱目录（hubRoot）下 agents/ 目录的文件递归计数，
//   与其余四类同口径（注意：不是去重后的智能体数；口径统一在 P2-C）。
// ─────────────────────────────────────────────────────────────

/** 前端资产类别（5 类，与 web/src/config/asset-categories.ts 的 code 一致） */
export type OverviewCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'agent';

export interface OverviewAssetStats {
  identity: number;
  skill: number;
  rule: number;
  mcp: number;
  agent: number;
}

export type ConnectionStatus = 'synced' | 'pending' | 'not_connected' | 'not_installed';

export interface ConnectionInfo {
  toolId: string;
  toolName: string;
  status: ConnectionStatus;
  assetCount: number;
  pendingCount: number;
  lastSyncedAt?: string;
}

export type ActivityType = 'import' | 'sync' | 'edit' | 'create';

export interface ActivityInfo {
  id: string;
  type: ActivityType;
  description: string;
  occurredAt: string;
}

export interface GetOverviewResponse {
  /** hubRoot 存在且至少有 1 个资产文件即为 true（不再要求 hub.toml 存在） */
  hubInitialized: boolean;
  /** 5 类计数，键固定存在且为非负整数 */
  assetStats: OverviewAssetStats;
  connections: ConnectionInfo[];
  /** 本变更期间后端仍返回 []；前端不再提供活动页入口（P2-C 转正） */
  recentActivities: ActivityInfo[];
  healthScore: number;
}

// ─────────────────────────────────────────────────────────────
// [CONSUMED] POST /api/tools/:name/toggle
// 已存在（src/server/routes/tools.ts:43）。连接页 Switch 首次接线。
// 请求：{ enabled?: boolean }（省略则后端取反）
// 成功：200 { success: true, enabled: boolean }
// 失败：404 { error: string }（适配器或 tools 配置项不存在）
//
// 边界裁决：本变更要求"hub.toml 缺失时 toggle 仍可持久化"
//   —— saveConfig 在文件缺失场景必须能落盘（红测先行，必要时修后端）。
// ─────────────────────────────────────────────────────────────

export interface ToggleToolRequest {
  enabled?: boolean;
}
export interface ToggleToolResponse {
  success: boolean;
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────
// [CONSUMED] POST /api/tools/:name/detect
// 已存在（src/server/routes/tools.ts:63）。「重新检测」首次接线。
// 成功 200 返回 ToolStatus（与 GET /api/tools/:name 同形状）；404 { error }。
//
// 「扫描新工具」不新增端点：GET /api/tools 内部对所有适配器重新 detect，
// 前端 refetch 即满足"再扫一遍"语义。
// ─────────────────────────────────────────────────────────────

export interface ToolStatus {
  name: string;
  displayName: string;
  installed: boolean;
  enabled?: boolean;
  version?: string;
  configDir?: string;
}

// ─────────────────────────────────────────────────────────────
// [UNCHANGED] 前端路由（非 HTTP 契约，记录给前端实施）
//   /connections?tool=<name>  连接页读取 query 参数自动选中对应工具
//   /activity 死链撤除：RecentActivity 不再渲染「查看全部」
//   （活动入口整体撤下，recentActivities 为空时不展示该卡片）
// ─────────────────────────────────────────────────────────────
