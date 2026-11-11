/**
 * 首页 overview 聚合服务测试
 *
 * spec: home-page R1, R2, R4, R5
 *       fix-ui-trust-gaps: overview-init-state（hubInitialized 新判定 + assetStats 五类）
 * api-contract: GetOverviewApi
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOverview, type OverviewDeps } from '../../../src/core/overview.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import { checkHubHealth } from '../../../src/core/hub-files.js';

// core 不再 import server：适配器与配置由调用方注入（H6 依赖方向守卫）
vi.mock('../../../src/core/hub-files.js', () => ({
  checkHubHealth: vi.fn(),
  HUB_CATEGORIES: ['identity', 'skills', 'rules', 'preferences', 'mcp', 'commands', 'agents', 'memory'],
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

/** 默认依赖：无适配器（连接列表用例单独注入） */
const DEFAULT_DEPS: OverviewDeps = { adapters: [], hubConfig: HubConfigSchema.parse({}) };

/** 造一个只需 detect() 的假适配器 */
function makeAdapter(name: string, displayName: string, installed: boolean): ToolAdapter {
  return {
    name,
    displayName,
    async detect() {
      return { name, installed, configDirExists: installed, configDir: '' };
    },
    targets() {
      return [];
    },
    resolveHubItems() {
      return [];
    },
    async apply() {},
    async import() {
      return { type: 'identity', relativePath: '', absolutePath: '' };
    },
    async scan() {
      return [];
    },
    transform(content: Buffer) {
      return content;
    },
  };
}

describe('getOverview', () => {
  it('返回符合 api-contract 的完整数据结构', async () => {
    const result = await getOverview(DEFAULT_DEPS);

    expect(result).toHaveProperty('assetStats');
    expect(result).toHaveProperty('connections');
    expect(result).toHaveProperty('recentActivities');
    expect(result).toHaveProperty('hubInitialized');
    // 假健康分（60 + 资产数×4）已移除：首页健康卡改读 /api/governance/health
    expect(result).not.toHaveProperty('healthScore');
  });

  it('assetStats 将后端复数类别映射为前端单数类别', async () => {
    const result = await getOverview(DEFAULT_DEPS);

    expect(result.assetStats.identity).toBe(1);
    expect(result.assetStats.skill).toBe(3);
    expect(result.assetStats.rule).toBe(5);
    expect(result.assetStats.mcp).toBe(2);
  });

  it('assetStats 包含第 5 类 agent，计数来自 agents 目录（fix-ui-trust-gaps T2）', async () => {
    const result = await getOverview(DEFAULT_DEPS);
    expect(result.assetStats).toHaveProperty('agent');
    expect(result.assetStats.agent).toBe(4);
  });

  it('assetStats 纳入 memory 计数（enable-tool-hot-swap T1）', async () => {
    vi.mocked(checkHubHealth).mockReturnValue(
      makeHealth({
        fileCountByCategory: { identity: 1, skills: 3, rules: 5, mcp: 2, preferences: 0, commands: 0, agents: 4, memory: 2 },
        totalFiles: 17,
      }),
    );
    const result = await getOverview(DEFAULT_DEPS);
    expect(result.assetStats).toHaveProperty('memory');
    expect(result.assetStats.memory).toBe(2);
  });

  it('hubInitialized 在有资产时为 true', async () => {
    const result = await getOverview(DEFAULT_DEPS);
    expect(result.hubInitialized).toBe(true);
  });

  it('hub.toml 缺失但目录存在且有资产时仍视为已初始化（fix-ui-trust-gaps T1）', async () => {
    vi.mocked(checkHubHealth).mockReturnValue(
      makeHealth({ hubExists: true, hubTomlExists: false }),
    );
    const result = await getOverview(DEFAULT_DEPS);
    expect(result.hubInitialized).toBe(true);
  });

  it('保险箱目录不存在时为未初始化', async () => {
    vi.mocked(checkHubHealth).mockReturnValue(
      makeHealth({ hubExists: false, hubTomlExists: false, totalFiles: 0, fileCountByCategory: {} }),
    );
    const result = await getOverview(DEFAULT_DEPS);
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
    const result = await getOverview(DEFAULT_DEPS);
    expect(result.hubInitialized).toBe(false);
    expect(result.assetStats.identity).toBe(0);
    expect(result.assetStats.agent).toBe(0);
  });

  it('不再返回假健康分（首页健康卡改读 /api/governance/health）', async () => {
    const result = await getOverview(DEFAULT_DEPS);
    expect(result).not.toHaveProperty('healthScore');
  });

  it('connections 中每项包含 status 字段', async () => {
    const result = await getOverview(DEFAULT_DEPS);
    expect(Array.isArray(result.connections)).toBe(true);
    for (const conn of result.connections) {
      expect(conn).toHaveProperty('toolId');
      expect(conn).toHaveProperty('toolName');
      expect(conn).toHaveProperty('status');
      expect(['synced', 'pending', 'not_connected', 'not_installed']).toContain(conn.status);
    }
  });

  it('recentActivities 返回数组', async () => {
    const result = await getOverview(DEFAULT_DEPS);
    expect(Array.isArray(result.recentActivities)).toBe(true);
  });

  it('recentActivities 来自事件日志（注入读取，最多 5 条）', async () => {
    const received: number[] = [];
    const result = await getOverview({
      ...DEFAULT_DEPS,
      recentActivities: (limit) => {
        received.push(limit);
        return [
          { id: 'a1', type: 'sync', description: '同步完成：1 个工具成功', occurredAt: '2026-11-11T10:00:00.000Z' },
        ];
      },
    });

    expect(received).toEqual([5]);
    expect(result.recentActivities).toHaveLength(1);
    expect(result.recentActivities[0]).toMatchObject({ id: 'a1', type: 'sync' });
  });

  it('连接状态由注入的适配器与配置派生，不读全局单例（H6）', async () => {
    const hubConfig = HubConfigSchema.parse({
      tools: { 'trae-cn': { enabled: true }, claude: { enabled: false } },
    });
    const result = await getOverview({
      adapters: [
        makeAdapter('trae-cn', 'TRAE CN', true),
        makeAdapter('claude', 'Claude', true),
        makeAdapter('ghost', 'Ghost', false),
      ],
      hubConfig,
    });
    const byId = new Map(result.connections.map((conn) => [conn.toolId, conn.status]));
    expect(byId.get('trae-cn')).toBe('synced');
    // 已安装但配置里未启用 → not_connected（不能死写成 synced）
    expect(byId.get('claude')).toBe('not_connected');
    expect(byId.get('ghost')).toBe('not_installed');
  });
});
