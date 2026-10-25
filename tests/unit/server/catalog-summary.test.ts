/**
 * 目录/分发接口与计数汇总测试
 *
 * spec: asset-center-consistency（Scenario 2 计数一致 / Scenario 3 已同步来自真实状态）
 * 关联: fix-trust-and-consistency tasks H4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCatalogRoutes } from '../../../src/server/routes/catalog.js';
import { buildCounts, alignAssetStats } from '../../../src/server/lib/distribution-context.js';
import { resetDistributionIndexCache } from '../../../src/core/distribution-index.js';
import type { DistributionIndexDeps, DistributionIndexPayload } from '../../../src/core/distribution-index.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import type { HubItem, SyncTarget } from '../../../src/core/types.js';

function makeAdapter(name: string, installed: boolean, hubDir: string, targetPath: string): ToolAdapter {
  const pairs: Array<{ item: HubItem; target: SyncTarget }> = [
    {
      item: { type: 'skill', relativePath: hubDir, absolutePath: `/hub/${hubDir}` },
      target: { tool: name, targetPath, strategy: 'symlink', isDirectory: true },
    },
  ];
  return {
    name,
    displayName: name.toUpperCase(),
    async detect() {
      return { name, installed, configDirExists: installed, configDir: '' };
    },
    targets() {
      return pairs.map((pair) => pair.target);
    },
    resolveHubItems() {
      return pairs;
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

const deps: DistributionIndexDeps = {
  tools: [{ adapter: makeAdapter('tool-offline', false, 'skills', '/tmp/a/skills'), enabled: true }],
  hubConfig: HubConfigSchema.parse({}),
  hubRoot: '/hub',
  assets: [{ id: 'skills/demo-skill/SKILL.md', hubPath: 'skills/demo-skill/SKILL.md', category: 'skill' }],
};

describe('GET /api/asset-categories', () => {
  it('返回声明源与版本，不含图标等前端专属字段', async () => {
    const routes = createCatalogRoutes({ loadDeps: async () => deps });
    const res = await routes.request('/asset-categories');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: Array<Record<string, unknown>>; declaredAt: string };
    expect(body.categories).toHaveLength(6);
    expect(body.declaredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.categories[0]).not.toHaveProperty('icon');
  });
});

describe('GET /api/distributions', () => {
  // 索引缓存是模块级状态，用例之间必须复位，否则「命中缓存」断言会被前一个用例污染
  beforeEach(() => {
    resetDistributionIndexCache();
  });

  it('返回状态索引，未安装工具为 not_installed', async () => {
    const routes = createCatalogRoutes({ loadDeps: async () => deps });
    const res = await routes.request('/distributions?refresh=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      index: Record<string, Array<{ toolId: string; status: string }>>;
      cached: boolean;
      partial: boolean;
    };
    expect(body.index['skills/demo-skill/SKILL.md']?.[0]?.status).toBe('not_installed');
    expect(body.cached).toBe(false);
    expect(body.partial).toBe(false);
  });

  it('第二次请求命中缓存，refresh=1 强制重算', async () => {
    const routes = createCatalogRoutes({ loadDeps: async () => deps });
    await routes.request('/distributions?refresh=1');
    const cachedRes = await routes.request('/distributions');
    expect(((await cachedRes.json()) as { cached: boolean }).cached).toBe(true);
    const freshRes = await routes.request('/distributions?refresh=1');
    expect(((await freshRes.json()) as { cached: boolean }).cached).toBe(false);
  });

  it('refresh 参数非法时返回 400，不静默忽略', async () => {
    const routes = createCatalogRoutes({ loadDeps: async () => deps });
    const res = await routes.request('/distributions?refresh=yes');
    expect(res.status).toBe(400);
  });

  it('索引整体失败返回 500，不返回半真半假的状态', async () => {
    const routes = createCatalogRoutes({
      loadDeps: async () => {
        throw new Error('配置损坏');
      },
    });
    const res = await routes.request('/distributions?refresh=1');
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain('配置损坏');
  });
});

describe('buildCounts 计数口径', () => {
  const items = [
    { id: 'skills/demo-skill/SKILL.md', category: 'skill' },
    { id: 'skills/other-skill/SKILL.md', category: 'skill' },
    { id: 'rules/demo-rule.md', category: 'rule' },
  ];

  const distribution: DistributionIndexPayload = {
    generatedAt: '2026-10-25T00:00:00.000Z',
    partial: false,
    failedTools: [],
    index: {
      'skills/demo-skill/SKILL.md': [
        { toolId: 'tool-a', toolName: 'A', status: 'synced' },
        { toolId: 'tool-b', toolName: 'B', status: 'pending' },
      ],
      'skills/other-skill/SKILL.md': [{ toolId: 'tool-a', toolName: 'A', status: 'synced' }],
      'rules/demo-rule.md': [{ toolId: 'tool-a', toolName: 'A', status: 'conflict' }],
      // 未入库资产出现在索引中也不参与计数
      'skills/ghost/SKILL.md': [{ toolId: 'tool-a', toolName: 'A', status: 'synced' }],
    },
    projectTools: [{ toolId: 'tool-per-project', toolName: 'P', projectCount: 2 }],
  };

  it('我的库按类别计数，六类齐全且互不串类', () => {
    const { counts } = buildCounts(items, distribution);
    expect(counts.skill.library).toBe(2);
    expect(counts.rule.library).toBe(1);
    expect(counts.identity.library).toBe(0);
    expect(Object.keys(counts)).toHaveLength(6);
  });

  it('已同步数只数 synced，并带类别细分', () => {
    const { toolSynced } = buildCounts(items, distribution);
    expect(toolSynced).toEqual([
      { toolId: 'tool-a', total: 2, byCategory: { skill: 2 } },
    ]);
  });

  it('阶段 0 的环境/可收藏口径为 0，界面不得据此展示真值', () => {
    const { counts } = buildCounts(items, distribution);
    expect(counts.skill.environment).toBe(0);
    expect(counts.skill.pendingImport).toBe(0);
  });

  it('overview.assetStats 与 counts.library 同源，未纳入声明源的类别保留原值', () => {
    const { counts } = buildCounts(items, distribution);
    const raw = { identity: 9, skill: 87, rule: 12, mcp: 3, agent: 5, memory: 2 };
    expect(alignAssetStats(raw, counts)).toEqual({
      identity: 0,
      skill: 2,
      rule: 1,
      mcp: 0,
      agent: 0,
      // memory 尚未进声明源（阶段 1），无同源计数→不强行改写，避免用错口径冒充真值
      memory: 2,
    });
  });
});
