import { describe, it, expect } from 'vitest';
import {
  ALL_FILTER_VALUE,
  ASSET_PAGE_SIZE,
  categoryOptionsFor,
  filterAssets,
  filterKey,
  paginate,
} from './asset-filter';
import { makeAsset, makeCategoryDescriptor, makeDistributionEntry } from './test-factories';
import type { AssetFilter } from './asset-filter';
import type { AssetCategoryDescriptor, AssetDistributionInfo } from '@/types/api';

/**
 * 「全部资产」的筛选与分页口径
 *
 * spec: asset-center-consistency Scenario 6（类别筛选 + 同步状态筛选 + 50 项/页）
 * 关联: fix-trust-and-consistency tasks I3
 */

const ruleAsset = makeAsset({ id: 'rules/a.md', name: '规则A', category: 'rule' });
const identityAsset = makeAsset({ id: 'identity/me.md', name: '身份', category: 'identity' });
const mcpAsset = makeAsset({ id: 'mcp/fs.json', name: 'MCP', category: 'mcp' });
const assets = [ruleAsset, identityAsset, mcpAsset];

function index(
  entries: Record<string, Array<Partial<AssetDistributionInfo> & { toolId: string }>>,
): Record<string, AssetDistributionInfo[]> {
  return Object.fromEntries(
    Object.entries(entries).map(([id, list]) => [id, list.map((e) => makeDistributionEntry(e))]),
  );
}

describe('filterAssets 类别筛选', () => {
  it('限定类别时只留该类别的资产', () => {
    const filtered = filterAssets(assets, {}, { category: 'rule', status: ALL_FILTER_VALUE });
    expect(filtered.map((a) => a.id)).toEqual(['rules/a.md']);
  });

  it('两个维度都不限时原样返回', () => {
    const all: AssetFilter = { category: ALL_FILTER_VALUE, status: ALL_FILTER_VALUE };
    expect(filterAssets(assets, index({}), all)).toHaveLength(3);
  });
});

describe('filterAssets 同步状态筛选', () => {
  it('任一工具命中该状态即入选', () => {
    const distIndex = index({
      'rules/a.md': [{ toolId: 'trae-cn', status: 'synced' }, { toolId: 'codex', status: 'pending' }],
      'identity/me.md': [{ toolId: 'trae-cn', status: 'pending' }],
    });

    expect(
      filterAssets(assets, distIndex, { category: ALL_FILTER_VALUE, status: 'synced' }).map((a) => a.id),
    ).toEqual(['rules/a.md']);
    expect(
      filterAssets(assets, distIndex, { category: ALL_FILTER_VALUE, status: 'pending' }).map((a) => a.id),
    ).toEqual(['rules/a.md', 'identity/me.md']);
  });

  it('索引里没有条目的资产，在任何状态筛选下都不出现（不拿「未知」冒充某一状态）', () => {
    const distIndex = index({ 'rules/a.md': [{ toolId: 'trae-cn', status: 'synced' }] });

    for (const status of ['synced', 'pending', 'conflict', 'not_enabled', 'not_installed'] as const) {
      const hit = filterAssets(assets, distIndex, { category: ALL_FILTER_VALUE, status });
      expect(hit.map((a) => a.id)).toEqual(status === 'synced' ? ['rules/a.md'] : []);
    }
  });

  it('类别与状态叠加时取交集', () => {
    const distIndex = index({
      'rules/a.md': [{ toolId: 'trae-cn', status: 'synced' }],
      'mcp/fs.json': [{ toolId: 'trae-cn', status: 'synced' }],
    });

    expect(
      filterAssets(assets, distIndex, { category: 'rule', status: 'synced' }).map((a) => a.id),
    ).toEqual(['rules/a.md']);
  });
});

describe('categoryOptionsFor 类别下拉选项', () => {
  const declared: AssetCategoryDescriptor[] = [
    makeCategoryDescriptor({ code: 'rule', label: '规则', order: 30 }),
    makeCategoryDescriptor({ code: 'identity', label: '身份', order: 10 }),
    makeCategoryDescriptor({ code: 'criteria', label: '裁决准则', order: 60, external: true }),
  ];

  it('只列实际出现在列表里的类别，并按声明源 order 排序', () => {
    const options = categoryOptionsFor([ruleAsset, identityAsset], declared);
    expect(options).toEqual([
      { code: 'identity', label: '身份' },
      { code: 'rule', label: '规则' },
    ]);
  });

  it('列表里没有的类别不给选项（给了也筛不出东西）', () => {
    expect(categoryOptionsFor([ruleAsset], declared).map((o) => o.code)).toEqual(['rule']);
  });

  it('声明源认不出的新类别用代码本身作 label，不编中文名', () => {
    const future = makeAsset({ id: 'commands/x.md', category: 'command' });
    expect(categoryOptionsFor([future], declared)).toEqual([{ code: 'command', label: 'command' }]);
  });

  it('同一类别只出现一次', () => {
    const options = categoryOptionsFor([ruleAsset, makeAsset({ id: 'rules/b.md' })], declared);
    expect(options).toEqual([{ code: 'rule', label: '规则' }]);
  });
});

describe('paginate 分页', () => {
  const many = Array.from({ length: 120 }, (_, i) => makeAsset({ id: `rules/r${i}.md`, name: `规则${i}` }));

  it('按 50 项/页切分，末页只剩余数', () => {
    expect(ASSET_PAGE_SIZE).toBe(50);
    const p1 = paginate(many, 1);
    expect(p1.items).toHaveLength(50);
    expect(p1.totalPages).toBe(3);
    expect(p1.total).toBe(120);
    expect({ start: p1.rangeStart, end: p1.rangeEnd }).toEqual({ start: 1, end: 50 });

    expect(paginate(many, 3).items).toHaveLength(20);
    expect(paginate(many, 3).rangeStart).toBe(101);
  });

  it('页码越界钳制到首尾页，空列表也算 1 页', () => {
    expect(paginate(many, 99).page).toBe(3);
    expect(paginate(many, 0).page).toBe(1);

    const empty = paginate([], 4);
    expect(empty.items).toEqual([]);
    expect(empty.totalPages).toBe(1);
    expect(empty.rangeStart).toBe(0);
  });
});

describe('filterKey 筛选变化', () => {
  it('类别、状态、搜索、锁定类别任一变化都会产生新 key（据此回到第 1 页）', () => {
    const base = filterKey({ category: ALL_FILTER_VALUE, status: ALL_FILTER_VALUE }, '', null);
    expect(filterKey({ category: 'rule', status: ALL_FILTER_VALUE }, '', null)).not.toBe(base);
    expect(filterKey({ category: ALL_FILTER_VALUE, status: 'synced' }, '', null)).not.toBe(base);
    expect(filterKey({ category: ALL_FILTER_VALUE, status: ALL_FILTER_VALUE }, 'demo', null)).not.toBe(base);
    expect(filterKey({ category: ALL_FILTER_VALUE, status: ALL_FILTER_VALUE }, '', 'rule')).not.toBe(base);
  });

  it('同样的输入得到同样的 key（翻页不该被误判成筛选变化）', () => {
    const args = [{ category: 'rule', status: 'synced' }, 'demo', 'rule'] as const;
    expect(filterKey(...args)).toBe(filterKey(...args));
  });
});
