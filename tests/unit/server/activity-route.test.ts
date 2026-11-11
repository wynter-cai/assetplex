/**
 * 活动日志路由测试（add-activity-log）
 *
 * spec: activity-feed.spec.md Scenario 6；接口参数边界
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createActivityRoutes } from '../../../src/server/routes/activity.js';
import type { ActivityEntry, ActivityPage, ActivityQuery } from '../../../src/core/activity-log.js';

const ENTRY: ActivityEntry = {
  id: 'a1',
  at: '2026-11-11T10:00:00.000Z',
  type: 'sync',
  actor: 'web',
  summary: '同步到 demo-tool：2 个文件',
};

/** 挂载路由并记录收到的查询参数 */
function harness(page: ActivityPage = { items: [ENTRY], nextCursor: 'cursor-2' }): {
  app: Hono;
  calls: ActivityQuery[];
} {
  const calls: ActivityQuery[] = [];
  const app = new Hono();
  app.route(
    '/api/activity',
    createActivityRoutes({
      read: (query) => {
        calls.push(query);
        return page;
      },
    }),
  );
  return { app, calls };
}

async function get(app: Hono, path: string): Promise<Response> {
  return app.fetch(new Request(`http://local${path}`));
}

describe('GET /api/activity', () => {
  it('缺省 limit=20，返回 items 与 nextCursor', async () => {
    const { app, calls } = harness();
    const res = await get(app, '/api/activity');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [ENTRY], nextCursor: 'cursor-2' });
    expect(calls[0]).toEqual({ limit: 20 });
  });

  it('透传 limit / type / cursor', async () => {
    const { app, calls } = harness();
    await get(app, '/api/activity?limit=5&type=sync&cursor=2026-11-11T10:00:00.000Z%7Ca1');

    expect(calls[0]).toEqual({
      limit: 5,
      type: 'sync',
      cursor: '2026-11-11T10:00:00.000Z|a1',
    });
  });

  it('limit 非法时 400', async () => {
    const { app, calls } = harness();
    for (const limit of ['0', '101', 'abc', '-1']) {
      const res = await get(app, `/api/activity?limit=${limit}`);
      expect(res.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('type 不在闭集内时 400', async () => {
    const { app } = harness();
    const res = await get(app, '/api/activity?type=delete');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('type') });
  });

  it('空列表时 nextCursor 为 null', async () => {
    const { app } = harness({ items: [], nextCursor: null });
    const res = await get(app, '/api/activity?type=import');
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });
});
