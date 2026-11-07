/**
 * 连接页工具详情三口径计数测试（fix-trust-and-consistency I4）
 *
 * spec: asset-center-consistency
 * - Scenario 2 计数一致：界面数字必须能对应「我的库 / 已同步 / 可收藏」三口径之一
 * - Scenario 3 已同步数来自真实状态：已同步取自分发索引，未安装工具不得出现已同步数字
 *
 * 关联: proposal D3（项目级工具不进单资产口径）/ D4（四口径显式命名）
 */

import { describe, it, expect } from 'vitest';
import { buildToolAssetCounts } from '../../../src/server/lib/tool-asset-counts.js';
import type { DistributionIndexPayload } from '../../../src/core/distribution-index.js';
import { toolsRoutesFactory } from '../../../src/server/routes/tools.js';
import type { ToolsRouteDeps } from '../../../src/server/routes/tools.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import type { DiscoveredItem } from '../../../src/core/types.js';
import { HubConfigSchema } from '../../../src/core/config.js';

const SKILL_A = 'skills/demo-skill/SKILL.md';
const SKILL_B = 'skills/other-skill/SKILL.md';
const RULE_A = 'rules/demo-rule.md';

/** 只填必要字段的状态索引夹具 */
function payload(
  index: DistributionIndexPayload['index'],
  projectTools: DistributionIndexPayload['projectTools'] = [],
): DistributionIndexPayload {
  return {
    generatedAt: '2026-10-26T00:00:00.000Z',
    partial: false,
    failedTools: [],
    index,
    projectTools,
  };
}

function discovered(
  category: DiscoveredItem['category'],
  hubTargetPath: string,
  conflict: DiscoveredItem['conflict'],
): DiscoveredItem {
  return {
    absolutePath: `/tools/x/${hubTargetPath}`,
    relativePath: hubTargetPath,
    size: 10,
    modified: '2026-10-26T00:00:00.000Z',
    category,
    hubTargetPath,
    conflict,
    tool: 'trae-cn',
    binary: false,
  };
}

const LIBRARY = [
  { id: SKILL_A, category: 'skill' },
  { id: SKILL_B, category: 'skill' },
  { id: RULE_A, category: 'rule' },
];

describe('buildToolAssetCounts 三口径', () => {
  it('已同步只数该工具的 synced，别的工具与 pending/conflict 不算', () => {
    const counts = buildToolAssetCounts({
      toolId: 'trae-cn',
      installed: true,
      assets: LIBRARY,
      discovered: [],
      distribution: payload({
        [SKILL_A]: [
          { toolId: 'trae-cn', toolName: 'TRAE', status: 'synced' },
          { toolId: 'workbuddy', toolName: 'WB', status: 'synced' },
        ],
        [SKILL_B]: [{ toolId: 'trae-cn', toolName: 'TRAE', status: 'pending' }],
        [RULE_A]: [{ toolId: 'trae-cn', toolName: 'TRAE', status: 'conflict' }],
      }),
    });
    expect(counts.byCategory.skill).toEqual({ library: 2, synced: 1, pendingImport: 0 });
    expect(counts.byCategory.rule).toEqual({ library: 1, synced: 0, pendingImport: 0 });
  });

  it('可收藏＝扫到且不在我的库（conflict=none），已一致与有差异都不算', () => {
    const counts = buildToolAssetCounts({
      toolId: 'trae-cn',
      installed: true,
      assets: LIBRARY,
      distribution: payload({}),
      discovered: [
        discovered('skill', SKILL_A, 'exists'),
        discovered('skill', 'skills/brand-new/SKILL.md', 'none'),
        discovered('skill', 'skills/edited/SKILL.md', 'none'),
        discovered('rule', RULE_A, 'differs'),
        discovered('identity', 'identity/profile.md', 'none'),
      ],
    });
    expect(counts.byCategory.skill.pendingImport).toBe(2);
    expect(counts.byCategory.rule.pendingImport).toBe(0);
    expect(counts.byCategory.identity.pendingImport).toBe(1);
  });

  it('同一目标路径被重复扫到只计一次', () => {
    const counts = buildToolAssetCounts({
      toolId: 'trae-cn',
      installed: true,
      assets: [],
      distribution: payload({}),
      discovered: [
        discovered('skill', 'skills/brand-new/SKILL.md', 'none'),
        discovered('skill', 'skills/brand-new/SKILL.md', 'none'),
      ],
    });
    expect(counts.byCategory.skill.pendingImport).toBe(1);
  });

  it('未安装工具：已同步与可收藏一律 0，我的库仍照报', () => {
    const counts = buildToolAssetCounts({
      toolId: 'codex',
      installed: false,
      assets: LIBRARY,
      distribution: payload({
        [SKILL_A]: [{ toolId: 'codex', toolName: 'Codex', status: 'synced' }],
      }),
      discovered: [],
    });
    expect(counts.byCategory.skill).toEqual({ library: 2, synced: 0, pendingImport: 0 });
  });

  it('项目级工具：报已接入项目数，不产出单资产已同步口径（D3）', () => {
    const counts = buildToolAssetCounts({
      toolId: 'qoder',
      installed: true,
      assets: LIBRARY,
      distribution: payload({}, [{ toolId: 'qoder', toolName: 'Qoder', projectCount: 3 }]),
      discovered: [],
    });
    expect(counts.projectCount).toBe(3);
    expect(counts.byCategory.skill.synced).toBe(0);
  });

  it('项目级工具 syncStrategy=per-project + 0 项目仍报 projectCount:0（I7 修复 I4 遗留）', () => {
    const counts = buildToolAssetCounts({
      toolId: 'qoder',
      installed: true,
      assets: LIBRARY,
      distribution: payload({}),
      discovered: [],
      syncStrategy: 'per-project',
    });
    expect(counts.projectCount).toBe(0);
    expect(counts.byCategory.skill.synced).toBe(0);
  });

  it('非项目级工具 projectCount 为 null，界面据此渲染逐类数字', () => {
    const counts = buildToolAssetCounts({
      toolId: 'trae-cn',
      installed: true,
      assets: LIBRARY,
      distribution: payload({}),
      discovered: [],
    });
    expect(counts.projectCount).toBeNull();
  });

  it('未纳入声明源的类别（memory）不丢计数', () => {
    const counts = buildToolAssetCounts({
      toolId: 'trae-cn',
      installed: true,
      assets: [{ id: 'memory/notes.md', category: 'memory' }],
      distribution: payload({
        'memory/notes.md': [{ toolId: 'trae-cn', toolName: 'TRAE', status: 'synced' }],
      }),
      discovered: [],
    });
    expect(counts.byCategory.memory).toEqual({ library: 1, synced: 1, pendingImport: 0 });
  });

  it('索引整体降级时透出 partial 与失败工具，不静默抹平', () => {
    const degraded = {
      ...payload({}),
      partial: true,
      failedTools: ['workbuddy'],
    };
    const counts = buildToolAssetCounts({
      toolId: 'trae-cn',
      installed: true,
      assets: LIBRARY,
      distribution: degraded,
      discovered: [],
    });
    expect(counts.partial).toBe(true);
    expect(counts.failedTools).toEqual(['workbuddy']);
    expect(counts.generatedAt).toBe(degraded.generatedAt);
  });
});

