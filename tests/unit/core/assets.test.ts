/**
 * 资产服务测试
 *
 * spec: vault-page R2, R3
 * api-contract: ListAssetsApi, GetAssetApi
 */

import { describe, it, expect, vi } from 'vitest';

// mock hub-files
vi.mock('../../../src/core/hub-files.js', () => ({
  listHubFiles: vi.fn((category: string) => {
    // 模拟各类别下的文件
    const files: Record<string, Array<{ relativePath: string; size: number; modified: string; isDirectory: boolean; absolutePath: string }>> = {
      identity: [
        { relativePath: 'identity/profile.md', size: 1200, modified: '2026-08-14T10:00:00Z', isDirectory: false, absolutePath: '/hub/identity/profile.md' },
      ],
      skills: [
        { relativePath: 'skills/react-expert.md', size: 3400, modified: '2026-08-15T08:30:00Z', isDirectory: false, absolutePath: '/hub/skills/react-expert.md' },
        { relativePath: 'skills/typescript.md', size: 2100, modified: '2026-08-13T14:00:00Z', isDirectory: false, absolutePath: '/hub/skills/typescript.md' },
        { relativePath: 'skills/node-backend.md', size: 2800, modified: '2026-08-12T09:00:00Z', isDirectory: false, absolutePath: '/hub/skills/node-backend.md' },
      ],
      rules: [
        { relativePath: 'rules/coding-style.md', size: 800, modified: '2026-08-14T16:00:00Z', isDirectory: false, absolutePath: '/hub/rules/coding-style.md' },
      ],
      mcp: [
        { relativePath: 'mcp/servers.json', size: 500, modified: '2026-08-10T12:00:00Z', isDirectory: false, absolutePath: '/hub/mcp/servers.json' },
      ],
      preferences: [],
      commands: [],
      agents: [],
    };
    return files[category] ?? [];
  }),
  readHubFile: vi.fn((path: string) => {
    if (path === 'identity/profile.md') return { content: '# Profile\n我是开发者', size: 1200, modified: '2026-08-14T10:00:00Z' };
    return null;
  }),
  HUB_CATEGORIES: ['identity', 'skills', 'rules', 'preferences', 'mcp', 'commands', 'agents'],
}));

vi.mock('../../../src/server/lib/hub-context.js', () => ({
  hubContext: {
    getConfig: () => ({ tools: {} }),
    getAllAdapters: () => [],
  },
}));

import { listAssets, getAsset } from '../../../src/core/assets.js';

describe('listAssets', () => {
  it('返回指定类别的资产列表', async () => {
    const result = await listAssets({ category: 'skill' });
    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    // 验证字段
    const first = result.items[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('category');
    expect(first.category).toBe('skill');
    expect(first).toHaveProperty('hubPath');
    expect(first).toHaveProperty('source');
    expect(first).toHaveProperty('size');
    expect(first).toHaveProperty('lastModifiedAt');
    expect(first).toHaveProperty('distributions');
    expect(Array.isArray(first.distributions)).toBe(true);
  });

  it('无 category 参数时返回所有类别的资产', async () => {
    const result = await listAssets();
    // identity(1) + skills(3) + rules(1) + mcp(1) = 6
    expect(result.total).toBe(6);
    expect(result.items).toHaveLength(6);
  });

  it('搜索过滤：只返回名称匹配的资产', async () => {
    const result = await listAssets({ search: 'react' });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].name.toLowerCase()).toContain('react');
  });

  it('搜索无结果返回空数组', async () => {
    const result = await listAssets({ search: 'nonexistent_xyz_123' });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('资产类别正确映射（后端复数→前端单数）', async () => {
    const result = await listAssets({ category: 'identity' });
    expect(result.items[0].category).toBe('identity');
    const rules = await listAssets({ category: 'rule' });
    expect(rules.items[0].category).toBe('rule');
    const mcp = await listAssets({ category: 'mcp' });
    expect(mcp.items[0].category).toBe('mcp');
  });
});

describe('getAsset', () => {
  it('返回资产详情含 content', async () => {
    const result = await getAsset('identity/profile.md');
    expect(result).not.toBeNull();
    expect(result!.hubPath).toBe('identity/profile.md');
    expect(result!.name).toBe('profile');
    expect(result!.content).toContain('Profile');
  });

  it('不存在的资产返回 null', async () => {
    const result = await getAsset('nonexistent/file.md');
    expect(result).toBeNull();
  });
});
