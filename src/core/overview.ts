/**
 * 首页 overview 聚合服务
 *
 * 聚合资产统计、连接状态、最近活动等数据，
 * 为前端首页提供单一 API 入口，避免前端多次请求。
 *
 * 对应 api-contract: GetOverviewApi
 */

import { checkHubHealth, HUB_CATEGORIES } from './hub-files.js';
import type { HubConfig } from './config.js';
import type { ToolAdapter } from './adapters/base.js';

/**
 * getOverview 的外部依赖：由 server 层注入
 *
 * core 不读全局单例（依赖方向守卫 tests/unit/core/dependency-direction.test.ts，H6）。
 */
export interface OverviewDeps {
  adapters: ToolAdapter[];
  hubConfig: HubConfig;
}

/** 前端资产类别（单数形式，与前端 ASSET_CATEGORIES 对齐） */
export type FrontendCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'agent' | 'memory';

/** 后端类别到前端类别的映射 */
const CATEGORY_MAP: Record<string, FrontendCategory> = {
  identity: 'identity',
  skills: 'skill',
  rules: 'rule',
  mcp: 'mcp',
  agents: 'agent',
  memory: 'memory',
  // 历史兜底目录并入记忆（与 assets.ts 同口径，不单独计数）
  preferences: 'memory',
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
 *
 * @param deps 适配器与配置（server 层从 hubContext 取后传入）
 */
export async function getOverview(deps: OverviewDeps): Promise<OverviewData> {
  const health = checkHubHealth();

  // 1. 资产统计（后端复数类别 → 前端单数类别）
  const assetStats = {
    identity: 0,
    skill: 0,
    rule: 0,
    mcp: 0,
    agent: 0,
    memory: 0,
  } as Record<FrontendCategory, number>;

  for (const cat of HUB_CATEGORIES) {
    const frontendCat = CATEGORY_MAP[cat];
    if (frontendCat) {
      // 多个后端目录可能并入同一前端类别（preferences → memory），故累加而非覆盖
      assetStats[frontendCat] += health.fileCountByCategory[cat] ?? 0;
    }
  }

  const totalAssets = Object.values(assetStats).reduce((s, n) => s + n, 0);
  // 有资产即视为已开始使用：hub.toml 缺失属于可自愈的配置缺口（getConfig 有默认值），
  // 不应把保险箱中已有资产的用户挡在指挥中心之外（fix-ui-trust-gaps T1）
  const hubInitialized = health.hubExists && totalAssets > 0;

  // 2. 健康度计算（简单算法）
  const healthScore = computeHealthScore(totalAssets);

  // 3. 工具连接状态
  const connections = await getConnections(deps);

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

/** hub.toml 中该工具是否启用（tools 是固定键对象，按名字查需窄化） */
function isToolEnabled(config: HubConfig, name: string): boolean {
  const tools: Record<string, { enabled?: boolean } | undefined> = config.tools;
  return tools[name]?.enabled ?? false;
}

async function getConnections(deps: OverviewDeps): Promise<ConnectionInfo[]> {
  const { adapters, hubConfig } = deps;

  const results: ConnectionInfo[] = [];

  for (const adapter of adapters) {
    try {
      const status = await adapter.detect();
      const enabled = isToolEnabled(hubConfig, adapter.name);

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
