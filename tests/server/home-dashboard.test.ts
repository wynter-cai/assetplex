/**
 * 首页聚合接口（refactor-home-action-panel T4）
 *
 * spec: specs/home-dashboard.spec.md Requirement 1/2/4/5/6/7
 * api-contract: GET /api/home/dashboard
 *
 * 全依赖注入：假 Hub 文件、假分发索引、假适配器、假活动日志、假备份探测，
 * 不碰真实目录与模型。
 */

import { describe, it, expect } from 'vitest';
import { createHomeRoutes, type HomeRouteDeps } from '../../src/server/routes/home.js';
import type { GovernanceSnapshot } from '../../src/server/lib/governance-snapshot.js';
import type { ToolAdapter } from '../../src/core/adapters/base.js';
import { HubConfigSchema, type HubConfig } from '../../src/core/config.js';
import type { DistributionIndexResponse } from '../../src/core/distribution-index.js';
import type { ActivityEntry, ActivityQuery } from '../../src/core/activity-log.js';
import type { BackupStatus } from '../../src/core/backup-status.js';

const NOW = '2026-11-15T02:00:00.000Z';
const GOOD = '---\nname: demo\ndescription: 演示用\n---\n正文\n';
const EMPTY_DESC = '---\nname: demo\ndescription: ""\n---\n正文\n';

function adapter(input: {
  name: string;
  displayName: string;
  installed: boolean;
  failDetect?: boolean;
}): ToolAdapter {
  return {
    name: input.name,
    displayName: input.displayName,
    detect: async () => {
      if (input.failDetect === true) throw new Error('检测失败');
      return {
        name: input.name,
        installed: input.installed,
        configDirExists: input.installed,
        configDir: `tools/${input.name}`,
      };
    },
    targets: () => [],
    resolveHubItems: () => [],
    apply: async () => {},
    import: async () => {
      throw new Error('本测试不使用 import');
    },
    scan: async () => [],
    transform: (content: Buffer) => content,
  };
}

function distribution(input: {
  index?: DistributionIndexResponse['index'];
  partial?: boolean;
  failedTools?: string[];
}): DistributionIndexResponse {
  return {
    generatedAt: NOW,
    partial: input.partial ?? false,
    failedTools: input.failedTools ?? [],
    index: input.index ?? {},
    projectTools: [],
    cached: false,
  };
}

function activity(input: {
  id: string;
  at: string;
  type: ActivityEntry['type'];
  summary: string;
  targets?: string[];
}): ActivityEntry {
  const entry: ActivityEntry = { id: input.id, at: input.at, type: input.type, actor: 'web', summary: input.summary };
  if (input.targets !== undefined) entry.targets = input.targets;
  return entry;
}

interface HarnessOptions {
  files?: Record<string, string>;
  libraryCount?: number;
  distribution?: DistributionIndexResponse | null;
  adapters?: ToolAdapter[];
  config?: HubConfig;
  activity?: ActivityEntry[];
  backup?: BackupStatus;
  /** 显式替换快照读取（模拟读取失败或观察 refresh 透传） */
  loadSnapshot?: (force: boolean) => Promise<GovernanceSnapshot>;
  aiConfigured?: () => boolean;
  onCacheLoad?: () => void;
}

