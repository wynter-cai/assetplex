/**
 * 首页 overview 聚合服务测试
 *
 * spec: home-page R1, R2, R4, R5
 * api-contract: GetOverviewApi
 */

import { describe, it, expect, vi } from 'vitest';
import { getOverview } from '../../../src/core/overview.js';

// mock overview.ts 依赖的模块
vi.mock('../../../src/server/lib/hub-context.js', () => ({
  hubContext: {
    getConfig: () => ({ tools: {} }),
    getAllAdapters: () => [],
  },
}));

vi.mock('../../../src/core/hub-files.js', () => ({
  checkHubHealth: () => ({
    hubRoot: '/mock/hub',
    hubExists: true,
    hubTomlExists: true,
    fileCountByCategory: { identity: 1, skills: 3, rules: 5, mcp: 2, preferences: 0, commands: 0, agents: 0 },
    totalFiles: 11,
  }),
  HUB_CATEGORIES: ['identity', 'skills', 'rules', 'preferences', 'mcp', 'commands', 'agents'],
  listHubFiles: () => [],
}));

describe('getOverview', () => {
  it('返回符合 api-contract 的完整数据结构', async () => {
    const result = await getOverview();

    expect(result).toHaveProperty('assetStats');
    expect(result).toHaveProperty('connections');
    expect(result).toHaveProperty('recentActivities');
    expect(result).toHaveProperty('hubInitialized');
    expect(result).toHaveProperty('healthScore');
  });

  it('assetStats 将后端复数类别映射为前端单数类别', async () => {
    const result = await getOverview();

    expect(result.assetStats).toHaveProperty('identity');
    expect(result.assetStats).toHaveProperty('skill');
    expect(result.assetStats).toHaveProperty('rule');
    expect(result.assetStats).toHaveProperty('mcp');

    expect(result.assetStats.identity).toBe(1);
    expect(result.assetStats.skill).toBe(3);
    expect(result.assetStats.rule).toBe(5);
    expect(result.assetStats.mcp).toBe(2);
  });

  it('hubInitialized 在有资产时为 true', async () => {
    const result = await getOverview();
    expect(result.hubInitialized).toBe(true);
  });

  it('healthScore 是 0-100 之间的数字', async () => {
    const result = await getOverview();
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
  });

  it('connections 中每项包含 status 字段', async () => {
    const result = await getOverview();
    expect(Array.isArray(result.connections)).toBe(true);
    for (const conn of result.connections) {
      expect(conn).toHaveProperty('toolId');
      expect(conn).toHaveProperty('toolName');
      expect(conn).toHaveProperty('status');
      expect(['synced', 'pending', 'not_connected', 'not_installed']).toContain(conn.status);
    }
  });

  it('recentActivities 返回数组', async () => {
    const result = await getOverview();
    expect(Array.isArray(result.recentActivities)).toBe(true);
  });
});
