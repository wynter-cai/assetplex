/**
 * 事件日志单元测试（add-activity-log）
 *
 * spec: 设计文档/changes/add-activity-log/specs/activity-feed.spec.md Scenario 1-9
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACTIVITY_RETENTION_MONTHS,
  activityDir,
  appendActivity,
  readActivity,
} from '../../../src/core/activity-log.js';

let hubRoot: string;

beforeEach(() => {
  hubRoot = mkdtempSync(join(tmpdir(), 'activity-log-test-'));
});

afterEach(() => {
  rmSync(hubRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** 固定时间点，避免本地时区跨月抖动 */
const NOV = new Date(2026, 10, 11, 10, 0, 0);
const NOV_10 = new Date(2026, 10, 10, 9, 0, 0);
const NOV_09 = new Date(2026, 10, 9, 8, 0, 0);

describe('appendActivity', () => {
  it('写入当月分片，可被 readActivity 读回', () => {
    const entry = appendActivity(
      { type: 'sync', summary: '同步到 demo-tool：3 个文件', targets: ['demo-tool'], counts: { synced: 3 } },
      { hubRoot, now: () => NOV, id: () => 'a1' },
    );

    expect(entry).not.toBeNull();
    expect(existsSync(join(activityDir(hubRoot), '2026-11.jsonl'))).toBe(true);

    const page = readActivity({}, { hubRoot, now: () => NOV });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: 'a1',
      type: 'sync',
      actor: 'web',
      summary: '同步到 demo-tool：3 个文件',
      targets: ['demo-tool'],
      counts: { synced: 3 },
    });
  });

  it('目录不可写时返回 null 且不抛错（不阻断主流程）', () => {
    const blocked = join(hubRoot, 'blocked');
    writeFileSync(blocked, 'not a directory');

    const entry = appendActivity({ type: 'edit', summary: '演示' }, { hubRoot: blocked, now: () => NOV });
    expect(entry).toBeNull();
  });

  it('paths 超过 50 条时截断', () => {
    const paths = Array.from({ length: 60 }, (_, i) => `skills/demo-${i}/SKILL.md`);
    const entry = appendActivity({ type: 'edit', summary: '批量写入', paths }, { hubRoot, now: () => NOV });
    expect(entry?.paths).toHaveLength(50);
  });
});

describe('readActivity', () => {
  it('按时间倒序返回（新→旧）', () => {
    appendActivity({ type: 'create', summary: '最早' }, { hubRoot, now: () => NOV_09, id: () => 'b1' });
    appendActivity({ type: 'edit', summary: '中间' }, { hubRoot, now: () => NOV_10, id: () => 'b2' });
    appendActivity({ type: 'sync', summary: '最新' }, { hubRoot, now: () => NOV, id: () => 'b3' });

    const page = readActivity({}, { hubRoot, now: () => NOV });
    expect(page.items.map((item) => item.summary)).toEqual(['最新', '中间', '最早']);
    expect(page.nextCursor).toBeNull();
  });

  it('limit + cursor 翻页不重复不跳条', () => {
    appendActivity({ type: 'create', summary: '第 1 条' }, { hubRoot, now: () => NOV_09, id: () => 'c1' });
    appendActivity({ type: 'create', summary: '第 2 条' }, { hubRoot, now: () => NOV_10, id: () => 'c2' });
    appendActivity({ type: 'create', summary: '第 3 条' }, { hubRoot, now: () => NOV, id: () => 'c3' });

    const first = readActivity({ limit: 2 }, { hubRoot, now: () => NOV });
    expect(first.items.map((item) => item.summary)).toEqual(['第 3 条', '第 2 条']);
    expect(first.nextCursor).not.toBeNull();

    const second = readActivity(
      { limit: 2, cursor: first.nextCursor ?? undefined },
      { hubRoot, now: () => NOV },
    );
    expect(second.items.map((item) => item.summary)).toEqual(['第 1 条']);
    expect(second.nextCursor).toBeNull();
  });

  it('类型过滤只返回该类型', () => {
    appendActivity({ type: 'sync', summary: '同步一次' }, { hubRoot, now: () => NOV_09 });
    appendActivity({ type: 'import', summary: '导入一次' }, { hubRoot, now: () => NOV });

    const page = readActivity({ type: 'import' }, { hubRoot, now: () => NOV });
    expect(page.items.map((item) => item.summary)).toEqual(['导入一次']);
  });

  it('忽略超过保留期的分片', () => {
    const dir = activityDir(hubRoot);
    appendActivity({ type: 'sync', summary: '近期' }, { hubRoot, now: () => NOV });
    const stale = '2026-01';
    writeFileSync(
      join(dir, `${stale}.jsonl`),
      `${JSON.stringify({ id: 'old', at: '2026-01-05T00:00:00.000Z', type: 'sync', actor: 'web', summary: '半年前的' })}\n`,
    );

    expect(readActivity({}, { hubRoot, now: () => NOV }).items.map((item) => item.summary)).toEqual(['近期']);
  });

  it('写入时清理超过保留期的分片', () => {
    const dir = activityDir(hubRoot);
    appendActivity({ type: 'sync', summary: '近期' }, { hubRoot, now: () => NOV });
    const staleName = '2026-01.jsonl';
    writeFileSync(join(dir, staleName), '{}\n');
    expect(existsSync(join(dir, staleName))).toBe(true);

    appendActivity({ type: 'sync', summary: '再写一条' }, { hubRoot, now: () => NOV });
    expect(existsSync(join(dir, staleName))).toBe(false);
    expect(ACTIVITY_RETENTION_MONTHS).toBe(6);
  });

  it('坏行跳过，其余条目正常返回', () => {
    const dir = activityDir(hubRoot);
    appendActivity({ type: 'sync', summary: '好行' }, { hubRoot, now: () => NOV, id: () => 'd1' });
    const file = join(dir, '2026-11.jsonl');
    writeFileSync(file, `${readFileSync(file, 'utf-8')}{not json}\n{"id":"x"}\n`);

    const page = readActivity({}, { hubRoot, now: () => NOV });
    expect(page.items.map((item) => item.id)).toEqual(['d1']);
  });

  it('日志目录不存在时返回空页', () => {
    expect(readActivity({}, { hubRoot: join(hubRoot, 'empty'), now: () => NOV })).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('cursor 非法时按无游标处理', () => {
    appendActivity({ type: 'sync', summary: '一条' }, { hubRoot, now: () => NOV });
    const page = readActivity({ cursor: 'not-a-cursor' }, { hubRoot, now: () => NOV });
    expect(page.items).toHaveLength(1);
  });

  it('分片按月份滚动：跨月写入落到不同文件', () => {
    appendActivity({ type: 'sync', summary: '十月' }, { hubRoot, now: () => new Date(2026, 9, 31, 23, 0, 0) });
    appendActivity({ type: 'sync', summary: '十一月' }, { hubRoot, now: () => NOV });

    const names = readdirSync(activityDir(hubRoot)).sort();
    expect(names).toEqual(['2026-10.jsonl', '2026-11.jsonl']);
  });
});
