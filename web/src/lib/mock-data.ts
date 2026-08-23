/**
 * 首页 mock 数据
 *
 * P1-T2 阶段用 mock 数据先跑通布局。
 * P1-T7/T8 会接入真实 API（GET /api/hub/overview）。
 */

import { ASSET_CATEGORIES } from '@/config/asset-categories';

export interface HomeOverviewData {
  assetStats: Record<string, number>;
  connections: MockConnection[];
  recentActivities: MockActivity[];
  hubInitialized: boolean;
  healthScore: number;
}

export interface MockConnection {
  toolId: string;
  toolName: string;
  status: 'synced' | 'pending' | 'not_connected' | 'not_installed';
  assetCount: number;
  pendingCount?: number;
}

export interface MockActivity {
  id: string;
  type: 'import' | 'sync' | 'edit' | 'create';
  description: string;
  time: string;
}

/** 模拟"有数据"的首页 */
export const mockOverview: HomeOverviewData = {
  assetStats: {
    identity: 1,
    skill: 3,
    rule: 5,
    mcp: 2,
  },
  connections: [
    { toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced', assetCount: 4 },
    { toolId: 'workbuddy', toolName: 'WorkBuddy', status: 'pending', assetCount: 3, pendingCount: 2 },
    { toolId: 'claude-code', toolName: 'Claude Code', status: 'not_connected', assetCount: 0 },
    { toolId: 'codex', toolName: 'Codex', status: 'not_installed', assetCount: 0 },
  ],
  recentActivities: [
    { id: '1', type: 'import', description: '从 TRAE 导入 identity/profile.md（合并）', time: '今天 14:30' },
    { id: '2', type: 'sync', description: '同步 3 项资产到 WorkBuddy', time: '今天 14:28' },
    { id: '3', type: 'edit', description: '修改 skills/react-expert.md', time: '今天 10:12' },
    { id: '4', type: 'create', description: '创建 rules/typescript.md', time: '昨天 21:00' },
    { id: '5', type: 'import', description: '从 WorkBuddy 导入 .mcp.json（覆盖）', time: '昨天 18:45' },
  ],
  hubInitialized: true,
  healthScore: 85,
};

/** 模拟"空状态"的首页（首次使用） */
export const mockEmptyOverview: HomeOverviewData = {
  assetStats: ASSET_CATEGORIES.reduce(
    (acc, cat) => ({ ...acc, [cat.code]: 0 }),
    {} as Record<string, number>,
  ),
  connections: [],
  recentActivities: [],
  hubInitialized: false,
  healthScore: 0,
};
