/**
 * GET /api/sync/scan 扩展接线测试（add-zero-config-onboarding T4）
 *
 * - 不传 insights：响应与旧行为一致（只有 inventories，无 insights 键）
 * - insights=1：响应带 insights（重复/不一致/覆盖/已安装工具）
 * hubContext 用 vi.mock 替换为假 engine，绝不触真实扫描。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ToolInventory } from '../../../src/core/types.js';

const { fakeEngine } = vi.hoisted(() => ({
  fakeEngine: { scanAll: vi.fn<() => Promise<ToolInventory[]>>(async () => []) },
}));

vi.mock('../../../src/server/lib/hub-context.js', () => ({
  hubContext: { getEngine: () => fakeEngine },
}));

import { syncRoutes } from '../../../src/server/routes/sync.js';

function fixtureInventory(): ToolInventory[] {
  return [
    {
      toolName: 'trae-cn',
      displayName: 'TRAE 中国版',
      installed: true,
      configDir: 'C:/fake/trae-cn',
      items: [
        {
          absolutePath: 'C:/fake/trae-cn/does-not-exist.md',
          relativePath: 'rules/always/commit.md',
          size: 10,
          modified: '2026-11-14T00:00:00.000Z',
          category: 'rule',
          hubTargetPath: 'rules/always/commit.md',
          conflict: 'none',
          tool: 'trae-cn',
          binary: false,
        },
      ],
    },
    {
      toolName: 'codex',
      displayName: 'OpenAI Codex',
      installed: true,
      configDir: 'C:/fake/codex',
      items: [],
    },
  ];
}

function buildApp(): Hono {
  const app = new Hono();
  app.route('/api/sync', syncRoutes);
  return app;
}

beforeEach(() => {
  fakeEngine.scanAll.mockReset();
  fakeEngine.scanAll.mockImplementation(async () => fixtureInventory());
});

describe('GET /api/sync/scan（T4 接线）', () => {
  it('不传 insights：只有 inventories，无 insights 键（回归）', async () => {
    const res = await buildApp().request('/api/sync/scan');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.inventories)).toBe(true);
    expect(body.insights).toBeUndefined();
  });

  it('insights=1：响应带 insights 且 installedTools 只含已安装工具', async () => {
    const res = await buildApp().request('/api/sync/scan?insights=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { insights?: { installedTools: string[]; duplicateGroups: unknown[] } };
    expect(body.insights).toBeDefined();
    expect(body.insights?.installedTools).toEqual(['trae-cn', 'codex']);
    // fixture 路径不存在 → 哈希不可读，重复组仍成立但不判不一致
    expect(body.insights?.duplicateGroups).toHaveLength(0);
    expect(body.insights?.coverageGroups).toHaveLength(1);
  });

  it('其他 insights 取值按缺省处理（不带 insights 键）', async () => {
    const res = await buildApp().request('/api/sync/scan?insights=0');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.insights).toBeUndefined();
  });
});
