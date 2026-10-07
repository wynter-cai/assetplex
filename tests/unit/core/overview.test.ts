/**
 * 首页 overview 聚合服务测试
 *
 * spec: home-page R1, R2, R4, R5
 *       fix-ui-trust-gaps: overview-init-state（hubInitialized 新判定 + assetStats 五类）
 * api-contract: GetOverviewApi
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOverview } from '../../../src/core/overview.js';
import { checkHubHealth } from '../../../src/core/hub-files.js';

// mock overview.ts 依赖的模块
vi.mock('../../../src/server/lib/hub-context.js', () => ({
  hubContext: {
    getConfig: () => ({ tools: {} }),
    getAllAdapters: () => [],
  },
}));

vi.mock('../../../src/core/hub-files.js', () => ({
  checkHubHealth: vi.fn(),
  HUB_CATEGORIES: ['identity', 'skills', 'rules', 'preferences', 'mcp', 'commands', 'agents'],
  listHubFiles: () => [],
}));

/** 构造健康检查结果（默认：常规已初始化用户） */
function makeHealth(overrides: Partial<ReturnType<typeof base>> = {}): ReturnType<typeof base> {
  return { ...base(), ...overrides };
}

function base(): {
  hubRoot: string;
  hubExists: boolean;
  hubTomlExists: boolean;
  fileCountByCategory: Record<string, number>;
  totalFiles: number;
} {
  return {
    hubRoot: '/mock/hub',
    hubExists: true,
    hubTomlExists: true,
    fileCountByCategory: { identity: 1, skills: 3, rules: 5, mcp: 2, preferences: 0, commands: 0, agents: 4 },
    totalFiles: 15,
  };
}

beforeEach(() => {
  vi.mocked(checkHubHealth).mockReset();
  vi.mocked(checkHubHealth).mockReturnValue(makeHealth());
});

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

    expect(result.assetStats.identity).toBe(1);
    expect(result.assetStats.skill).toBe(3);
    expect(result.assetStats.rule).toBe(5);
    expect(result.assetStats.mcp).toBe(2);
  });

  it('assetStats 包含第 5 类 agent，计数来自 agents 目录（fix-ui-trust-gaps T2）', async () => {
    const result = await getOverview();
    expect(result.assetStats).toHaveProperty('agent');
    expect(result.assetStats.agent).toBe(4);
  });

  it('hubInitialized 在有资产时为 true', async () => {
    const result = await getOverview();
    expect(result.hubInitialized).toBe(true);
  });

  it('hub.toml 缺失但目录存在且有资产时仍视为已初始化（fix-ui-trust-gaps T1）', async () => {
    vi.mocked(checkHubHealth).mockReturnValue(
      makeHealth({ hubExists: true, hubTomlExists: false }),
    );
    const result = await getOverview();
    expect(result.hubInitialized).toBe(true);
  });

  it('保险箱目录不存在时为未初始化', async () => {
    vi.mocked(checkHubHealth).mockReturnValue(
      makeHealth({ hubExists: false, hubTomlExists: false, totalFiles: 0, fileCountByCategory: {} }),
    );
    const result = await getOverview();
    expect(result.hubInitialized).toBe(false);
  });

  it('目录存在但五类资产全空时为未初始化', async () => {
    vi.mocked(checkHubHealth).mockReturnValue(
      makeHealth({
        hubExists: true,
        hubTomlExists: false,
        fileCountByCategory: { identity: 0, skills: 0, rules: 0, mcp: 0, preferences: 0, commands: 0, agents: 0 },
        totalFiles: 0,
      }),
    );
    const result = await getOverview();
    expect(result.hubInitialized).toBe(false);
    expect(result.assetStats.identity).toBe(0);
    expect(result.assetStats.agent).toBe(0);
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
