/**
 * 操作事件日志（add-activity-log）
 *
 * 唯一持久面：`<Hub>/governance/activity/YYYY-MM.jsonl`，append-only、按月分片。
 * 写入 best-effort（失败返回 null，绝不阻断主流程）；读取按时间倒序，支持类型过滤与游标分页。
 *
 * spec: 设计文档/changes/add-activity-log/specs/activity-feed.spec.md
 * api-contract: 设计文档/changes/add-activity-log/api-contract.ts
 */

import { appendFileSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getHubRoot } from '../utils/paths.js';
import { ensureDir } from '../utils/fs.js';

/** 活动类型闭集（与首页图标表一致，禁止扩张） */
export type ActivityType = 'import' | 'sync' | 'edit' | 'create';

/** 操作发起方：本期只写 web；mcp / cli 预留 */
export type ActivityActor = 'web' | 'mcp' | 'cli';

/** 活动类型全集（接口参数校验用） */
export const ACTIVITY_TYPES: readonly ActivityType[] = ['import', 'sync', 'edit', 'create'];

/** 保留期（月）；超期分片读取时忽略、写入时删除 */
export const ACTIVITY_RETENTION_MONTHS = 6;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** 单条日志最多记录的路径数，避免批次过大撑爆单行 */
const MAX_PATHS = 50;
const SHARD_PATTERN = /^\d{4}-\d{2}\.jsonl$/;

/** 一条活动记录 */
export interface ActivityEntry {
  /** 条目唯一 ID */
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
  /** 涉及的 Hub 相对路径 */
  paths?: string[];
}

/** 追加一条活动所需的字段（id/at/actor 由实现补齐） */
export interface AppendActivityInput {
  type: ActivityType;
  summary: string;
  actor?: ActivityActor;
  targets?: string[];
  counts?: Record<string, number>;
  paths?: string[];
}

/** 读取参数 */
export interface ActivityQuery {
  /** 1-100，缺省 20 */
  limit?: number;
  /** 类型过滤，缺省全部 */
  type?: ActivityType;
  /** 游标：上一页返回的 nextCursor */
  cursor?: string;
}

/** 读取结果 */
export interface ActivityPage {
  items: ActivityEntry[];
  nextCursor: string | null;
}

export interface AppendActivityOptions {
  hubRoot?: string;
  now?: () => Date;
  id?: () => string;
}

export interface ReadActivityOptions {
  hubRoot?: string;
  now?: () => Date;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 某日期所属分片的月份键（本地时区，与用户看到的日期一致） */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** 当前时间往前推 months 个月的月份键（分片裁剪的边界，含当月） */
function cutoffMonth(now: Date, months: number = ACTIVITY_RETENTION_MONTHS): string {
  return monthKey(new Date(now.getFullYear(), now.getMonth() - months, 1));
}

/** 活动日志目录（导出供路由与测试复用） */
export function activityDir(hubRoot: string = getHubRoot()): string {
  return join(hubRoot, 'governance', 'activity');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

function isActor(value: unknown): value is ActivityActor {
  return value === 'web' || value === 'mcp' || value === 'cli';
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return undefined;
  return value.slice(0, MAX_PATHS);
}

function asNumberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(([, n]) => typeof n === 'number' && Number.isFinite(n));
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, number>;
}

/** 解析单行日志；格式不合法返回 null（坏行跳过，不影响其余条目） */
function parseEntry(line: string): ActivityEntry | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { id, at, type, actor, summary } = raw;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (!isActivityType(type) || !isActor(actor)) return null;
  if (typeof summary !== 'string') return null;

  const entry: ActivityEntry = { id, at, type, actor, summary };
  const targets = asStringArray(raw.targets);
  if (targets !== undefined) entry.targets = targets;
  const counts = asNumberRecord(raw.counts);
  if (counts !== undefined) entry.counts = counts;
  const paths = asStringArray(raw.paths);
  if (paths !== undefined) entry.paths = paths;
  return entry;
}

