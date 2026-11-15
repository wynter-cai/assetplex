/**
 * 首页行动面板聚合接口（refactor-home-action-panel T4）
 *
 * GET /api/home/dashboard：一次成型返回状态条 / 今日待办 / 工具矩阵 / 最近变化。
 * 只读：治理数据复用共享快照（30 秒缓存），语义结论只读医生缓存，绝不调模型。
 *
 * 口径（spec home-dashboard）：
 * - 「待治理」= 跨四维去重后的条目数，不得等于四维 issueCount 之和
 * - 「未同步」= 分发一致性维度问题数（资产 × 工具），与健康分同源
 * - 任一数据源读取失败只让该块降级（null / available:false），不整体 500
 *
 * api-contract: 设计文档/changes/refactor-home-action-panel/api-contract.ts
 */

import { Hono } from 'hono';
import { hubContext } from '../lib/hub-context.js';
import { getDistributions } from '../lib/distribution-context.js';
import {
  createGovernanceSnapshot,
  type GovernanceSnapshot,
  type GovernanceSnapshotDeps,
} from '../lib/governance-snapshot.js';
import {
  collectGovernanceQueue,
  type HealthDimension,
  type GovernanceHealth,
  type HealthIssueRef,
} from '../../core/governance-health.js';
import { readActivity, type ActivityEntry, type ActivityPage, type ActivityQuery } from '../../core/activity-log.js';
import { readBackupStatus, type BackupStatus } from '../../core/backup-status.js';
import type { DistributionIndexResponse } from '../../core/distribution-index.js';
import type { ToolAdapter } from '../../core/adapters/base.js';
import type { HubConfig } from '../../core/config.js';
import type { DiagnosisSeverity } from '../../core/types.js';
import type { HealthGrade } from '../../core/governance-health.js';

export type HomeToolState = 'synced' | 'drift' | 'not_connected' | 'not_installed' | 'unknown';

export interface HomeToolRow {
  toolId: string;
  toolName: string;
  state: HomeToolState;
  /** state='unknown' 时为 null（不填 0） */
  driftAssetCount: number | null;
  /** null = 尚无同步记录 */
  lastSyncedAt: string | null;
}

export interface HomeIssueQueue {
  available: boolean;
  total: number | null;
  bySeverity: Record<DiagnosisSeverity, number> | null;
  items: HealthIssueRef[];
}

export interface HomeStatusNumbers {
  healthScore: number | null;
  healthGrade: HealthGrade | null;
  totalAssets: number | null;
  unsyncedCount: number | null;
  lastBackupAt: string | null;
  backupState: 'recorded' | 'none' | 'unavailable';
}

export interface HomeDashboardResponse {
  generatedAt: string;
  hubInitialized: boolean;
  status: HomeStatusNumbers;
  issues: HomeIssueQueue;
  tools: HomeToolRow[];
  recentActivity: ActivityEntry[];
  healthComputedAt: string | null;
  partial: boolean;
  failedTools: string[];
}

/** 首页路由依赖：治理装配依赖 + 各数据源（测试全部可注入） */
export interface HomeRouteDeps extends Omit<GovernanceSnapshotDeps, 'distributions'> {
  getDistributions?: (refresh: boolean) => Promise<DistributionIndexResponse>;
  listAdapters?: () => ToolAdapter[];
  getConfig?: () => HubConfig;
  readActivity?: (query: ActivityQuery) => ActivityPage;
  backupStatus?: () => BackupStatus;
  /** 完全替换快照读取（模拟资产快照读取失败 / 观察 refresh 透传） */
  loadSnapshot?: (force: boolean) => Promise<GovernanceSnapshot>;
}

const DEFAULT_ISSUES_LIMIT = 5;
const MAX_ISSUES_LIMIT = 20;
/** 找「最近同步」时读取的同步记录上限（活动日志单次上限 100） */
const SYNC_SCAN_LIMIT = 100;
const RECENT_LIMIT = 5;

/** issuesLimit：缺省 5，必须是 1-20 的整数 */
function parseIssuesLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return DEFAULT_ISSUES_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ISSUES_LIMIT) return null;
  return value;
}

/** refresh：只允许 0 / 1 */
function parseRefresh(raw: string | undefined): boolean | null {
  if (raw === undefined || raw === '' || raw === '0') return false;
  if (raw === '1') return true;
  return null;
}

/** hub.toml 中该工具是否启用 */
function isToolEnabled(config: HubConfig, name: string): boolean {
  const tools = config.tools as Record<string, { enabled?: boolean } | undefined>;
  return tools[name]?.enabled ?? false;
}

/** 该工具下 conflict + pending 的条目数（「N 处未同步」的逐工具口径） */
function countDrift(index: DistributionIndexResponse['index'], toolId: string): number {
  let count = 0;
  for (const entries of Object.values(index)) {
    for (const entry of entries) {
      if (entry.toolId !== toolId) continue;
      if (entry.status === 'conflict' || entry.status === 'pending') count += 1;
    }
  }
  return count;
}

interface ToolRowContext {
  distribution: DistributionIndexResponse | null;
  config: HubConfig;
  lastSyncByTool: Map<string, string>;
  failedTools: Set<string>;
}

