/**
 * add-activity-log API 契约（与 src/core/activity-log.ts 实现对齐）
 *
 * 前端类型见 web/src/types/api.ts 的 ActivityEntry / ActivityListResponse。
 */

/** 活动类型闭集（与首页图标表一致，禁止扩张） */
export type ActivityType = 'import' | 'sync' | 'edit' | 'create';

/** 操作发起方：本期只写 web；mcp / cli 预留 */
export type ActivityActor = 'web' | 'mcp' | 'cli';

export interface ActivityEntry {
  /** 条目唯一 ID（uuid） */
  id: string;
  /** ISO 时间戳 */
  at: string;
  type: ActivityType;
  actor: ActivityActor;
  /** 人类可读摘要（不含正文、不含绝对路径） */
  summary: string;
  /** 涉及的工具名（同步/导入） */
  targets?: string[];
  /** 计数摘要，如 { synced: 3, skipped: 1 } */
  counts?: Record<string, number>;
  /** 涉及的 Hub 相对路径（最多 50 条） */
  paths?: string[];
}

/** GET /api/activity 查询参数 */
export interface GetActivityQuery {
  /** 1-100，缺省 20 */
  limit?: number;
  /** 类型过滤，缺省全部 */
  type?: ActivityType;
  /** 游标：上一页返回的 nextCursor，格式 `<at>|<id>` */
  cursor?: string;
}

/** GET /api/activity 响应 */
export interface GetActivityResponse {
  items: ActivityEntry[];
  /** null = 没有更早的记录 */
  nextCursor: string | null;
}
