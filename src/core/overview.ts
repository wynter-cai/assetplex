/**
 * 首页 overview 聚合服务
 *
 * 聚合资产统计、连接状态、最近活动等数据，
 * 为前端首页提供单一 API 入口，避免前端多次请求。
 *
 * 对应 api-contract: GetOverviewApi
 */

import { checkHubHealth, HUB_CATEGORIES } from './hub-files.js';
import { hubContext } from '../server/lib/hub-context.js';
import type { ToolAdapter } from './adapters/base.js';

/** 前端资产类别（单数形式） */
export type FrontendCategory = 'identity' | 'skill' | 'rule' | 'mcp';

/** 后端类别到前端类别的映射 */
const CATEGORY_MAP: Record<string, FrontendCategory> = {
  identity: 'identity',
  skills: 'skill',
  rules: 'rule',
  mcp: 'mcp',
};

/** 工具连接状态（前端用） */
export type ConnectionStatus = 'synced' | 'pending' | 'not_connected' | 'not_installed';

/** 工具连接信息 */
export interface ConnectionInfo {
  toolId: string;
  toolName: string;
  status: ConnectionStatus;
  assetCount: number;
  pendingCount: number;
  lastSyncedAt?: string;
}

/** 活动项 */
export interface ActivityInfo {
  id: string;
  type: 'import' | 'sync' | 'edit' | 'create';
  description: string;
  occurredAt: string;
}

/** overview 返回结构 */
export interface OverviewData {
  assetStats: Record<FrontendCategory, number>;
  connections: ConnectionInfo[];
  recentActivities: ActivityInfo[];
  hubInitialized: boolean;
  healthScore: number;
}

/**
 * 获取首页聚合数据
 */
export async function getOverview(): Promise<OverviewData> {
  const health = checkHubHealth();

  // 1. 资产统计（后端复数类别 → 前端单数类别）
  const assetStats = {
    identity: 0,
    skill: 0,
    rule: 0,
    mcp: 0,
  } as Record<FrontendCategory, number>;

  for (const cat of HUB_CATEGORIES) {
    const frontendCat = CATEGORY_MAP[cat];
    if (frontendCat) {
      assetStats[frontendCat] = health.fileCountByCategory[cat] ?? 0;
    }
  }

  const totalAssets = Object.values(assetStats).reduce((s, n) => s + n, 0);
  const hubInitialized = health.hubExists && health.hubTomlExists && totalAssets > 0;

  // 2. 健康度计算（简单算法）
  const healthScore = computeHealthScore(totalAssets);

  // 3. 工具连接状态
  const connections = await getConnections();

  // 4. 最近活动
  const recentActivities = getRecentActivities();

  return {
    assetStats,
    connections,
    recentActivities,
    hubInitialized,
    healthScore,
  };
}

function computeHealthScore(totalAssets: number): number {
  if (totalAssets === 0) return 0;
  return Math.min(100, 60 + totalAssets * 4);
}

async function getConnections(): Promise<ConnectionInfo[]> {
  const adapters = hubContext.getAllAdapters() as ToolAdapter[];
  const config = hubContext.getConfig();

  const results: ConnectionInfo[] = [];

  for (const adapter of adapters) {
    try {
      const status = await adapter.detect();
      const toolConfig = (config.tools as Record<string, { enabled?: boolean }> | undefined)?.[adapter.name];
      const enabled = toolConfig?.enabled ?? false;

      if (!status.installed) {
        results.push({
          toolId: adapter.name,
          toolName: adapter.displayName,
          status: 'not_installed',
          assetCount: 0,
          pendingCount: 0,
        });
        continue;
      }

      // 已安装但未启用 → not_connected
      if (!enabled) {
        results.push({
          toolId: adapter.name,
          toolName: adapter.displayName,
          status: 'not_connected',
          assetCount: 0,
          pendingCount: 0,
        });
        continue;
      }

      // 已安装且已启用 → synced（Phase 1 简化，Phase 2 精确判断 pending）
      results.push({
        toolId: adapter.name,
        toolName: adapter.displayName,
        status: 'synced',
        assetCount: 0,
        pendingCount: 0,
      });
    } catch {
      results.push({
        toolId: adapter.name,
        toolName: adapter.displayName,
        status: 'not_installed',
        assetCount: 0,
        pendingCount: 0,
      });
    }
  }

  // 排序：已安装的在前
  const statusOrder: Record<ConnectionStatus, number> = { synced: 0, pending: 1, not_connected: 2, not_installed: 3 };
  results.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return results;
}

/**
 * 获取最近活动
 *
 * Phase 1 返回空数组，Phase 3 活动页实现时接入 sync history。
 */
function getRecentActivities(): ActivityInfo[] {
  return [];
}