async function buildToolRow(adapter: ToolAdapter, ctx: ToolRowContext): Promise<HomeToolRow> {
  const base = {
    toolId: adapter.name,
    toolName: adapter.displayName,
    lastSyncedAt: ctx.lastSyncByTool.get(adapter.name) ?? null,
  };

  let installed: boolean;
  try {
    installed = (await adapter.detect()).installed;
  } catch {
    ctx.failedTools.add(adapter.name);
    return { ...base, state: 'unknown', driftAssetCount: null };
  }
  if (!installed) return { ...base, state: 'not_installed', driftAssetCount: 0 };
  if (!isToolEnabled(ctx.config, adapter.name)) {
    return { ...base, state: 'not_connected', driftAssetCount: 0 };
  }
  if (ctx.distribution === null || ctx.distribution.failedTools.includes(adapter.name)) {
    ctx.failedTools.add(adapter.name);
    return { ...base, state: 'unknown', driftAssetCount: null };
  }

  const drift = countDrift(ctx.distribution.index, adapter.name);
  return { ...base, state: drift > 0 ? 'drift' : 'synced', driftAssetCount: drift };
}

function buildStatus(
  health: GovernanceHealth | null,
  distribution: DistributionIndexResponse | null,
  backup: BackupStatus,
): HomeStatusNumbers {
  const dimension: HealthDimension | undefined = health?.dimensions.find((item) => item.id === 'distribution');
  const unsyncedCount =
    distribution !== null && dimension !== undefined && dimension.applicability === 'applicable'
      ? dimension.issueCount
      : null;
  return {
    // 空库不给 0 分（grade='empty' 时界面显示「待盘点」）
    healthScore: health === null || health.grade === 'empty' ? null : health.score,
    healthGrade: health?.grade ?? null,
    totalAssets: health?.totalAssets ?? null,
    unsyncedCount,
    lastBackupAt: backup.lastBackupAt,
    backupState: backup.state,
  };
}

function buildIssues(snapshot: GovernanceSnapshot | null, limit: number): HomeIssueQueue {
  if (snapshot === null) return { available: false, total: null, bySeverity: null, items: [] };
  const queue = collectGovernanceQueue(snapshot.assets, snapshot.groups, limit);
  return { available: true, total: queue.total, bySeverity: queue.bySeverity, items: queue.items };
}

/** 读活动日志：失败返回空数组（最近变化为空，不影响其他块） */
function readEntries(read: (query: ActivityQuery) => ActivityPage, query: ActivityQuery): ActivityEntry[] {
  try {
    return read(query).items;
  } catch {
    return [];
  }
}

/** 每个工具最近一次同步时间（取活动日志 type=sync 中含该工具的最新一条） */
function buildLastSyncMap(syncEntries: readonly ActivityEntry[]): Map<string, string> {
  const lastSync = new Map<string, string>();
  for (const entry of syncEntries) {
    for (const target of entry.targets ?? []) {
      if (!lastSync.has(target)) lastSync.set(target, entry.at);
    }
  }
  return lastSync;
}

function readBackupSafely(read: () => BackupStatus): BackupStatus {
  try {
    return read();
  } catch {
    return { state: 'unavailable', lastBackupAt: null };
  }
}

/** 创建首页路由（依赖可注入；缺省走真实 Hub） */
export function createHomeRoutes(deps: HomeRouteDeps = {}): Hono {
  const routes = new Hono();

  /** 本次请求的分发索引：快照装配与工具矩阵共用同一份（不重复计算） */
  let latestDistribution: DistributionIndexResponse | null = null;

  const snapshotStore = createGovernanceSnapshot({
    ...deps,
    distributions: (hubRelativePath) => latestDistribution?.index[hubRelativePath] ?? [],
  });
  const loadSnapshot = deps.loadSnapshot ?? ((force: boolean) => snapshotStore.load(force));
  const loadDistributions = deps.getDistributions ?? ((refresh: boolean) => getDistributions(refresh));
  const listAdapters = deps.listAdapters ?? (() => hubContext.getAllAdapters());
  const getConfig = deps.getConfig ?? (() => hubContext.getConfig());
  const readActivityFn = deps.readActivity ?? readActivity;
  const backupStatusFn = deps.backupStatus ?? (() => readBackupStatus());
  const now = deps.now ?? (() => new Date().toISOString());

  routes.get('/dashboard', async (c) => {
    const issuesLimit = parseIssuesLimit(c.req.query('issuesLimit'));
    if (issuesLimit === null) return c.json({ error: 'issuesLimit 必须是 1-20 的整数' }, 400);
    const refresh = parseRefresh(c.req.query('refresh'));
    if (refresh === null) return c.json({ error: 'refresh 只允许 0 或 1' }, 400);

    try {
      latestDistribution = await loadDistributions(refresh);
    } catch {
      latestDistribution = null;
    }

    let snapshot: GovernanceSnapshot | null = null;
    try {
      snapshot = await loadSnapshot(refresh);
    } catch {
      snapshot = null;
    }

    const failedTools = new Set<string>(latestDistribution?.failedTools ?? []);
    const lastSyncByTool = buildLastSyncMap(readEntries(readActivityFn, { limit: SYNC_SCAN_LIMIT, type: 'sync' }));
    const context: ToolRowContext = {
      distribution: latestDistribution,
      config: getConfig(),
      lastSyncByTool,
      failedTools,
    };
    const tools = await Promise.all(listAdapters().map((adapter) => buildToolRow(adapter, context)));

    const response: HomeDashboardResponse = {
      generatedAt: now(),
      hubInitialized: snapshot !== null && snapshot.health.totalAssets > 0,
      status: buildStatus(snapshot?.health ?? null, latestDistribution, readBackupSafely(backupStatusFn)),
      issues: buildIssues(snapshot, issuesLimit),
      tools,
      recentActivity: readEntries(readActivityFn, { limit: RECENT_LIMIT }),
      healthComputedAt: snapshot?.health.computedAt ?? null,
      partial: failedTools.size > 0,
      failedTools: Array.from(failedTools),
    };
    return c.json(response);
  });

  return routes;
}
