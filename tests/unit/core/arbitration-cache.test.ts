/**
 * 仲裁建议缓存单元测试（add-llm-conflict-arbitration B5）
 *
 * spec: specs/conflict-arbitration.spec.md Scenario 7
 * key = sha256(category+左+右+准则集哈希+model)；脏条目（手改 JSON）过滤不崩。
 */

import { describe, it, expect } from 'vitest';
import {
  computeArbitrationCacheKey,
  sanitizeArbitrationEntries,
  getArbitrationCached,
  saveArbitrationEntry,
  type ArbitrationCacheEntry,
  type ArbitrationCacheStore,
} from '../../../src/core/arbitration-cache.js';

function memStore(initial: Record<string, ArbitrationCacheEntry> = {}): ArbitrationCacheStore {
  let data = { ...initial };
  return {
    load: () => ({ ...data }),
    save: (entries) => {
      data = { ...entries };
    },
  };
}

const baseEntry: ArbitrationCacheEntry = {
  decision: 'keep-left',
  rationale: '导入版更新',
  model: 'demo-model',
  criteriaUsed: ['token-economy'],
  criteriaSkipped: 0,
  generatedAt: '2026-10-18T00:00:00.000Z',
};

describe('computeArbitrationCacheKey', () => {
  it('同输入必同 key（与传入顺序无关的确定性哈希）', () => {
    const a = computeArbitrationCacheKey({
      category: 'skill',
      left: 'L',
      right: 'R',
      criteriaHash: 'ch1',
      model: 'm',
    });
    const b = computeArbitrationCacheKey({
      category: 'skill',
      left: 'L',
      right: 'R',
      criteriaHash: 'ch1',
      model: 'm',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('任一要素变则 key 变：内容/准则集/模型/类别（Scenario 7 自然失效）', () => {
    const base = { category: 'skill' as const, left: 'L', right: 'R', criteriaHash: 'ch1', model: 'm' };
    const baseKey = computeArbitrationCacheKey(base);
    expect(computeArbitrationCacheKey({ ...base, left: 'L2' })).not.toBe(baseKey);
    expect(computeArbitrationCacheKey({ ...base, right: 'R2' })).not.toBe(baseKey);
    expect(computeArbitrationCacheKey({ ...base, criteriaHash: 'ch2' })).not.toBe(baseKey);
    expect(computeArbitrationCacheKey({ ...base, model: 'm2' })).not.toBe(baseKey);
    expect(computeArbitrationCacheKey({ ...base, category: 'rule' })).not.toBe(baseKey);
  });
});

describe('缓存存取与脏数据防御', () => {
  it('写入后可按 key 读回，往返字段无损', () => {
    const store = memStore();
    const key = computeArbitrationCacheKey({
      category: 'skill',
      left: 'L',
      right: 'R',
      criteriaHash: 'ch',
      model: 'm',
    });
    saveArbitrationEntry(store, key, baseEntry);
    expect(getArbitrationCached(store, key)).toEqual(baseEntry);
  });

  it('merge 条目携带草案往返；非 merge 携带草案视为脏丢弃', () => {
    const store = memStore();
    saveArbitrationEntry(store, 'k1', { ...baseEntry, decision: 'merge', mergedContent: '草案全文' });
    saveArbitrationEntry(store, 'k2', { ...baseEntry, decision: 'keep-left', mergedContent: '不应存在' });
    expect(getArbitrationCached(store, 'k1')?.mergedContent).toBe('草案全文');
    expect(getArbitrationCached(store, 'k2')).toBeNull();
  });

  it('增量写入不丢既有条目', () => {
    const store = memStore();
    saveArbitrationEntry(store, 'k1', baseEntry);
    saveArbitrationEntry(store, 'k2', { ...baseEntry, decision: 'manual-review' });
    expect(Object.keys(sanitizeArbitrationEntries(store.load()))).toHaveLength(2);
  });

  it('手改脏 JSON（闭集外 decision/字段残缺）被过滤，不影响合法条目', () => {
    const dirty = {
      good: baseEntry,
      bad1: { ...baseEntry, decision: 'keep-both' },
      bad2: { ...baseEntry, model: '' },
      bad3: 'not-an-object',
      bad4: { ...baseEntry, criteriaUsed: 'nope' },
    };
    const clean = sanitizeArbitrationEntries(dirty);
    expect(Object.keys(clean)).toEqual(['good']);
  });

  it('未命中返回 null；load 抛错形态不在此层处理（store 契约）', () => {
    const store = memStore();
    expect(getArbitrationCached(store, 'missing')).toBeNull();
  });
});