function harness(options: HarnessOptions = {}) {
  const files = options.files ?? {};
  const config = options.config ?? HubConfigSchema.parse({});
  const distributionsCalls: boolean[] = [];
  const snapshotCalls: boolean[] = [];

  const injectedLoader = options.loadSnapshot;
  const deps: HomeRouteDeps = {
    listAssets: (kind) =>
      Object.keys(files).filter((path) => path.startsWith(`${kind === 'skill' ? 'skills' : kind}/`)),
    read: (path) => files[path] ?? null,
    aiConfigured: options.aiConfigured ?? (() => false),
    duplicateGroups: () => [],
    libraryCount: () => options.libraryCount ?? Object.keys(files).length,
    now: () => NOW,
    getDistributions: async (refresh) => {
      distributionsCalls.push(refresh);
      if (options.distribution === null) throw new Error('分发索引不可用');
      return options.distribution ?? distribution({});
    },
    listAdapters: () => options.adapters ?? [],
    getConfig: () => config,
    readActivity: (query: ActivityQuery) => {
      const filtered = (options.activity ?? []).filter(
        (entry) => query.type === undefined || entry.type === query.type,
      );
      return { items: filtered.slice(0, query.limit ?? 20), nextCursor: null };
    },
    backupStatus: () => options.backup ?? { state: 'none', lastBackupAt: null },
    ...(injectedLoader === undefined
      ? {}
      : {
          loadSnapshot: (force: boolean) => {
            snapshotCalls.push(force);
            return injectedLoader(force);
          },
        }),
    ...(options.onCacheLoad === undefined
      ? {}
      : {
          cache: {
            load: () => {
              options.onCacheLoad?.();
              return {};
            },
            save: () => {},
          },
        }),
  };

  const routes = createHomeRoutes(deps);
  const get = async (path: string) => {
    const response = await routes.request(path);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { get, distributionsCalls, snapshotCalls };
}

/** 观察 refresh 透传用的最小快照 */
function stubSnapshot(): GovernanceSnapshot {
  return {
    health: {
      score: 82,
      grade: 'good',
      totalAssets: 3,
      dimensions: [
        {
          id: 'distribution',
          label: '分发一致性',
          applicability: 'applicable',
          weight: 25,
          effectiveWeight: 25,
          score: 0,
          evaluatedAssets: 1,
          issueCount: 1,
          topIssues: [],
        },
      ],
      qualityMode: 'mechanical-only',
      computedAt: NOW,
      cached: false,
    },
    assets: [],
    groups: [],
  };
}

const NORMAL_ADAPTERS = [
  adapter({ name: 'claude-code', displayName: 'Claude Code', installed: true }),
  adapter({ name: 'codex', displayName: 'Codex', installed: true }),
  adapter({ name: 'workbuddy', displayName: 'WorkBuddy', installed: false }),
  adapter({ name: 'qoder', displayName: 'Qoder', installed: true }),
];

const NORMAL_CONFIG = HubConfigSchema.parse({
  tools: {
    'claude-code': { enabled: true },
    codex: { enabled: true },
    workbuddy: { enabled: true },
    qoder: { enabled: false },
  },
});

const NORMAL_FILES = {
  'identity/profile.md': GOOD,
  'skills/demo-a/SKILL.md': EMPTY_DESC,
  'rules/demo-rule.md': GOOD,
};

const NORMAL_DISTRIBUTION = distribution({
  index: {
    'skills/demo-a/SKILL.md': [{ toolId: 'claude-code', toolName: 'Claude Code', status: 'pending' }],
    'identity/profile.md': [{ toolId: 'codex', toolName: 'Codex', status: 'synced' }],
  },
});

const NORMAL_ACTIVITY = [
  activity({ id: 'a1', at: '2026-11-14T10:00:00.000Z', type: 'sync', summary: '同步完成', targets: ['claude-code'] }),
  activity({ id: 'a2', at: '2026-11-13T10:00:00.000Z', type: 'edit', summary: '编辑规则' }),
  activity({ id: 'a3', at: '2026-11-12T10:00:00.000Z', type: 'import', summary: '导入技能' }),
  activity({ id: 'a4', at: '2026-11-11T10:00:00.000Z', type: 'create', summary: '新增身份' }),
  activity({ id: 'a5', at: '2026-11-10T10:00:00.000Z', type: 'edit', summary: '改描述' }),
  activity({ id: 'a6', at: '2026-11-09T10:00:00.000Z', type: 'edit', summary: '早期改动' }),
];

function normalHarness(overrides: HarnessOptions = {}) {
  return harness({
    files: NORMAL_FILES,
    libraryCount: 5,
    adapters: NORMAL_ADAPTERS,
    config: NORMAL_CONFIG,
    distribution: NORMAL_DISTRIBUTION,
    activity: NORMAL_ACTIVITY,
    backup: { state: 'recorded', lastBackupAt: '2026-11-10T00:00:00.000Z' },
    ...overrides,
  });
}

describe('GET /api/home/dashboard — 正常装配', () => {
  it('状态条四个数字来自同一次快照', async () => {
    const { get } = normalHarness();
    const { status, body } = await get('/dashboard');
    expect(status).toBe(200);
    expect(body.generatedAt).toBe(NOW);
    expect(body.hubInitialized).toBe(true);
    expect(body.healthComputedAt).toBe(NOW);
    const numbers = body.status as Record<string, unknown>;
    expect(typeof numbers.healthScore).toBe('number');
    expect(numbers.healthGrade).not.toBe('empty');
    expect(numbers.totalAssets).toBe(5);
    expect(numbers.unsyncedCount).toBe(1);
    expect(numbers.lastBackupAt).toBe('2026-11-10T00:00:00.000Z');
    expect(numbers.backupState).toBe('recorded');
  });

  it('待办跨维度去重：机械项在完整性与规范性中各出现一次，只计一条', async () => {
    const { get } = normalHarness();
    const { body } = await get('/dashboard');
    const issues = body.issues as Record<string, unknown>;
    expect(issues.available).toBe(true);
    // 机械项 1 条（去重）+ 分发 pending 1 条 = 2
    expect(issues.total).toBe(2);
    expect(issues.bySeverity).toEqual({ high: 1, medium: 1, low: 0 });
    expect((issues.items as unknown[]).length).toBe(2);
  });

  it('工具矩阵：已同步 / 漂移 / 未连接 / 未安装四态齐全', async () => {
    const { get } = normalHarness();
    const { body } = await get('/dashboard');
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools.map((tool) => [tool.toolId, tool.state, tool.driftAssetCount])).toEqual([
      ['claude-code', 'drift', 1],
      ['codex', 'synced', 0],
      ['workbuddy', 'not_installed', 0],
      ['qoder', 'not_connected', 0],
    ]);
  });

  it('最近同步时间取活动日志；无记录为 null（不猜健康分/备份时间）', async () => {
    const { get } = normalHarness();
    const { body } = await get('/dashboard');
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0].lastSyncedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(tools[1].lastSyncedAt).toBeNull();
    expect(tools[2].lastSyncedAt).toBeNull();
  });

  it('最近变化固定 5 条，时间倒序', async () => {
    const { get } = normalHarness();
    const { body } = await get('/dashboard');
    const recent = body.recentActivity as Array<Record<string, unknown>>;
    expect(recent).toHaveLength(5);
    expect(recent.map((entry) => entry.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
    expect(body.partial).toBe(false);
    expect(body.failedTools).toEqual([]);
  });

  it('issuesLimit 只截断 items，total 仍为全量', async () => {
    const { get } = normalHarness();
    const { body } = await get('/dashboard?issuesLimit=1');
    const issues = body.issues as Record<string, unknown>;
    expect((issues.items as unknown[]).length).toBe(1);
    expect(issues.total).toBe(2);
  });
});

describe('GET /api/home/dashboard — 空态与降级', () => {
  it('库为空：hubInitialized=false、grade=empty、分数不填 0', async () => {
    const { get } = harness({ files: {}, libraryCount: 0, adapters: [] });
    const { body } = await get('/dashboard');
    expect(body.hubInitialized).toBe(false);
    const numbers = body.status as Record<string, unknown>;
    expect(numbers.healthGrade).toBe('empty');
    expect(numbers.healthScore).toBeNull();
    expect(numbers.totalAssets).toBe(0);
    expect(numbers.unsyncedCount).toBeNull();
    const issues = body.issues as Record<string, unknown>;
    expect(issues.available).toBe(true);
    expect(issues.total).toBe(0);
    expect((issues.items as unknown[]).length).toBe(0);
  });

  it('资产快照读取失败：只有待办与健康分降级，其余块正常', async () => {
    const { get } = normalHarness({
      loadSnapshot: async () => {
        throw new Error('资产快照不可读');
      },
    });
    const { status, body } = await get('/dashboard');
    expect(status).toBe(200);
    expect(body.issues).toEqual({ available: false, total: null, bySeverity: null, items: [] });
    const numbers = body.status as Record<string, unknown>;
    expect(numbers.healthScore).toBeNull();
    expect(numbers.healthGrade).toBeNull();
    expect(numbers.totalAssets).toBeNull();
    expect(numbers.unsyncedCount).toBeNull();
    expect(numbers.backupState).toBe('recorded');
    expect(body.healthComputedAt).toBeNull();
    expect((body.tools as unknown[]).length).toBe(4);
    expect((body.recentActivity as unknown[]).length).toBe(5);
  });

  it('分发索引整体不可读：不整体 500，未同步显示不可用', async () => {
    const { get } = normalHarness({ distribution: null });
    const { status, body } = await get('/dashboard');
    expect(status).toBe(200);
    const numbers = body.status as Record<string, unknown>;
    expect(numbers.unsyncedCount).toBeNull();
    const tools = body.tools as Array<Record<string, unknown>>;
    // 依赖分发索引的已连接工具降级为 unknown；未安装 / 未连接行状态仍可判定
    expect(tools.map((tool) => [tool.toolId, tool.state])).toEqual([
      ['claude-code', 'unknown'],
      ['codex', 'unknown'],
      ['workbuddy', 'not_installed'],
      ['qoder', 'not_connected'],
    ]);
    expect(tools[0].driftAssetCount).toBeNull();
  });

  it('部分工具读取失败：该工具 unknown 且计入 failedTools', async () => {
    const { get } = normalHarness({
      distribution: distribution({
        index: { 'identity/profile.md': [{ toolId: 'codex', toolName: 'Codex', status: 'synced' }] },
        partial: true,
        failedTools: ['claude-code'],
      }),
    });
    const { body } = await get('/dashboard');
    expect(body.partial).toBe(true);
    expect(body.failedTools).toEqual(['claude-code']);
    const tools = body.tools as Array<Record<string, unknown>>;
    const broken = tools.find((tool) => tool.toolId === 'claude-code');
    expect(broken?.state).toBe('unknown');
    expect(broken?.driftAssetCount).toBeNull();
    const healthy = tools.find((tool) => tool.toolId === 'codex');
    expect(healthy?.state).toBe('synced');
  });

  it('适配器检测抛错：该行 unknown，不拖垮整页', async () => {
    const { get } = normalHarness({
      adapters: [adapter({ name: 'claude-code', displayName: 'Claude Code', installed: true, failDetect: true })],
    });
    const { status, body } = await get('/dashboard');
    expect(status).toBe(200);
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0].state).toBe('unknown');
    expect(body.failedTools).toEqual(['claude-code']);
  });

  it('从未备份：backupState=none，时间为 null', async () => {
    const { get } = normalHarness({ backup: { state: 'none', lastBackupAt: null } });
    const { body } = await get('/dashboard');
    const numbers = body.status as Record<string, unknown>;
    expect(numbers.backupState).toBe('none');
    expect(numbers.lastBackupAt).toBeNull();
  });
});