// ========== 路由接线 ==========

function makeAdapter(over: Partial<ToolAdapter> & { name: string }): ToolAdapter {
  return {
    displayName: over.name,
    async detect() {
      return { name: over.name, installed: true, configDirExists: true, configDir: '/tools/x' };
    },
    targets: () => [],
    resolveHubItems: () => [],
    async apply() {},
    async import() {
      return { type: 'identity', relativePath: '', absolutePath: '' };
    },
    async scan() {
      return [];
    },
    transform: (content: Buffer) => content,
    ...over,
  } as ToolAdapter;
}

function makeRoutes(over: Partial<ToolsRouteDeps> = {}, adapter?: ToolAdapter) {
  const deps: ToolsRouteDeps = {
    getAdapter: () => adapter ?? makeAdapter({ name: 'trae-cn' }),
    listAdapters: () => [],
    getConfig: () => HubConfigSchema.parse({}),
    saveConfig: () => {},
    listAssets: async () => ({ items: LIBRARY, total: LIBRARY.length }),
    getDistributions: async () => ({
      ...payload({ [SKILL_A]: [{ toolId: 'trae-cn', toolName: 'TRAE', status: 'synced' }] }),
      cached: false,
    }),
    ...over,
  };
  return toolsRoutesFactory(deps);
}

describe('GET /tools/:name/detail 三口径接线', () => {
  it('返回按类别的三口径计数，来自服务端而非前端统计', async () => {
    const routes = makeRoutes();
    const res = await routes.request('/trae-cn/detail');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      assetCounts: { byCategory: Record<string, { library: number; synced: number; pendingImport: number }> };
    };
    expect(body.assetCounts.byCategory.skill).toEqual({ library: 2, synced: 1, pendingImport: 0 });
    expect(body.assetCounts.byCategory.rule).toEqual({ library: 1, synced: 0, pendingImport: 0 });
  });

  it('发现的资产列表只含可收藏条目，与计数同一口径', async () => {
    const adapter = makeAdapter({
      name: 'trae-cn',
      async scan() {
        return [
          discovered('skill', SKILL_A, 'exists'),
          discovered('skill', 'skills/brand-new/SKILL.md', 'none'),
        ];
      },
    });
    const routes = makeRoutes({}, adapter);
    const body = (await (await routes.request('/trae-cn/detail')).json()) as {
      discovered: { skills: Array<{ path: string; size: number }> };
      assetCounts: { byCategory: Record<string, { pendingImport: number }> };
    };
    expect(body.discovered.skills).toHaveLength(1);
    expect(body.discovered.skills[0]?.path).toContain('brand-new');
    expect(body.assetCounts.byCategory.skill.pendingImport).toBe(1);
  });

  it('未安装工具：不返回发现列表，已同步为 0', async () => {
    const adapter = makeAdapter({
      name: 'codex',
      async detect() {
        return { name: 'codex', installed: false, configDirExists: false, configDir: '/tools/codex' };
      },
      async scan() {
        return [discovered('skill', 'skills/brand-new/SKILL.md', 'none')];
      },
    });
    const routes = makeRoutes({}, adapter);
    const body = (await (await routes.request('/codex/detail')).json()) as {
      discovered?: unknown;
      assetCounts: { byCategory: Record<string, { library: number; synced: number; pendingImport: number }> };
    };
    expect(body.discovered).toBeUndefined();
    expect(body.assetCounts.byCategory.skill).toEqual({ library: 2, synced: 0, pendingImport: 0 });
  });

  it('索引读取失败时 assetCounts 为 null，绝不编造数字', async () => {
    const routes = makeRoutes({
      getDistributions: async () => {
        throw new Error('索引失败');
      },
    });
    const body = (await (await routes.request('/trae-cn/detail')).json()) as {
      assetCounts: unknown;
      tool: { name: string };
    };
    expect(body.assetCounts).toBeNull();
    expect(body.tool.name).toBe('trae-cn');
  });

  it('未知工具仍返回 404', async () => {
    const routes = makeRoutes({ getAdapter: () => undefined });
    const res = await routes.request('/ghost/detail');
    expect(res.status).toBe(404);
  });
});