/** 删除超期分片（best-effort；写入时顺带清理，不做后台任务） */
function pruneShards(dir: string, now: Date): void {
  const cutoff = cutoffMonth(now);
  for (const name of readdirSync(dir)) {
    if (!SHARD_PATTERN.test(name)) continue;
    if (name.slice(0, 7) >= cutoff) continue;
    try {
      unlinkSync(join(dir, name));
    } catch {
      // 清理失败不影响写入结果
    }
  }
}

/**
 * 追加一条活动（best-effort）
 *
 * @returns 写入成功的条目；失败返回 null（调用方不得因日志失败改变主流程结果）
 */
export function appendActivity(
  input: AppendActivityInput,
  options: AppendActivityOptions = {},
): ActivityEntry | null {
  try {
    const now = options.now?.() ?? new Date();
    const entry: ActivityEntry = {
      id: options.id?.() ?? randomUUID(),
      at: now.toISOString(),
      type: input.type,
      actor: input.actor ?? 'web',
      summary: input.summary,
    };
    if (input.targets !== undefined) entry.targets = input.targets.slice(0, MAX_PATHS);
    if (input.counts !== undefined) entry.counts = input.counts;
    if (input.paths !== undefined) entry.paths = input.paths.slice(0, MAX_PATHS);

    const dir = activityDir(options.hubRoot ?? getHubRoot());
    ensureDir(dir);
    appendFileSync(join(dir, `${monthKey(now)}.jsonl`), `${JSON.stringify(entry)}\n`, 'utf-8');
    pruneShards(dir, now);
    return entry;
  } catch {
    return null;
  }
}

/** 游标格式：`<at>|<id>` */
export function activityCursor(entry: Pick<ActivityEntry, 'at' | 'id'>): string {
  return `${entry.at}|${entry.id}`;
}

function parseCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (cursor === undefined || cursor === '') return null;
  const index = cursor.lastIndexOf('|');
  if (index <= 0) return null;
  const at = cursor.slice(0, index);
  const id = cursor.slice(index + 1);
  if (id === '' || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}

/** 倒序比较：新的在前；同一时间按 id 倒序，保证顺序稳定 */
function compareDesc(a: ActivityEntry, b: ActivityEntry): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function isOlderThan(entry: ActivityEntry, cursor: { at: string; id: string }): boolean {
  if (entry.at !== cursor.at) return entry.at < cursor.at;
  return entry.id < cursor.id;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  const value = Math.floor(limit);
  if (value < 1) return 1;
  if (value > MAX_LIMIT) return MAX_LIMIT;
  return value;
}

/** 读取保留期内的全部分片（新→旧逐文件），坏文件与坏行跳过 */
function readEntries(dir: string, cutoff: string): ActivityEntry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const shards = names
    .filter((name) => SHARD_PATTERN.test(name) && name.slice(0, 7) >= cutoff)
    .sort()
    .reverse();

  const entries: ActivityEntry[] = [];
  for (const name of shards) {
    let content: string;
    try {
      content = readFileSync(join(dir, name), 'utf-8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const entry = parseEntry(line);
      if (entry !== null) entries.push(entry);
    }
  }
  return entries;
}

/**
 * 读取活动（时间倒序，新→旧）
 *
 * 分片不存在、全部超期、或日志文件损坏时返回空列表，不抛错。
 */
export function readActivity(query: ActivityQuery = {}, options: ReadActivityOptions = {}): ActivityPage {
  const now = options.now?.() ?? new Date();
  const dir = activityDir(options.hubRoot ?? getHubRoot());
  if (!existsSync(dir)) return { items: [], nextCursor: null };

  const limit = normalizeLimit(query.limit);
  const entries = readEntries(dir, cutoffMonth(now));
  entries.sort(compareDesc);

  let filtered = query.type === undefined ? entries : entries.filter((entry) => entry.type === query.type);
  const cursor = parseCursor(query.cursor);
  if (cursor !== null) {
    const bound = cursor;
    filtered = filtered.filter((entry) => isOlderThan(entry, bound));
  }

  const items = filtered.slice(0, limit);
  const hasMore = filtered.length > items.length;
  const nextCursor = hasMore && items.length > 0 ? activityCursor(items[items.length - 1]) : null;
  return { items, nextCursor };
}