describe('GET /api/home/dashboard — 入参与刷新', () => {
  it('issuesLimit 超出 1-20 或非整数 → 400', async () => {
    const { get } = normalHarness();
    expect((await get('/dashboard?issuesLimit=0')).status).toBe(400);
    expect((await get('/dashboard?issuesLimit=21')).status).toBe(400);
    expect((await get('/dashboard?issuesLimit=abc')).status).toBe(400);
    expect((await get('/dashboard?issuesLimit=20')).status).toBe(200);
  });

  it('refresh 只允许 0/1，其他 → 400', async () => {
    const { get } = normalHarness();
    expect((await get('/dashboard?refresh=2')).status).toBe(400);
    expect((await get('/dashboard?refresh=1')).status).toBe(200);
    expect((await get('/dashboard?refresh=0')).status).toBe(200);
  });

  it('refresh=1 同时绕过治理快照与分发索引缓存', async () => {
    const { get, distributionsCalls, snapshotCalls } = normalHarness({ loadSnapshot: async () => stubSnapshot() });
    await get('/dashboard');
    await get('/dashboard?refresh=1');
    expect(distributionsCalls).toEqual([false, true]);
    expect(snapshotCalls).toEqual([false, true]);
  });

  it('打开首页只读医生缓存，不发起模型调用', async () => {
    let loads = 0;
    const { get } = normalHarness({
      aiConfigured: () => true,
      onCacheLoad: () => {
        loads += 1;
      },
    });
    const { status } = await get('/dashboard');
    expect(status).toBe(200);
    expect(loads).toBeGreaterThan(0);
  });
});
