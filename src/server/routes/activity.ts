/**
 * 活动日志读取路由（add-activity-log）
 *
 * GET /api/activity?limit=&type=&cursor=
 *
 * 只读接口：数据来自 `<Hub>/governance/activity/*.jsonl`（core/activity-log）。
 * spec: 设计文档/changes/add-activity-log/specs/activity-feed.spec.md Scenario 6
 */

import { Hono } from 'hono';
import {
  ACTIVITY_TYPES,
  readActivity,
  type ActivityPage,
  type ActivityQuery,
  type ActivityType,
} from '../../core/activity-log.js';

export interface ActivityRouteDeps {
  /** 读取实现（测试注入；缺省读真实 Hub） */
  read?: (query: ActivityQuery) => ActivityPage;
}

/** limit：缺省 20，必须是 1-100 的整数 */
function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return 20;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) return null;
  return value;
}

/** type：缺省 undefined；非闭集值返回 null */
function parseType(raw: string | undefined): ActivityType | undefined | null {
  if (raw === undefined || raw === '') return undefined;
  if (!(ACTIVITY_TYPES as readonly string[]).includes(raw)) return null;
  return raw as ActivityType;
}

export function createActivityRoutes(deps: ActivityRouteDeps = {}): Hono {
  const routes = new Hono();
  const read = deps.read ?? readActivity;

  routes.get('/', (c) => {
    const limit = parseLimit(c.req.query('limit'));
    if (limit === null) return c.json({ error: 'limit 必须是 1-100 的整数' }, 400);

    const type = parseType(c.req.query('type'));
    if (type === null) {
      return c.json({ error: `type 必须是 ${ACTIVITY_TYPES.join('/')}` }, 400);
    }

    const cursor = c.req.query('cursor');
    const query: ActivityQuery = { limit };
    if (type !== undefined) query.type = type;
    if (cursor !== undefined && cursor !== '') query.cursor = cursor;

    return c.json(read(query));
  });

  return routes;
}
